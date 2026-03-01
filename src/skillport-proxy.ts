/**
 * Skillport API Proxy
 *
 * Typed `skillport.*` API object injected into the v2 execute tool's scope.
 * Each method wraps GitHubClient + AccessControl, returning plain objects.
 * Auth is handled automatically — the model never sees tokens.
 */

import {
  GitHubClient,
  parseSkillFrontmatter,
} from "./github-client";
import { AccessControl } from "./access-control";
import { packageSkill } from "./skill-packager";

// User context from MCP OAuth handshake
interface UserContext {
  uid: string;
  provider: string;
  email: string;
  name: string;
}

// Validation helpers (same rules as rest-api.ts)
const VALID_NAME_PATTERN = /^[a-z0-9-]+$/;

function validateName(name: string): boolean {
  return VALID_NAME_PATTERN.test(name);
}

function validateFilePath(filePath: string): string | null {
  if (!filePath || filePath.trim() === "") return null;
  if (filePath.startsWith("/")) return null;

  const segments = filePath.split("/");
  const normalized: string[] = [];

  for (const segment of segments) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") return null;
    normalized.push(segment);
  }

  return normalized.length === 0 ? null : normalized.join("/");
}

const VALID_SURFACE_TAGS = [
  "surface:CC",
  "surface:CD",
  "surface:CAI",
  "surface:CDAI",
  "surface:CALL",
];

/**
 * Create a skillport proxy bound to a specific user and environment.
 * The returned object is injected as `skillport` in the execute tool scope.
 */
