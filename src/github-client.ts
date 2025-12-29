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
  category?: string;
  tags?: string[];
  surfaces?: string[];
  skillPath?: string;
  permissions?: string[];
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
          return JSON.parse(content) as AccessConfig;
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
    surface?: string;
    category?: string;
  }): Promise<PluginEntry[]> {
    const marketplace = await this.getMarketplace();
    let plugins = marketplace.plugins;

    // Filter by surface
    if (options?.surface) {
      plugins = plugins.filter(
        (p) => !p.surfaces || p.surfaces.includes(options.surface!)
      );
    }

    // Filter by category
    if (options?.category) {
      plugins = plugins.filter((p) => p.category === options.category);
    }

    return plugins;
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
          const content = await this.fetchFile(`${basePath}/plugin.json`);
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
   * Returns entire skill directory contents plus plugin.json for versioning
   */
  async fetchSkill(name: string): Promise<{
    plugin: PluginEntry;
    files: SkillFile[];
  }> {
    const { entry, manifest } = await this.getPlugin(name);
    const basePath = entry.source.replace("./", "");
    const skillPath = entry.skillPath || "skills/SKILL.md";

    // Derive skill directory from skillPath
    // "skills/SKILL.md" → "skills"
    // "SKILL.md" → "" (skill is at plugin root)
    const skillDir = skillPath.includes("/")
      ? skillPath.substring(0, skillPath.lastIndexOf("/"))
      : "";

    const fullSkillDir = skillDir ? `${basePath}/${skillDir}` : basePath;

    // Fetch all files in skill directory with caching
    // Include version in cache key so updates invalidate cache
    const version = entry.version || "unknown";
    const files = await this.fetchWithCache(
      `skill-dir:${this.repo}:${name}:${version}`,
      21600, // 6 hours
      async () => this.fetchDirectoryRecursive(fullSkillDir, fullSkillDir)
    );

    // Include plugin.json for versioning (if it exists)
    if (manifest) {
      files.push({
        path: "plugin.json",
        content: JSON.stringify(manifest, null, 2),
      });
    }

    return { plugin: entry, files };
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
    } else {
      // Clear marketplace cache
      await this.kv.delete(`marketplace:${this.repo}`);
    }
  }
}
