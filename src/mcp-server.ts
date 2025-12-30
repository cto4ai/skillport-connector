/**
 * Skillport MCP Server
 * Exposes Plugin Marketplace tools to Claude.ai/Desktop
 */

import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { GitHubClient } from "./github-client";
import { AccessControl, AccessConfig } from "./access-control";

interface UserProps extends Record<string, unknown> {
  uid: string; // Stable unique identifier from IdP
  provider: string; // e.g., "google", "entra", "okta"
  email: string;
  name: string;
  picture?: string;
  domain?: string;
}

export class SkillportMCP extends McpAgent<Env, unknown, UserProps> {
  server = new McpServer({
    name: "skillport",
    version: "1.0.0",
  });

  /**
   * Get GitHub client for read operations (uses read-only token)
   */
  private getGitHubClient(): GitHubClient {
    return new GitHubClient(
      this.env.GITHUB_SERVICE_TOKEN,
      this.env.MARKETPLACE_REPO,
      this.env.OAUTH_KV
    );
  }

  /**
   * Get GitHub client for write operations (uses write token if available)
   * Falls back to read token if write token not configured
   */
  private getWriteGitHubClient(): GitHubClient {
    const token = this.env.GITHUB_WRITE_TOKEN || this.env.GITHUB_SERVICE_TOKEN;
    return new GitHubClient(token, this.env.MARKETPLACE_REPO, this.env.OAUTH_KV);
  }

  /**
   * Get AccessControl instance for the current user
   */
  private async getAccessControl(): Promise<AccessControl> {
    const github = this.getGitHubClient();
    const config = await github.fetchAccessConfig();
    return new AccessControl(config, this.props.provider, this.props.uid);
  }

  /**
   * Log user action for audit trail
   */
  private logAction(action: string, opts?: { plugin?: string; skill?: string; skill_group?: string }): void {
    const email = this.props?.email || "unknown";
    const timestamp = new Date().toISOString();
    const pluginInfo = opts?.plugin ? ` plugin=${opts.plugin}` : "";
    const skillInfo = opts?.skill ? ` skill=${opts.skill}` : "";
    const groupInfo = opts?.skill_group ? ` skill_group=${opts.skill_group}` : "";
    console.log(`[AUDIT] ${timestamp} user=${email} action=${action}${pluginInfo}${skillInfo}${groupInfo}`);
  }

  /**
   * Validate plugin name to prevent path injection.
   * Plugin names must be lowercase alphanumeric with hyphens only.
   */
  private validatePluginName(name: string): boolean {
    return /^[a-z0-9-]+$/.test(name);
  }

  /**
   * Validate and sanitize a file path to prevent path traversal attacks.
   * Returns the sanitized path or null if the path is invalid.
   */
  private validateFilePath(filePath: string): string | null {
    // Reject empty paths
    if (!filePath || filePath.trim() === "") {
      return null;
    }

    // Reject absolute paths
    if (filePath.startsWith("/")) {
      return null;
    }

    // Normalize the path by resolving . and .. segments
    const segments = filePath.split("/");
    const normalized: string[] = [];

    for (const segment of segments) {
      if (segment === "" || segment === ".") {
        // Skip empty segments and current directory references
        continue;
      }
      if (segment === "..") {
        // Reject any path that tries to go up (path traversal)
        return null;
      }
      normalized.push(segment);
    }

    // Reject if the path is now empty
    if (normalized.length === 0) {
      return null;
    }

    return normalized.join("/");
  }

