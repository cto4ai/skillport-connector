/**
 * GitHub API client using service token
 * Fetches Plugin Marketplace data from configured repository
 */

import { AccessConfig, DEFAULT_ACCESS_CONFIG } from "./access-control";

export interface Marketplace {
  name: string;
  owner: { name: string; email: string };
  metadata?: { description?: string; version?: string };
  plugins: PluginEntry[];
  _skillport?: { version: string; features: string[] };
}

export interface PluginEntry {
  name: string;
  source: string;
  description?: string;
  version?: string;
  author?: { name: string; email?: string };
  // Official plugin metadata fields
  category?: string;
  tags?: string[];
  keywords?: string[];
}

export interface PluginManifest {
  name: string;
  version: string;
  description?: string;
  author?: { name: string; email?: string };
  homepage?: string;
  license?: string;
  keywords?: string[];
}

export interface SkillFile {
  path: string;
  content: string;
  encoding?: "base64";
}

export interface SkillEntry {
  name: string;
  dirName: string; // Directory name for path lookups (may differ from display name)
  plugin: string;
  description: string;
  version: string;
  author?: { name: string; email?: string };
  // Inherited from parent plugin
  category?: string;
  tags?: string[];
  keywords?: string[];
  // Whether the skill's plugin is in marketplace.json
  published: boolean;
}

/**
 * Parse SKILL.md frontmatter to extract name and description
 * Handles both LF and CRLF line endings
 */
export function parseSkillFrontmatter(content: string): { name?: string; description?: string } {
  // Normalize line endings to LF for consistent parsing
  const normalized = content.replace(/\r\n/g, '\n');

  const match = normalized.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const frontmatter = match[1];
  const result: { name?: string; description?: string } = {};

  const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
  if (nameMatch) {
    result.name = nameMatch[1].trim();
  }

  const descMatch = frontmatter.match(/^description:\s*>?\s*\n?([\s\S]*?)(?=\n[a-z]+:|$)/im);
  if (descMatch) {
    result.description = descMatch[1].trim().replace(/\n\s*/g, ' ');
  } else {
    const singleDescMatch = frontmatter.match(/^description:\s*(.+)$/m);
    if (singleDescMatch) {
      result.description = singleDescMatch[1].trim();
    }
  }

  return result;
}

interface GitHubContentItem {
  name: string;
  path: string;
  type: "file" | "dir";
  size: number;
}

const BINARY_EXTENSIONS = [
  ".png", ".jpg", ".jpeg", ".gif", ".ico", ".webp",
  ".pdf", ".zip", ".tar", ".gz",
  ".woff", ".woff2", ".ttf", ".eot"
];

function isBinaryFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  return BINARY_EXTENSIONS.some(ext => lower.endsWith(ext));
}

const GITHUB_API = "https://api.github.com";

/**
 * Parse semver string into comparable parts
 * Handles: "1.0.0", "1.0", "1", "1.0.0-beta.1"
 */
function parseSemver(version: string): { major: number; minor: number; patch: number; prerelease: string } {
  const [mainPart, prerelease = ""] = version.split("-");
  const parts = mainPart.split(".").map(p => parseInt(p, 10) || 0);
  return {
    major: parts[0] || 0,
    minor: parts[1] || 0,
    patch: parts[2] || 0,
    prerelease,
  };
}

/**
 * Compare two semver versions
 * Returns: -1 if a < b, 0 if a == b, 1 if a > b
 */
function compareSemver(a: string, b: string): number {
  const va = parseSemver(a);
  const vb = parseSemver(b);

  // Compare major.minor.patch
  if (va.major !== vb.major) return va.major < vb.major ? -1 : 1;
  if (va.minor !== vb.minor) return va.minor < vb.minor ? -1 : 1;
  if (va.patch !== vb.patch) return va.patch < vb.patch ? -1 : 1;

  // Prerelease versions have lower precedence than release
  // e.g., 1.0.0-beta < 1.0.0
  if (va.prerelease && !vb.prerelease) return -1;
  if (!va.prerelease && vb.prerelease) return 1;

  // Both have prerelease, compare lexically
  if (va.prerelease && vb.prerelease) {
    return va.prerelease < vb.prerelease ? -1 : va.prerelease > vb.prerelease ? 1 : 0;
  }

  return 0;
}