export function createSkillportProxy(env: Env, user: UserContext) {
  function getGitHub(): GitHubClient {
    return new GitHubClient(
      env.GITHUB_SERVICE_TOKEN,
      env.MARKETPLACE_REPO,
      env.OAUTH_KV
    );
  }

  function getWriteGitHub(): GitHubClient {
    if (!env.GITHUB_WRITE_TOKEN) {
      throw new Error("GITHUB_WRITE_TOKEN is not configured — write operations are unavailable");
    }
    return new GitHubClient(
      env.GITHUB_WRITE_TOKEN,
      env.MARKETPLACE_REPO,
      env.OAUTH_KV
    );
  }

  async function getAccess(): Promise<AccessControl> {
    const config = await getGitHub().fetchAccessConfig();
    return new AccessControl(config, user.provider, user.uid);
  }

  function logAction(
    action: string,
    opts?: { plugin?: string; skill?: string; surface?: string }
  ): void {
    const timestamp = new Date().toISOString();
    const parts = [
      `[AUDIT] ${timestamp} user=${user.email} action=v2:${action}`,
      opts?.plugin ? `plugin=${opts.plugin}` : "",
      opts?.skill ? `skill=${opts.skill}` : "",
      opts?.surface ? `surface=${opts.surface}` : "",
    ];
    console.log(parts.filter(Boolean).join(" "));
  }

  return {
    // =========================================================
    // Discovery
    // =========================================================

    async listSkills(params?: { surface?: string; refresh?: boolean }) {
      logAction("list_skills", { surface: params?.surface });
      const github = getGitHub();
      if (params?.refresh) await github.clearCache();
      const access = await getAccess();
      const skills = await github.listSkills({ surface: params?.surface });
      return skills
        .filter((s) => access.canRead(s.name))
        .map((s) => ({
          name: s.name,
          description: s.description,
          version: s.version,
          plugin: s.plugin,
          category: s.category,
          tags: s.tags,
          keywords: s.keywords,
          surface_tags: s.surface_tags,
          published: s.published,
          editable: access.canWrite(s.plugin),
        }));
    },

    async getSkill(name: string) {
      logAction("get_skill", { skill: name });
      const github = getGitHub();
      const access = await getAccess();
      if (!access.canRead(name)) throw new Error("Access denied");

      const skill = await github.getSkill(name);
      if (!skill) throw new Error(`Skill '${name}' not found`);

      const [skillMd, files] = await Promise.all([
        github.fetchSkillMd(name),
        github.listSkillFiles(name),
      ]);

      return {
        name: skill.name,
        version: skill.version,
        description: skill.description,
        plugin: skill.plugin,
        category: skill.category,
        tags: skill.tags,
        surface_tags: skill.surface_tags,
        published: skill.published,
        skill_md: skillMd,
        files,
        editable: access.canWrite(skill.plugin),
      };
    },

    // =========================================================
    // Installation
    // =========================================================

    async installSkill(
      name: string,
      options?: { mode?: "skill" | "package" }
    ) {
      logAction("install_skill", { skill: name });
      const github = getGitHub();
      const access = await getAccess();
      if (!access.canRead(name)) throw new Error("Access denied");

      const { skill, files } = await github.fetchSkill(name);
      const mode = options?.mode || "package";

      const fileData = files.map((f) => ({
        path: f.path,
        content: f.content,
        ...(f.encoding ? { encoding: f.encoding } : {}),
      }));

      if (mode === "package") {
        const pkg = packageSkill(skill.name, files);
        return {
          type: "package" as const,
          name: skill.name,
          version: skill.version,
          filename: pkg.filename,
          content_base64: pkg.content_base64,
          instructions:
            "Write content_base64 to /tmp/" + pkg.filename + " using the code execution tool: " +
            "import base64; open('/tmp/" + pkg.filename + "','wb').write(base64.b64decode(content_base64)). " +
            "Then call present_files with that path. " +
            "Tell the user to click 'Copy to your skills' then start a new conversation.",
        };
      }

      return {
        type: "direct" as const,
        name: skill.name,
        version: skill.version,
        installPath: `~/.claude/skills/${skill.name}/`,
        files: fileData,
        instructions:
          "Write each file to the installPath directory using the Write tool. " +
          "Start a new conversation to use the skill.",
      };
    },

    async checkUpdates(installed: Array<{ name: string; version: string }>) {
      logAction("check_updates");
      const github = getGitHub();
      return github.checkUpdates(installed);
    },

    // =========================================================
    // Authoring
    // =========================================================

    async saveSkill(
      name: string,
      payload: {
        files: Array<{ path: string; content: string }>;
        commitMessage?: string;
        skillGroup?: string;
        metadata?: {
          description: string;
          keywords?: string[];
          author?: { name?: string; email?: string };
          license?: string;
        };
      }
    ) {
      if (!validateName(name))
        throw new Error("Skill name must be lowercase letters, numbers, and hyphens");
      if (!payload.files || payload.files.length === 0)
        throw new Error("files array is required");

      const github = getGitHub();
      const access = await getAccess();
      const existingSkill = await github.getSkill(name);

      let groupName: string;
      let isNewSkill = false;
      let isNewGroup = false;

      if (existingSkill) {
        groupName = existingSkill.plugin;
      } else {
        isNewSkill = true;
        if (!access.isEditor())
          throw new Error("Only editors can create new skills");
        groupName = payload.skillGroup || name;
        if (payload.skillGroup && !validateName(payload.skillGroup))
          throw new Error("Skill group name must be lowercase letters, numbers, and hyphens");

        const groupExists = await github.fileExists(
          `plugins/${groupName}/.claude-plugin/plugin.json`
        );
        if (!groupExists) {
          isNewGroup = true;
          if (!payload.metadata?.description)
            throw new Error("New plugins require metadata with a description");
        }
      }

      if (!access.canWrite(groupName))
        throw new Error(`No write access to group "${groupName}"`);

      logAction("save_skill", { skill: name, plugin: groupName });

      const writeClient = getWriteGitHub();

      // Determine base path
      let basePath: string;
      try {
        const { entry } = await github.getPlugin(groupName);
        basePath = entry.source.replace("./", "");
      } catch (err) {
        if (err instanceof Error && err.message.toLowerCase().includes("not found")) {
          basePath = `plugins/${groupName}`;
        } else {
          throw err;
        }
      }

      // Validate and categorize files
      const skillDirName = existingSkill?.dirName || name;
      const skillPrefix = `skills/${skillDirName}/`;
      const filesToWrite: Array<{
        path: string;
        content: string;
        fullPath: string;
      }> = [];
      const filesToDelete: Array<{ path: string; fullPath: string }> = [];

      for (const file of payload.files) {
        const sanitized = validateFilePath(file.path);
        if (!sanitized) throw new Error(`Invalid file path: "${file.path}"`);

        const isSkillMd =
          sanitized === "SKILL.md" || sanitized === "./SKILL.md";
        if (isSkillMd && file.content === "")
          throw new Error("Cannot delete SKILL.md");

        const fullPath = `${skillPrefix}${sanitized}`;
        if (file.content === "") {
          filesToDelete.push({ path: file.path, fullPath });
        } else {
          filesToWrite.push({
            path: file.path,
            content: file.content,
            fullPath,
          });
        }
      }

      // Validate SKILL.md frontmatter
      const skillMdFile = filesToWrite.find(
        (f) => f.path === "SKILL.md" || f.path === "./SKILL.md"
      );
      if (isNewSkill && !skillMdFile)
        throw new Error(
          "New skills must include SKILL.md with name and description frontmatter"
        );
      if (skillMdFile) {
        const fm = parseSkillFrontmatter(skillMdFile.content);
        const missing: string[] = [];
        if (!fm.name) missing.push("name");
        if (!fm.description) missing.push("description");
        if (missing.length > 0)
          throw new Error(
            `SKILL.md must have ${missing.join(" and ")} in frontmatter`
          );
      }

      // Create group if needed
      if (isNewGroup && payload.metadata) {
        const manifest = {
          name: groupName,
          version: "1.0.0",
          description: payload.metadata.description,
          author: payload.metadata.author || {
            name: user.name,
            email: user.email,
          },
          license: payload.metadata.license || "MIT",
          keywords: payload.metadata.keywords || [],
        };
        await writeClient.createFile(
          `plugins/${groupName}/.claude-plugin/plugin.json`,
          JSON.stringify(manifest, null, 2),
          `Create ${groupName} skill group\n\nRequested by: ${user.email}`
        );
      }

      // Update existing plugin metadata if provided
      if (!isNewGroup && payload.metadata) {
        const pluginJsonPath = `plugins/${groupName}/.claude-plugin/plugin.json`;
        let existingContent: string | null = null;
        try {
          existingContent = await github.getFileContent(pluginJsonPath);
        } catch (err) {
          if (!(err instanceof Error && err.message.toLowerCase().includes("not found"))) {
            throw err;
          }
        }

        if (existingContent) {
          const existing = JSON.parse(existingContent);
          const updated = {
            ...existing,
            description: payload.metadata.description,
            ...(payload.metadata.keywords && {
              keywords: payload.metadata.keywords,
            }),
            ...(payload.metadata.author && {
              author: payload.metadata.author,
            }),
            ...(payload.metadata.license && {
              license: payload.metadata.license,
            }),
          };
          await writeClient.upsertFile(
            pluginJsonPath,
            JSON.stringify(updated, null, 2),
            `Update ${groupName} plugin metadata\n\nRequested by: ${user.email}`
          );
        }
      }

      // Write and delete files
      const results: Array<{
        path: string;
        created?: boolean;
        deleted?: boolean;
      }> = [];
      const baseMessage =
        payload.commitMessage || `Update ${name} skill files`;

      for (const file of filesToWrite) {
        const absPath = `${basePath}/${file.fullPath}`;
        const msg = `${baseMessage}\n\nFile: ${file.fullPath}\nRequested by: ${user.email}`;
        const { created } = await writeClient.upsertFile(
          absPath,
          file.content,
          msg
        );
        results.push({ path: absPath, created });
      }

      for (const file of filesToDelete) {
        const absPath = `${basePath}/${file.fullPath}`;
        try {
          await writeClient.deleteFile(
            absPath,
            `Delete ${file.path}\n\nRequested by: ${user.email}`
          );
          results.push({ path: absPath, deleted: true });
        } catch (err) {
          if (
            !(err instanceof Error && err.message.includes("File not found"))
          )
            throw err;
        }
      }

      await github.clearCache(groupName);
      await github.clearSkillDirCache(groupName, skillDirName);

      const created = results.filter((r) => r.created === true).length;
      const updated = results.filter((r) => r.created === false).length;
      const deleted = results.filter((r) => r.deleted === true).length;
      const parts: string[] = [];
      if (created > 0) parts.push(`${created} created`);
      if (updated > 0) parts.push(`${updated} updated`);
      if (deleted > 0) parts.push(`${deleted} deleted`);

      return {
        success: true,
        skill: name,
        skillGroup: groupName,
        isNewSkill,
        isNewGroup,
        summary: parts.join(", ") || "No changes",
      };
    },

    async deleteSkill(name: string, options?: { confirm?: boolean }) {
      if (!options?.confirm)
        throw new Error("Set confirm: true to delete a skill");
      if (!validateName(name))
        throw new Error("Invalid skill name");

      const github = getGitHub();
      const access = await getAccess();

      const skill = await github.getSkill(name);
      if (!skill) throw new Error(`Skill "${name}" not found`);
      if (!access.canWrite(skill.plugin))
        throw new Error(`No write access to group "${skill.plugin}"`);

      logAction("delete_skill", { skill: name, plugin: skill.plugin });

      const writeClient = getWriteGitHub();
      const skillDirCount = await github.countSkillDirectories(skill.plugin);
      const isLastSkill = skillDirCount === 1;

      let deletedFiles: string[];
      let pluginDeleted = false;

      if (isLastSkill) {
        const result = await writeClient.deleteDirectory(
          `plugins/${skill.plugin}`,
          `Delete plugin ${skill.plugin} (last skill removed)\n\nRequested by: ${user.email}`
        );
        deletedFiles = result.deletedFiles;
        pluginDeleted = true;

        try {
          await writeClient.removeFromMarketplace(skill.plugin, user.email);
        } catch (err) {
          if (
            !(
              err instanceof Error &&
              err.message.includes("not found in marketplace")
            )
          )
            throw err;
        }
      } else {
        const result = await writeClient.deleteDirectory(
          `plugins/${skill.plugin}/skills/${skill.dirName}`,
          `Delete skill ${name}\n\nRequested by: ${user.email}`
        );
        deletedFiles = result.deletedFiles;
      }

      await github.clearCache(skill.plugin);
      await github.clearSkillDirCache(skill.plugin, skill.dirName);
      if (pluginDeleted) await github.clearCache();

      return {
        success: true,
        skill: name,
        plugin: skill.plugin,
        pluginDeleted,
        deletedFiles,
      };
    },

    async bumpVersion(name: string, type: "patch" | "minor" | "major") {
      if (!validateName(name))
        throw new Error("Invalid skill name");

      const github = getGitHub();
      const access = await getAccess();

      const skill = await github.getSkill(name);
      if (!skill) throw new Error(`Skill "${name}" not found`);

      const groupName = skill.plugin;
      if (!access.canWrite(groupName))
        throw new Error(`No write access to group "${groupName}"`);

      logAction("bump_version", { skill: name, plugin: groupName });

      let entry, manifest;
      try {
        const result = await github.getPlugin(groupName);
        entry = result.entry;
        manifest = result.manifest;
      } catch (err) {
        if (err instanceof Error && err.message.toLowerCase().includes("not found")) {
          throw new Error(
            `Skill "${name}" is not published. Use publishSkill first.`
          );
        }
        throw err;
      }

      const currentVersion = manifest?.version || entry.version || "1.0.0";
      const [major, minor, patch] = currentVersion.split(".").map(Number);
      const newVersion =
        type === "major"
          ? `${major + 1}.0.0`
          : type === "minor"
            ? `${major}.${minor + 1}.0`
            : `${major}.${minor}.${patch + 1}`;

      const writeClient = getWriteGitHub();
      const basePath = entry.source.replace("./", "");

      if (manifest) {
        const manifestPath = `${basePath}/.claude-plugin/plugin.json`;
        await writeClient.updateFile(
          manifestPath,
          JSON.stringify({ ...manifest, version: newVersion }, null, 2),
          `Bump ${groupName} version to ${newVersion}\n\nRequested by: ${user.email}`
        );
      }

      await writeClient.updateMarketplaceVersion(
        groupName,
        newVersion,
        user.email
      );
      await github.clearCache(groupName);
      await github.clearCache();

      return {
        success: true,
        skill: name,
        skillGroup: groupName,
        oldVersion: currentVersion,
        newVersion,
      };
    },

    async publishSkill(
      name: string,
      meta: {
        description: string;
        category?: string;
        tags?: string[];
        keywords?: string[];
      }
    ) {
      if (!meta.description) throw new Error("description is required");
      if (!meta.tags?.some((t) => VALID_SURFACE_TAGS.includes(t)))
        throw new Error(
          `At least one surface tag required: ${VALID_SURFACE_TAGS.join(", ")}`
        );

      const access = await getAccess();
      if (!access.isEditor())
        throw new Error("Only editors can publish skills");

      const github = getGitHub();
      const skill = await github.getSkill(name);
      if (!skill) throw new Error(`Skill "${name}" not found. Save it first.`);

      logAction("publish_skill", { skill: name, plugin: skill.plugin });

      const skillPath = `plugins/${skill.plugin}/skills/${skill.dirName}/SKILL.md`;
      if (!(await github.fileExists(skillPath)))
        throw new Error(`Skill file not found at ${skillPath}`);

      const writeClient = getWriteGitHub();
      const { created } = await writeClient.upsertMarketplaceEntry(
        {
          name: skill.plugin,
          description: meta.description,
          category: meta.category,
          tags: meta.tags,
          keywords: meta.keywords,
        },
        user.email
      );

      return {
        success: true,
        skill: name,
        skillGroup: skill.plugin,
        action: created ? "created" : "updated",
      };
    },

    // =========================================================
    // Editing
    // =========================================================

    async editSkill(name: string) {
      logAction("edit_skill", { skill: name });
      const github = getGitHub();
      const access = await getAccess();

      const skill = await github.getSkill(name);
      if (!skill) throw new Error(`Skill "${name}" not found`);
      if (!access.canWrite(skill.plugin))
        throw new Error(`No write access to group "${skill.plugin}"`);

      const { files } = await github.fetchSkill(name, { skipCache: true });

      return {
        name: skill.name,
        plugin: skill.plugin,
        version: skill.version,
        files: files.map((f) => ({
          path: f.path,
          content: f.content,
          ...(f.encoding ? { encoding: f.encoding } : {}),
        })),
      };
    },

    // =========================================================
    // Identity & Debug
    // =========================================================

    async whoami() {
      return {
        id: `${user.provider}:${user.uid}`,
        email: user.email,
        name: user.name,
        provider: user.provider,
      };
    },

    async debugPlugins() {
      logAction("debug_plugins");
      const github = getGitHub();
      return github.debugListPlugins();
    },
  };
}