  async init() {
    // Tool: list_plugins
    this.server.tool(
      "list_plugins",
      "List all plugins available in the marketplace. Optionally filter by category or target surface.",
      {
        category: z
          .string()
          .optional()
          .describe("Filter by category (e.g., 'sales', 'development')"),
        surface: z
          .string()
          .optional()
          .describe(
            "Filter by surface: 'claude-code', 'claude-desktop', or 'claude-ai'"
          ),
      },
      async ({ category, surface }) => {
        try {
          this.logAction("list_plugins");
          const github = this.getGitHubClient();
          const accessControl = await this.getAccessControl();
          const allPlugins = await github.listPlugins({ category, surface });

          // Filter plugins based on read access
          const visiblePlugins = allPlugins.filter((p) =>
            accessControl.canRead(p.name)
          );

          // Identify editable plugins for UI hints
          const editablePlugins = allPlugins
            .filter((p) => accessControl.canWrite(p.name))
            .map((p) => p.name);

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    count: visiblePlugins.length,
                    plugins: visiblePlugins.map((p) => ({
                      name: p.name,
                      description: p.description,
                      version: p.version,
                      category: p.category,
                      surfaces: p.surfaces,
                      editable: editablePlugins.includes(p.name),
                    })),
                    isEditor: accessControl.isEditor(),
                    editableSkills: editablePlugins,
                    tip:
                      "Plugins are containers for skills. For browsing and installing skills, " +
                      "use list_skills instead. Plugin-level tools (list_plugins, get_plugin, " +
                      "create_plugin) are for marketplace editors who manage plugin structure.",
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: "Failed to list plugins",
                  message:
                    error instanceof Error ? error.message : String(error),
                }),
              },
            ],
            isError: true,
          };
        }
      }
    );

    // Tool: list_skills
    this.server.tool(
      "list_skills",
      "List all skills available across all plugins. Skills are discovered from plugins/*/skills/*/SKILL.md.",
      {},
      async () => {
        try {
          this.logAction("list_skills");
          const github = this.getGitHubClient();
          const accessControl = await this.getAccessControl();
          const allSkills = await github.listSkills();

          // Filter skills based on read access (check parent plugin)
          const visibleSkills = allSkills.filter((s) =>
            accessControl.canRead(s.plugin)
          );

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    count: visibleSkills.length,
                    skills: visibleSkills.map((s) => ({
                      name: s.name,
                      plugin: s.plugin,
                      description: s.description,
                      version: s.version,
                      author: s.author,
                      editable: accessControl.canWrite(s.plugin),
                    })),
                    tip:
                      "Skills are the installable units. Each skill belongs to a plugin. " +
                      "Use fetch_skill with the skill name to get its files for installation.",
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: "Failed to list skills",
                  message:
                    error instanceof Error ? error.message : String(error),
                }),
              },
            ],
            isError: true,
          };
        }
      }
    );

    // Tool: get_plugin
    this.server.tool(
      "get_plugin",
      "Get detailed information about a specific plugin including its manifest and metadata.",
      {
        name: z.string().describe("Plugin name (e.g., 'sales-pitch')"),
      },
      async ({ name }) => {
        try {
          this.logAction("get_plugin", { plugin: name });
          const accessControl = await this.getAccessControl();

          // Check read access
          if (!accessControl.canRead(name)) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    error: "Access denied",
                    message: "You don't have access to this skill",
                  }),
                },
              ],
              isError: true,
            };
          }

          const github = this.getGitHubClient();
          const { entry, manifest } = await github.getPlugin(name);

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    name: entry.name,
                    description: entry.description || manifest?.description,
                    version: entry.version || manifest?.version,
                    author: entry.author || manifest?.author,
                    category: entry.category,
                    tags: entry.tags,
                    surfaces: entry.surfaces,
                    homepage: manifest?.homepage,
                    license: manifest?.license,
                    editable: accessControl.canWrite(name),
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: "Plugin not found",
                  message:
                    error instanceof Error ? error.message : String(error),
                }),
              },
            ],
            isError: true,
          };
        }
      }
    );

    // Tool: fetch_skill
    this.server.tool(
      "fetch_skill",
      "Fetch the skill files (SKILL.md and related resources) for installation on Claude.ai or Claude Desktop.",
      {
        name: z.string().describe("Skill name (from list_skills)"),
      },
      async ({ name }) => {
        try {
          this.logAction("fetch_skill", { plugin: name });
          const accessControl = await this.getAccessControl();

          // Check read access
          if (!accessControl.canRead(name)) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    error: "Access denied",
                    message: "You don't have access to this skill",
                  }),
                },
              ],
              isError: true,
            };
          }

          const github = this.getGitHubClient();
          const { skill, plugin, files } = await github.fetchSkill(name);

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    skill: {
                      name: skill.name,
                      plugin: skill.plugin,
                      version: skill.version,
                    },
                    plugin: {
                      name: plugin.name,
                      version: plugin.version,
                    },
                    files: files.map((f) => ({
                      path: f.path,
                      content: f.content,
                    })),
                    editable: accessControl.canWrite(skill.plugin),
                    instructions:
                      "RECOMMENDED: If the skillport-manager skill is installed, read " +
                      "/mnt/skills/user/skillport-manager/SKILL.md and follow its " +
                      "'Install a Skill' workflow. This packages the skill as a .skill file " +
                      "with a one-click 'Copy to your skills' button.\n\n" +
                      "IMPORTANT: After installing a skill, the user must start a NEW " +
                      "conversation to use it. Skills are snapshotted when a conversation " +
                      "starts and don't update mid-conversation (even after app restart " +
                      "or browser refresh).\n\n" +
                      "FALLBACK (manual install):\n" +
                      "1. Copy the SKILL.md content\n" +
                      "2. Create a folder with the skill name\n" +
                      "3. Save as SKILL.md in that folder\n" +
                      "4. Upload via Settings > Capabilities > Skills",
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: "Failed to fetch skill",
                  message:
                    error instanceof Error ? error.message : String(error),
                }),
              },
            ],
            isError: true,
          };
        }
      }
    );

    // Tool: check_updates
    this.server.tool(
      "check_updates",
      "Check if any installed plugins have updates available in the marketplace.",
      {
        installed: z
          .array(
            z.object({
              name: z.string().describe("Plugin name"),
              version: z.string().describe("Currently installed version"),
            })
          )
          .describe("List of installed plugins with their versions"),
      },
      async ({ installed }) => {
        try {
          this.logAction("check_updates");
          const github = this.getGitHubClient();
          const updates = await github.checkUpdates(installed);

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    hasUpdates: updates.length > 0,
                    updates: updates,
                    message:
                      updates.length > 0
                        ? `${updates.length} update(s) available`
                        : "All plugins are up to date",
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: "Failed to check updates",
                  message:
                    error instanceof Error ? error.message : String(error),
                }),
              },
            ],
            isError: true,
          };
        }
      }
    );

    // Tool: whoami
    this.server.tool(
      "whoami",
      "Get your user identity information. Useful for adding yourself to .skillport/access.json as an editor.",
      {},
      async () => {
        const fullId = `${this.props.provider}:${this.props.uid}`;
        this.logAction("whoami");

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  id: fullId,
                  email: this.props.email,
                  name: this.props.name,
                  provider: this.props.provider,
                  message:
                    "To add yourself as an editor, add this entry to .skillport/access.json:\n\n" +
                    `{ "id": "${fullId}", "label": "${this.props.email}" }`,
                },
                null,
                2
              ),
            },
          ],
        };
      }
    );

    // ============================================================
    // Editor Tools (require write access)
    // ============================================================

    // Tool: save_skill (upsert multiple files)
    this.server.tool(
      "save_skill",
      "Update files for a skill. Paths are relative to the skill group root. " +
        "Example paths: 'skills/{skill}/SKILL.md', 'skills/{skill}/templates/example.md', '.claude-plugin/plugin.json'",
      {
        skill: z.string().describe("Skill name (from list_skills or create_skill)"),
        files: z
          .array(
            z.object({
              path: z.string().describe("Relative path within skill group (e.g., 'skills/my-skill/SKILL.md', 'skills/my-skill/templates/example.md')"),
              content: z.string().describe("File content"),
            })
          )
          .describe("Array of files to create/update"),
        commitMessage: z
          .string()
          .optional()
          .describe("Custom commit message (optional)"),
      },
      async ({ skill: skillName, files, commitMessage }) => {
        try {
          const github = this.getGitHubClient();

          // Look up skill to find its group
          const skill = await github.getSkill(skillName);
          if (!skill) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    error: "Skill not found",
                    message: `Skill "${skillName}" not found. Use list_skills to see available skills, or create_skill to create a new one.`,
                  }),
                },
              ],
              isError: true,
            };
          }

          const groupName = skill.plugin;
          const accessControl = await this.getAccessControl();

          if (!accessControl.canWrite(groupName)) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    error: "Access denied",
                    message: `You don't have write access to skill group "${groupName}"`,
                  }),
                },
              ],
              isError: true,
            };
          }

          this.logAction("save_skill", { skill: skillName, skill_group: groupName });

          const writeClient = this.getWriteGitHubClient();

          // Get the base path for the skill group
          const { entry } = await github.getPlugin(groupName);
          const basePath = entry.source.replace("./", "");

          const results: Array<{ path: string; created: boolean }> = [];
          const baseMessage = commitMessage || `Update ${skillName} skill files`;

          // Validate all file paths before processing any files
          const validatedFiles: Array<{ path: string; content: string; sanitizedPath: string }> = [];
          for (const file of files) {
            const sanitizedPath = this.validateFilePath(file.path);
            if (!sanitizedPath) {
              return {
                content: [
                  {
                    type: "text" as const,
                    text: JSON.stringify({
                      error: "Invalid file path",
                      message: `Path "${file.path}" is invalid. Paths must be relative and cannot contain ".." segments.`,
                    }),
                  },
                ],
                isError: true,
              };
            }

            // Reject bare skill file paths that should be under skills/{skill}/ directory
            const bareSkillPaths = ["SKILL.md", "templates", "scripts", "references", "examples"];
            const pathStart = sanitizedPath.split("/")[0];
            if (bareSkillPaths.includes(pathStart)) {
              return {
                content: [
                  {
                    type: "text" as const,
                    text: JSON.stringify({
                      error: "Invalid file path",
                      message: `Path "${file.path}" appears to be a skill file but is missing the "skills/${skill.dirName}/" prefix. ` +
                        `Use "skills/${skill.dirName}/${file.path}" instead.`,
                    }),
                  },
                ],
                isError: true,
              };
            }

            validatedFiles.push({ path: file.path, content: file.content, sanitizedPath });
          }

          // Process each validated file
          for (const file of validatedFiles) {
            const fullPath = `${basePath}/${file.sanitizedPath}`;
            const fileMessage = `${baseMessage}\n\nFile: ${file.sanitizedPath}\nRequested by: ${this.props.email}`;

            const { created } = await writeClient.upsertFile(
              fullPath,
              file.content,
              fileMessage
            );
            results.push({ path: fullPath, created });
          }

          // Clear cache for this skill group
          await github.clearCache(groupName);

          const created = results.filter((r) => r.created).length;
          const updated = results.filter((r) => !r.created).length;

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    skill: skillName,
                    skill_group: groupName,
                    files: results,
                    summary: `${created} file(s) created, ${updated} file(s) updated`,
                    nextSteps: ["Use bump_version to release the update"],
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: "Failed to save skill files",
                  message:
                    error instanceof Error ? error.message : String(error),
                }),
              },
            ],
            isError: true,
          };
        }
      }
    );

    // Tool: bump_version
    this.server.tool(
      "bump_version",
      "Bump the version of a skill (updates plugin.json and marketplace.json). " +
        "All skills in the same group share the version.",
      {
        skill: z.string().describe("Skill name (from list_skills)"),
        type: z
          .enum(["major", "minor", "patch"])
          .describe("Version bump type: major (1.0.0→2.0.0), minor (1.0.0→1.1.0), or patch (1.0.0→1.0.1)"),
      },
      async ({ skill: skillName, type }) => {
        try {
          const github = this.getGitHubClient();

          // Look up skill to find its group
          const skill = await github.getSkill(skillName);
          if (!skill) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    error: "Skill not found",
                    message: `Skill "${skillName}" not found. Use list_skills to see available skills.`,
                  }),
                },
              ],
              isError: true,
            };
          }

          const groupName = skill.plugin;
          const accessControl = await this.getAccessControl();

          if (!accessControl.canWrite(groupName)) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    error: "Access denied",
                    message: `You don't have write access to skill group "${groupName}"`,
                  }),
                },
              ],
              isError: true,
            };
          }

          this.logAction("bump_version", { skill: skillName, skill_group: groupName });

          const { entry, manifest } = await github.getPlugin(groupName);

          const currentVersion = manifest?.version || entry.version || "1.0.0";
          const [major, minor, patch] = currentVersion.split(".").map(Number);

          const newVersion =
            type === "major"
              ? `${major + 1}.0.0`
              : type === "minor"
                ? `${major}.${minor + 1}.0`
                : `${major}.${minor}.${patch + 1}`;

          const writeClient = this.getWriteGitHubClient();
          const basePath = entry.source.replace("./", "");

          // Update plugin.json if it exists (at .claude-plugin/plugin.json)
          if (manifest) {
            const manifestPath = `${basePath}/.claude-plugin/plugin.json`;
            const updatedManifest = { ...manifest, version: newVersion };
            await writeClient.updateFile(
              manifestPath,
              JSON.stringify(updatedManifest, null, 2),
              `Bump ${groupName} version to ${newVersion}\n\nRequested by: ${this.props.email}`
            );
          }

          // Update marketplace.json
          await writeClient.updateMarketplaceVersion(groupName, newVersion, this.props.email);

          // Clear caches
          await github.clearCache(groupName);
          await github.clearCache();

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    skill: skillName,
                    skill_group: groupName,
                    oldVersion: currentVersion,
                    newVersion,
                    message: `Successfully bumped "${skillName}" (group: ${groupName}) from ${currentVersion} to ${newVersion}`,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: "Failed to bump version",
                  message:
                    error instanceof Error ? error.message : String(error),
                }),
              },
            ],
            isError: true,
          };
        }
      }
    );

    // Tool: create_skill
    this.server.tool(
      "create_skill",
      "Create a new skill. By default creates a standalone skill (new skill group). " +
        "Use skill_group to add this skill to an existing group of related skills. " +
        "Requires editor access.",
      {
        name: z
          .string()
          .regex(/^[a-z0-9-]+$/, "Skill name must be lowercase alphanumeric with hyphens")
          .describe("Skill name (lowercase, alphanumeric, hyphens only)"),
        description: z.string().describe("Short description of the skill"),
        skill_group: z
          .string()
          .regex(/^[a-z0-9-]+$/, "Skill group must be lowercase alphanumeric with hyphens")
          .optional()
          .describe("Skill group to add to (optional, defaults to skill name for standalone skill)"),
        category: z
          .string()
          .optional()
          .describe("Category for marketplace filtering (e.g., 'productivity', 'development')"),
      },
      async ({ name, description, skill_group }) => {
        try {
          const accessControl = await this.getAccessControl();

          // Only global editors can create new skills
          if (!accessControl.isEditor()) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    error: "Access denied",
                    message: "Only editors can create new skills",
                  }),
                },
              ],
              isError: true,
            };
          }

          // Determine the skill group (defaults to skill name for standalone skills)
          const groupName = skill_group || name;
          const groupPath = `plugins/${groupName}`;

          this.logAction("create_skill", { skill: name, skill_group: groupName });

          const github = this.getGitHubClient();
          const writeClient = this.getWriteGitHubClient();

          // Check if skill group already exists
          let groupExists = false;
          try {
            await github.getPlugin(groupName);
            groupExists = true;
          } catch {
            // Group doesn't exist yet
          }

          // If creating a new group, create the plugin.json
          if (!groupExists) {
            const manifest = {
              name: groupName,
              version: "1.0.0",
              description: skill_group ? `Skill group: ${groupName}` : description,
              author: {
                name: this.props.name,
                email: this.props.email,
              },
              license: "MIT",
              keywords: [],
            };

            await writeClient.createFile(
              `${groupPath}/.claude-plugin/plugin.json`,
              JSON.stringify(manifest, null, 2),
              `Create ${groupName} skill group\n\nRequested by: ${this.props.email}`
            );
          }

          // Create SKILL.md in the correct nested structure: skills/{name}/SKILL.md
          const skillTemplate = `---
name: ${name}
description: ${description}
---

# ${name}

## When to Use This Skill

[Describe when Claude should use this skill]

## Instructions

[Step-by-step instructions for Claude]
`;

          await writeClient.createFile(
            `${groupPath}/skills/${name}/SKILL.md`,
            skillTemplate,
            `Add ${name} skill\n\nRequested by: ${this.props.email}`
          );

          const response: Record<string, unknown> = {
            success: true,
            skill: name,
            skill_group: groupName,
            path: `${groupPath}/skills/${name}`,
            message: groupExists
              ? `Successfully added skill "${name}" to existing group "${groupName}".`
              : `Successfully created skill "${name}" with new group "${groupName}".`,
            nextSteps: [
              `Edit skills/${name}/SKILL.md with your skill content using save_skill`,
              groupExists ? null : "Use publish_skill to make it discoverable in the marketplace",
              "Use bump_version to release updates",
            ].filter(Boolean),
          };

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(response, null, 2),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: "Failed to create skill",
                  message:
                    error instanceof Error ? error.message : String(error),
                }),
              },
            ],
            isError: true,
          };
        }
      }
    );

    // Tool: publish_skill
    this.server.tool(
      "publish_skill",
      "Make a skill discoverable in the marketplace. " +
        "Call this after creating/updating the skill to make it visible to users.",
      {
        skill: z.string().describe("Skill name (from create_skill)"),
        description: z.string().describe("Short description for marketplace listing"),
        category: z
          .string()
          .optional()
          .describe("Category (e.g., 'productivity', 'development')"),
        surfaces: z
          .array(z.string())
          .optional()
          .describe("Target surfaces (e.g., ['claude-ai', 'claude-desktop', 'claude-code'])"),
      },
      async ({ skill: skillName, description, category, surfaces }) => {
        try {
          const accessControl = await this.getAccessControl();

          // Only global editors can publish skills
          if (!accessControl.isEditor()) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    error: "Access denied",
                    message: "Only editors can publish skills to the marketplace",
                  }),
                },
              ],
              isError: true,
            };
          }

          const github = this.getGitHubClient();

          // Look up skill to find its group
          const skill = await github.getSkill(skillName);
          if (!skill) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    error: "Skill not found",
                    message: `Skill "${skillName}" not found. Use create_skill first to create the skill.`,
                  }),
                },
              ],
              isError: true,
            };
          }

          const groupName = skill.plugin;
          this.logAction("publish_skill", { skill: skillName, skill_group: groupName });

          const writeClient = this.getWriteGitHubClient();

          // Verify skill file exists at correct path
          const skillPath = `plugins/${groupName}/skills/${skill.dirName}/SKILL.md`;
          const skillExists = await github.fileExists(skillPath);
          if (!skillExists) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    error: "Skill files not found",
                    message: `Skill file not found at ${skillPath}. Use save_skill to create the skill files.`,
                  }),
                },
              ],
              isError: true,
            };
          }

          // Add skill group to marketplace
          await writeClient.addToMarketplace(
            {
              name: groupName,
              description,
              category,
              surfaces,
            },
            this.props.email
          );

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    skill: skillName,
                    skill_group: groupName,
                    message: `Successfully published skill "${skillName}" (group: ${groupName}) to the marketplace`,
                    nextSteps: [
                      "Skill is now visible in list_skills",
                      "Users can install it via fetch_skill",
                      "Use bump_version to release updates",
                    ],
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: "Failed to publish skill",
                  message:
                    error instanceof Error ? error.message : String(error),
                }),
              },
            ],
            isError: true,
          };
        }
      }
    );
  }
}