export class GitHubClient {
  private token: string;
  private repo: string;
  private kv: KVNamespace;

  constructor(token: string, repo: string, kv: KVNamespace) {
    this.token = token;
    this.repo = repo;
    this.kv = kv;
  }

  /**
   * List contents of a directory
   */
  private async listDirectory(dirPath: string): Promise<GitHubContentItem[]> {
    const response = await fetch(
      `${GITHUB_API}/repos/${this.repo}/contents/${dirPath}`,
      {
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "Skillport-Connector/1.0",
        },
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Directory not found: ${dirPath}`);
      }
      throw new Error(`GitHub API error: ${response.status}`);
    }

    return response.json() as Promise<GitHubContentItem[]>;
  }

  /**
   * Recursively fetch all files in a directory
   */
  private async fetchDirectoryRecursive(
    dirPath: string,
    basePath: string
  ): Promise<SkillFile[]> {
    const items = await this.listDirectory(dirPath);
    const files: SkillFile[] = [];

    for (const item of items) {
      if (item.type === "file") {
        const relativePath = item.path.replace(basePath + "/", "");

        if (isBinaryFile(item.name)) {
          // Fetch binary file as base64
          const content = await this.fetchFileBase64(item.path);
          files.push({ path: relativePath, content, encoding: "base64" });
        } else {
          // Fetch text file
          const content = await this.fetchFile(item.path);
          files.push({ path: relativePath, content });
        }
      } else if (item.type === "dir") {
        // Recurse into subdirectory
        const subFiles = await this.fetchDirectoryRecursive(item.path, basePath);
        files.push(...subFiles);
      }
    }

    return files;
  }

  /**
   * Recursively list all file paths in a directory (without fetching content)
   */
  private async listDirectoryRecursive(
    dirPath: string,
    basePath: string
  ): Promise<string[]> {
    const items = await this.listDirectory(dirPath);
    const paths: string[] = [];

    for (const item of items) {
      if (item.type === "file") {
        const relativePath = item.path.replace(basePath + "/", "");
        paths.push(relativePath);
      } else if (item.type === "dir") {
        const subPaths = await this.listDirectoryRecursive(item.path, basePath);
        paths.push(...subPaths);
      }
    }

    return paths;
  }

  /**
   * List all files in a skill directory (paths only, no content)
   */
  async listSkillFiles(skillName: string): Promise<string[]> {
    const skill = await this.getSkill(skillName);
    if (!skill) {
      throw new Error(`Skill not found: ${skillName}`);
    }

    const fullSkillDir = `plugins/${skill.plugin}/skills/${skill.dirName}`;
    return this.listDirectoryRecursive(fullSkillDir, fullSkillDir);
  }

  /**
   * Fetch a file from the repository as text
   */
  private async fetchFile(path: string): Promise<string> {
    const response = await fetch(
      `${GITHUB_API}/repos/${this.repo}/contents/${path}`,
      {
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/vnd.github.v3.raw",
          "User-Agent": "Skillport-Connector/1.0",
        },
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`File not found: ${path}`);
      }
      if (response.status === 403) {
        throw new Error(`Rate limited or unauthorized`);
      }
      throw new Error(`GitHub API error: ${response.status}`);
    }

    return response.text();
  }

  /**
   * Fetch a file from the repository as base64 (for binary files)
   */
  private async fetchFileBase64(path: string): Promise<string> {
    const response = await fetch(
      `${GITHUB_API}/repos/${this.repo}/contents/${path}`,
      {
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "Skillport-Connector/1.0",
        },
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`File not found: ${path}`);
      }
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const data = await response.json() as { content: string };
    // GitHub returns base64 content with newlines, remove them
    return data.content.replace(/\n/g, "");
  }

  /**
   * Fetch with caching
   */
  private async fetchWithCache<T>(
    cacheKey: string,
    ttlSeconds: number,
    fetcher: () => Promise<T>
  ): Promise<T> {
    // Check cache
    const cached = await this.kv.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as T;
    }

    // Fetch fresh data
    const data = await fetcher();

    // Store in cache
    await this.kv.put(cacheKey, JSON.stringify(data), {
      expirationTtl: ttlSeconds,
    });

    return data;
  }

  /**
   * Fetch access control configuration from .skillport/access.json
   * Returns default config (everyone reads, no one writes) if file doesn't exist
   */
  async fetchAccessConfig(): Promise<AccessConfig> {
    return this.fetchWithCache(
      `access-config:${this.repo}`,
      300, // 5 minutes
      async () => {
        try {
          const content = await this.fetchFile(".skillport/access.json");
          const parsed = JSON.parse(content) as Partial<AccessConfig>;
          // Merge with defaults to handle partial access.json files
          return {
            version: parsed.version ?? DEFAULT_ACCESS_CONFIG.version,
            editors: parsed.editors ?? DEFAULT_ACCESS_CONFIG.editors,
            skills: parsed.skills ?? DEFAULT_ACCESS_CONFIG.skills,
            defaults: parsed.defaults ?? DEFAULT_ACCESS_CONFIG.defaults,
          };
        } catch {
          // No access.json = everyone can read, no one can write
          return DEFAULT_ACCESS_CONFIG;
        }
      }
    );
  }

  /**
   * Get marketplace manifest
   */
  async getMarketplace(): Promise<Marketplace> {
    return this.fetchWithCache(
      `marketplace:${this.repo}`,
      300, // 5 minutes
      async () => {
        const content = await this.fetchFile(".claude-plugin/marketplace.json");
        return JSON.parse(content) as Marketplace;
      }
    );
  }

  /**
   * List plugins with optional filtering
   */
  async listPlugins(options?: {
    category?: string;
  }): Promise<PluginEntry[]> {
    const marketplace = await this.getMarketplace();
    let plugins = marketplace.plugins;

    // Filter by category
    if (options?.category) {
      plugins = plugins.filter((p) => p.category === options.category);
    }

    return plugins;
  }

  /**
   * Discover all skills from all plugins (both published and unpublished)
   * Scans plugins/ directory directly to find all groups with skills
   */
  async listSkills(): Promise<SkillEntry[]> {
    return this.fetchWithCache<SkillEntry[]>(
      `skills:${this.repo}`,
      300,
      async () => {
        const result: SkillEntry[] = [];
        const seenSkills = new Set<string>();

        // Get marketplace for version/author info on published plugins
        const marketplace = await this.getMarketplace();
        const publishedPlugins = new Map(
          marketplace.plugins.map((p) => [p.name, p])
        );

        // Scan all directories under plugins/
        let pluginDirs: GitHubContentItem[] = [];
        try {
          pluginDirs = await this.listDirectory("plugins");
        } catch {
          // No plugins directory
          return result;
        }

        for (const pluginDir of pluginDirs) {
          if (pluginDir.type !== "dir") continue;

          const groupName = pluginDir.name;
          const isPublished = publishedPlugins.has(groupName);
          const basePath = `plugins/${groupName}`;
          const skillsDirPath = `${basePath}/skills`;

          // Check if this is a valid plugin (has .claude-plugin/plugin.json)
          const manifestPath = `${basePath}/.claude-plugin/plugin.json`;
          let manifest: PluginManifest;
          try {
            const manifestContent = await this.fetchFile(manifestPath);
            manifest = JSON.parse(manifestContent) as PluginManifest;
          } catch (e) {
            // No valid manifest, skip this directory
            console.warn(`[listSkills] Failed to fetch manifest for plugin "${groupName}":`, e instanceof Error ? e.message : e);
            continue;
          }

          // Get version from plugin.json (authoritative), author from manifest or marketplace
          const publishedInfo = publishedPlugins.get(groupName);
          const version = manifest.version || publishedInfo?.version || "1.0.0";
          const author = manifest.author || publishedInfo?.author;

          try {
            const skillDirs = await this.listDirectory(skillsDirPath);

            for (const dir of skillDirs) {
              if (dir.type !== "dir") continue;

              try {
                const skillMdPath = `${skillsDirPath}/${dir.name}/SKILL.md`;
                const skillMdContent = await this.fetchFile(skillMdPath);
                const frontmatter = parseSkillFrontmatter(skillMdContent);

                const skillName = frontmatter.name || dir.name;

                // Enforce unique skill names - first one wins
                if (seenSkills.has(skillName)) {
                  console.warn(
                    `[WARN] Duplicate skill name "${skillName}" in group "${groupName}" - skipping`
                  );
                  continue;
                }
                seenSkills.add(skillName);

                result.push({
                  name: skillName,
                  dirName: dir.name,
                  plugin: groupName,
                  description:
                    frontmatter.description || publishedInfo?.description || "",
                  version,
                  author,
                  // Metadata inherited from parent plugin
                  category: publishedInfo?.category,
                  tags: publishedInfo?.tags,
                  keywords: publishedInfo?.keywords,
                  published: isPublished,
                });
              } catch (e) {
                // Skip if SKILL.md is missing or invalid
                console.warn(`[listSkills] Failed to fetch SKILL.md for "${dir.name}" in plugin "${groupName}":`, e instanceof Error ? e.message : e);
              }
            }
          } catch (e) {
            // Plugin has no skills directory
            console.warn(`[listSkills] No skills directory for plugin "${groupName}":`, e instanceof Error ? e.message : e);
          }
        }

        console.log(`[listSkills] Found ${result.length} skills from ${pluginDirs.length} plugin directories`);
        return result;
      }
    );
  }

  /**
   * Get skill by name
   */
  async getSkill(skillName: string): Promise<SkillEntry | null> {
    const allSkills = await this.listSkills();
    return allSkills.find(s => s.name === skillName) || null;
  }

  /**
   * Debug: List raw plugin directories from GitHub API
   * Returns the raw response from GitHub's Contents API for diagnostics
   */
  async debugListPlugins(): Promise<{ directories: GitHubContentItem[]; error?: string }> {
    try {
      const dirs = await this.listDirectory("plugins");
      return { directories: dirs };
    } catch (e) {
      return {
        directories: [],
        error: e instanceof Error ? e.message : String(e)
      };
    }
  }

  /**
   * Count actual skill directories in a plugin (regardless of SKILL.md validity)
   * Used to safely determine if deleting the last skill should remove the plugin
   */
  async countSkillDirectories(pluginName: string): Promise<number> {
    const skillsDirPath = `plugins/${pluginName}/skills`;
    try {
      const entries = await this.listDirectory(skillsDirPath);
      return entries.filter(e => e.type === "dir").length;
    } catch {
      // No skills directory
      return 0;
    }
  }

  /**
   * Fetch only the SKILL.md content for a skill (token-efficient)
   */
  async fetchSkillMd(skillName: string): Promise<string> {
    const skill = await this.getSkill(skillName);
    if (!skill) {
      throw new Error(`Skill not found: ${skillName}`);
    }

    const skillMdPath = `plugins/${skill.plugin}/skills/${skill.dirName}/SKILL.md`;
    return this.fetchFile(skillMdPath);
  }

  /**
   * Get raw file content from repository
   * Public wrapper around fetchFile for cases where callers need to read arbitrary files
   */
  async getFileContent(path: string): Promise<string> {
    return this.fetchFile(path);
  }

  /**
   * Get detailed plugin information
   */
  async getPlugin(name: string): Promise<{
    entry: PluginEntry;
    manifest: PluginManifest | null;
  }> {
    const marketplace = await this.getMarketplace();
    const entry = marketplace.plugins.find((p) => p.name === name);

    if (!entry) {
      throw new Error(`Plugin not found: ${name}`);
    }

    // Try to fetch plugin.json for additional details
    // Include version in cache key so updates invalidate cache
    let manifest: PluginManifest | null = null;
    try {
      const basePath = entry.source.replace("./", "");
      const version = entry.version || "unknown";
      manifest = await this.fetchWithCache(
        `plugin:${this.repo}:${name}:${version}`,
        3600, // 1 hour
        async () => {
          const content = await this.fetchFile(`${basePath}/.claude-plugin/plugin.json`);
          return JSON.parse(content) as PluginManifest;
        }
      );
    } catch {
      // plugin.json is optional
    }

    return { entry, manifest };
  }

  /**
   * Fetch all skill files for installation
   * Returns skill directory contents plus plugin.json for versioning
   * Looks up skill by name to find parent plugin
   * @param skipCache - If true, bypass cache (use for editing to ensure fresh files)
   */
  async fetchSkill(skillName: string, options?: { skipCache?: boolean }): Promise<{
    skill: SkillEntry;
    plugin: PluginEntry;
    files: SkillFile[];
  }> {
    // Find the skill and its parent plugin
    const skill = await this.getSkill(skillName);
    if (!skill) {
      throw new Error(`Skill not found: ${skillName}`);
    }

    // Try to get plugin from marketplace, fall back to direct path for unpublished groups
    let entry: PluginEntry;
    let manifest: PluginManifest | null = null;
    let basePath: string;

    try {
      const result = await this.getPlugin(skill.plugin);
      entry = result.entry;
      manifest = result.manifest;
      basePath = entry.source.replace("./", "");
    } catch {
      // Plugin not in marketplace - construct path directly for unpublished groups
      basePath = `plugins/${skill.plugin}`;

      // Try to read plugin.json directly
      try {
        const manifestContent = await this.fetchFile(`${basePath}/.claude-plugin/plugin.json`);
        manifest = JSON.parse(manifestContent) as PluginManifest;
      } catch {
        // No manifest, that's okay
      }

      // Create a synthetic entry for unpublished plugins
      entry = {
        name: skill.plugin,
        source: `./${basePath}`,
        version: manifest?.version || skill.version,
        description: manifest?.description,
        author: manifest?.author,
      };
    }

    // Skill directory: plugins/{plugin}/skills/{skill}/
    // Use dirName (actual directory) not name (display name from frontmatter)
    const fullSkillDir = `${basePath}/skills/${skill.dirName}`;

    // Fetch all files in skill directory
    // Include plugin name in cache key to avoid collisions when different plugins have same skill dirName
    const version = entry.version || "unknown";
    let files: SkillFile[];

    if (options?.skipCache) {
      // Bypass cache for editing to ensure fresh files
      files = await this.fetchDirectoryRecursive(fullSkillDir, fullSkillDir);
    } else {
      // Use cache for installation (6 hour TTL)
      files = await this.fetchWithCache(
        `skill-dir:${this.repo}:${skill.plugin}:${skill.dirName}:${version}`,
        21600,
        async () => this.fetchDirectoryRecursive(fullSkillDir, fullSkillDir)
      );
    }

    // Include plugin.json for versioning (if it exists)
    if (manifest) {
      files.push({
        path: ".claude-plugin/plugin.json",
        content: JSON.stringify(manifest, null, 2),
      });
    }

    return { skill, plugin: entry, files };
  }

  /**
   * Check for updates
   */
  async checkUpdates(
    installed: Array<{ name: string; version: string }>
  ): Promise<
    Array<{
      name: string;
      installedVersion: string;
      availableVersion: string;
    }>
  > {
    const marketplace = await this.getMarketplace();
    const updates: Array<{
      name: string;
      installedVersion: string;
      availableVersion: string;
    }> = [];

    for (const inst of installed) {
      const plugin = marketplace.plugins.find((p) => p.name === inst.name);
      // Use semver comparison: only report update if available > installed
      if (plugin && plugin.version && compareSemver(plugin.version, inst.version) > 0) {
        updates.push({
          name: inst.name,
          installedVersion: inst.version,
          availableVersion: plugin.version,
        });
      }
    }

    return updates;
  }

  /**
   * Clear cache (for webhooks or manual refresh)
   */
  async clearCache(pluginName?: string): Promise<void> {
    if (pluginName) {
      await this.kv.delete(`plugin:${this.repo}:${pluginName}`);
      await this.kv.delete(`skill:${this.repo}:${pluginName}`);
    }
    // Always clear the skills list cache (used by listSkills)
    await this.kv.delete(`skills:${this.repo}`);
    // Clear marketplace cache when no specific plugin
    if (!pluginName) {
      await this.kv.delete(`marketplace:${this.repo}`);
    }
  }

  /**
   * Clear skill directory cache after edits
   * The cache key format is: skill-dir:${repo}:${plugin}:${dirName}:${version}
   * Since we may not know the version, we use KV list to find and delete matching keys
   */
  async clearSkillDirCache(pluginName: string, skillDirName: string): Promise<void> {
    // List all keys matching the skill-dir prefix for this skill
    const prefix = `skill-dir:${this.repo}:${pluginName}:${skillDirName}:`;
    const listed = await this.kv.list({ prefix });

    // Delete all matching keys (there should typically be just one)
    for (const key of listed.keys) {
      await this.kv.delete(key.name);
    }
  }

  /**
   * Check if a file exists at the given path
   */
  async fileExists(path: string): Promise<boolean> {
    const response = await fetch(
      `${GITHUB_API}/repos/${this.repo}/contents/${path}`,
      {
        method: "HEAD",
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "Skillport-Connector/1.0",
        },
      }
    );
    return response.ok;
  }

  // ============================================================
  // Write Operations (require GITHUB_WRITE_TOKEN)
  // ============================================================

  /**
   * Get file metadata including SHA (needed for updates)
   */
  private async getFileMeta(path: string): Promise<{ sha: string; content?: string }> {
    const response = await fetch(
      `${GITHUB_API}/repos/${this.repo}/contents/${path}`,
      {
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "Skillport-Connector/1.0",
        },
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`File not found: ${path}`);
      }
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const data = (await response.json()) as { sha: string; content?: string };
    return { sha: data.sha, content: data.content };
  }

  /**
   * Update an existing file in the repository
   */
  async updateFile(path: string, content: string, message: string): Promise<void> {
    const { sha } = await this.getFileMeta(path);

    const response = await fetch(
      `${GITHUB_API}/repos/${this.repo}/contents/${path}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "Skillport-Connector/1.0",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message,
          content: btoa(unescape(encodeURIComponent(content))), // Handle UTF-8
          sha,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to update file: ${response.status} - ${errorText}`);
    }
  }

  /**
   * Create a new file in the repository
   */
  async createFile(path: string, content: string, message: string): Promise<void> {
    const response = await fetch(
      `${GITHUB_API}/repos/${this.repo}/contents/${path}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "Skillport-Connector/1.0",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message,
          content: btoa(unescape(encodeURIComponent(content))), // Handle UTF-8
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create file: ${response.status} - ${errorText}`);
    }
  }

  /**
   * Upsert a file (create if doesn't exist, update if exists)
   * Returns whether the file was created (true) or updated (false)
   */
  async upsertFile(path: string, content: string, message: string): Promise<{ created: boolean }> {
    let sha: string | undefined;

    // Try to get existing file SHA
    try {
      const meta = await this.getFileMeta(path);
      sha = meta.sha;
    } catch (error) {
      // File doesn't exist, will create
      if (!(error instanceof Error && error.message.includes("File not found"))) {
        throw error;
      }
    }

    const response = await fetch(
      `${GITHUB_API}/repos/${this.repo}/contents/${path}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "Skillport-Connector/1.0",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message,
          content: btoa(unescape(encodeURIComponent(content))), // Handle UTF-8
          ...(sha ? { sha } : {}),
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to upsert file: ${response.status} - ${errorText}`);
    }

    return { created: !sha };
  }

  /**
   * Delete a file from the repository
   */
  async deleteFile(path: string, message: string): Promise<void> {
    // Get the file's SHA (required for deletion)
    const meta = await this.getFileMeta(path);

    const response = await fetch(
      `${GITHUB_API}/repos/${this.repo}/contents/${path}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "Skillport-Connector/1.0",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message,
          sha: meta.sha,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to delete file: ${response.status} - ${errorText}`);
    }
  }

  /**
   * Delete a directory and all its contents recursively
   */
  async deleteDirectory(path: string, message: string): Promise<{ deletedFiles: string[] }> {
    // Get all files in the directory
    const files = await this.fetchDirectoryRecursive(path, path);
    const deletedFiles: string[] = [];

    // Delete each file (GitHub API requires deleting files individually)
    for (const file of files) {
      const fullPath = `${path}/${file.path}`;
      await this.deleteFile(fullPath, `${message}\n\nFile: ${file.path}`);
      deletedFiles.push(file.path);
    }

    return { deletedFiles };
  }

  /**
   * Add a new plugin to marketplace.json
   */
  async addToMarketplace(
    plugin: {
      name: string;
      description: string;
      version?: string;
      category?: string;
      tags?: string[];
      keywords?: string[];
    },
    userEmail?: string
  ): Promise<void> {
    const marketplacePath = ".claude-plugin/marketplace.json";
    const content = await this.fetchFile(marketplacePath);
    const marketplace = JSON.parse(content) as Marketplace;

    // Check if plugin already exists
    if (marketplace.plugins.some((p) => p.name === plugin.name)) {
      throw new Error(`Plugin already exists in marketplace: ${plugin.name}`);
    }

    // Try to read version from plugin.json if not provided
    let version = plugin.version;
    if (!version) {
      try {
        const pluginJsonContent = await this.fetchFile(`plugins/${plugin.name}/.claude-plugin/plugin.json`);
        const pluginJson = JSON.parse(pluginJsonContent) as PluginManifest;
        version = pluginJson.version;
      } catch {
        version = "1.0.0";
      }
    }

    // Add the new plugin entry
    const newEntry: PluginEntry = {
      name: plugin.name,
      source: `./plugins/${plugin.name}`,
      description: plugin.description,
      version,
      ...(plugin.category ? { category: plugin.category } : {}),
      ...(plugin.tags ? { tags: plugin.tags } : {}),
      ...(plugin.keywords ? { keywords: plugin.keywords } : {}),
    };

    marketplace.plugins.push(newEntry);

    const commitMessage = userEmail
      ? `Add ${plugin.name} to marketplace\n\nRequested by: ${userEmail}`
      : `Add ${plugin.name} to marketplace`;

    await this.updateFile(
      marketplacePath,
      JSON.stringify(marketplace, null, 2),
      commitMessage
    );

    // Clear marketplace cache
    await this.clearCache();
  }

  /**
   * Update marketplace.json with new plugin version
   */
  async updateMarketplaceVersion(pluginName: string, newVersion: string, userEmail?: string): Promise<void> {
    const marketplacePath = ".claude-plugin/marketplace.json";
    const content = await this.fetchFile(marketplacePath);
    const marketplace = JSON.parse(content) as Marketplace;

    const plugin = marketplace.plugins.find((p) => p.name === pluginName);
    if (!plugin) {
      throw new Error(`Plugin not found in marketplace: ${pluginName}`);
    }

    plugin.version = newVersion;

    const commitMessage = userEmail
      ? `Bump ${pluginName} version to ${newVersion}\n\nRequested by: ${userEmail}`
      : `Bump ${pluginName} version to ${newVersion}`;

    await this.updateFile(
      marketplacePath,
      JSON.stringify(marketplace, null, 2),
      commitMessage
    );

    // Clear marketplace cache so new version is visible immediately
    await this.clearCache();
  }

  /**
   * Remove a skill from marketplace.json
   */
  async removeFromMarketplace(skillName: string, userEmail?: string): Promise<void> {
    const marketplacePath = ".claude-plugin/marketplace.json";
    const content = await this.fetchFile(marketplacePath);
    const marketplace = JSON.parse(content) as Marketplace;

    const initialLength = marketplace.plugins.length;
    marketplace.plugins = marketplace.plugins.filter((p) => p.name !== skillName);

    if (marketplace.plugins.length === initialLength) {
      throw new Error(`Skill not found in marketplace: ${skillName}`);
    }

    const commitMessage = userEmail
      ? `Remove ${skillName} from marketplace\n\nRequested by: ${userEmail}`
      : `Remove ${skillName} from marketplace`;

    await this.updateFile(
      marketplacePath,
      JSON.stringify(marketplace, null, 2),
      commitMessage
    );

    // Clear marketplace cache
    await this.clearCache();
  }
}
