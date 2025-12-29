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
  private logAction(action: string, opts?: { plugin?: string }): void {
    const email = this.props?.email || "unknown";
    const timestamp = new Date().toISOString();
    const pluginInfo = opts?.plugin ? ` plugin=${opts.plugin}` : "";
    console.log(`[AUDIT] ${timestamp} user=${email} action=${action}${pluginInfo}`);
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
                      "Before presenting results: Check /mnt/skills/user/ for installed skills. " +
                      "Mark any already-installed skills with '(already installed)'. " +
                      "If skillport-manager is NOT installed, recommend installing it first " +
                      "to enable one-click installation. If skillport-manager IS installed, " +
                      "omit it from the list (it's infrastructure, not a feature skill).",
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
                    permissions: entry.permissions,
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
        name: z.string().describe("Plugin name containing the skill"),
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
          const { plugin, files } = await github.fetchSkill(name);

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    plugin: {
                      name: plugin.name,
                      version: plugin.version,
                    },
                    files: files.map((f) => ({
                      path: f.path,
                      content: f.content,
                    })),
                    editable: accessControl.canWrite(name),
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

    // Tool: update_skill (DEPRECATED - use save_skill instead)
    this.server.tool(
      "update_skill",
      "[DEPRECATED: Use save_skill instead] Update the SKILL.md content for a plugin. Requires write access to the skill.",
      {
        name: z.string().describe("Plugin name"),
        content: z.string().describe("New SKILL.md content"),
        commitMessage: z
          .string()
          .optional()
          .describe("Custom commit message (optional)"),
      },
      async ({ name, content, commitMessage }) => {
        try {
          const accessControl = await this.getAccessControl();

          if (!accessControl.canWrite(name)) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    error: "Access denied",
                    message: "You don't have write access to this skill",
                  }),
                },
              ],
              isError: true,
            };
          }

          this.logAction("update_skill", { plugin: name });

          const github = this.getGitHubClient();
          const { entry } = await github.getPlugin(name);
          const basePath = entry.source.replace("./", "");
          const skillPath = entry.skillPath || "skills/SKILL.md";
          const fullPath = `${basePath}/${skillPath}`;

          const writeClient = this.getWriteGitHubClient();
          const message =
            commitMessage ||
            `Update ${name} SKILL.md\n\nRequested by: ${this.props.email}`;

          await writeClient.updateFile(fullPath, content, message);

          // Clear cache for this plugin
          await github.clearCache(name);

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    path: fullPath,
                    message: `Successfully updated ${name} SKILL.md`,
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
                  error: "Failed to update skill",
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

    // Tool: save_skill (upsert multiple files)
    this.server.tool(
      "save_skill",
      "Create or update skill files for a plugin. Handles multiple files in one call. " +
        "Use this for multi-file skills or when creating a new skill from scratch.",
      {
        name: z.string().describe("Plugin name"),
        files: z
          .array(
            z.object({
              path: z.string().describe("Relative path within plugin directory (e.g., 'plugin.json', 'skills/SKILL.md', 'skills/templates/pitch.md')"),
              content: z.string().describe("File content"),
            })
          )
          .describe("Array of files to create/update"),
        commitMessage: z
          .string()
          .optional()
          .describe("Custom commit message (optional)"),
      },
      async ({ name, files, commitMessage }) => {
        try {
          // Validate plugin name to prevent path injection
          if (!this.validatePluginName(name)) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    error: "Invalid plugin name",
                    message: "Plugin name must be lowercase alphanumeric with hyphens only (e.g., 'my-skill')",
                  }),
                },
              ],
              isError: true,
            };
          }

          const accessControl = await this.getAccessControl();

          if (!accessControl.canWrite(name)) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    error: "Access denied",
                    message: "You don't have write access to this skill",
                  }),
                },
              ],
              isError: true,
            };
          }

          this.logAction("save_skill", { plugin: name });

          const github = this.getGitHubClient();
          const writeClient = this.getWriteGitHubClient();

          // Get plugin info to determine base path (plugin root, not skills subdirectory)
          let basePath: string;
          let isNewPlugin = false;
          try {
            const { entry } = await github.getPlugin(name);
            // Use plugin root directory (e.g., "plugins/my-skill")
            basePath = entry.source.replace("./", "");
          } catch {
            // Plugin doesn't exist yet, use default path
            basePath = `plugins/${name}`;
            isNewPlugin = true;
          }

          const results: Array<{ path: string; created: boolean }> = [];
          const baseMessage = commitMessage || `Update ${name} skill files`;

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

          // Clear cache for this plugin
          await github.clearCache(name);

          const created = results.filter((r) => r.created).length;
          const updated = results.filter((r) => !r.created).length;

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    plugin: name,
                    isNewPlugin,
                    files: results,
                    summary: `${created} file(s) created, ${updated} file(s) updated`,
                    nextSteps: isNewPlugin
                      ? ["Use publish_plugin to add to marketplace"]
                      : ["Use bump_version to release the update"],
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
      "Bump the version of a plugin (updates marketplace.json). Requires write access.",
      {
        name: z.string().describe("Plugin name"),
        type: z
          .enum(["major", "minor", "patch"])
          .describe("Version bump type: major (1.0.0→2.0.0), minor (1.0.0→1.1.0), or patch (1.0.0→1.0.1)"),
      },
      async ({ name, type }) => {
        try {
          const accessControl = await this.getAccessControl();

          if (!accessControl.canWrite(name)) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    error: "Access denied",
                    message: "You don't have write access to this skill",
                  }),
                },
              ],
              isError: true,
            };
          }

          this.logAction("bump_version", { plugin: name });

          const github = this.getGitHubClient();
          const { entry } = await github.getPlugin(name);

          const currentVersion = entry.version || "1.0.0";
          const [major, minor, patch] = currentVersion.split(".").map(Number);

          const newVersion =
            type === "major"
              ? `${major + 1}.0.0`
              : type === "minor"
                ? `${major}.${minor + 1}.0`
                : `${major}.${minor}.${patch + 1}`;

          const writeClient = this.getWriteGitHubClient();

          // Update marketplace.json (source of truth for version)
          await writeClient.updateMarketplaceVersion(name, newVersion, this.props.email);

          // Clear caches
          await github.clearCache(name);
          await github.clearCache();

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    oldVersion: currentVersion,
                    newVersion,
                    message: `Successfully bumped ${name} from ${currentVersion} to ${newVersion}`,
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

    // Tool: create_plugin
    this.server.tool(
      "create_plugin",
      "Create a new plugin with SKILL.md template. Requires editor access (global editors only).",
      {
        name: z
          .string()
          .regex(/^[a-z0-9-]+$/, "Plugin name must be lowercase alphanumeric with hyphens")
          .describe("Plugin name (lowercase, alphanumeric, hyphens only)"),
        description: z.string().describe("Short description of the plugin"),
        category: z
          .string()
          .optional()
          .describe("Plugin category (e.g., 'productivity', 'development')"),
      },
      async ({ name, description, category }) => {
        try {
          const accessControl = await this.getAccessControl();

          // Only global editors can create new plugins
          if (!accessControl.isEditor()) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    error: "Access denied",
                    message: "Only editors can create new plugins",
                  }),
                },
              ],
              isError: true,
            };
          }

          this.logAction("create_plugin", { plugin: name });

          const writeClient = this.getWriteGitHubClient();
          const pluginPath = `plugins/${name}`;

          // Create SKILL.md template at plugin root (official structure)
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
            `${pluginPath}/SKILL.md`,
            skillTemplate,
            `Create ${name} skill\n\nRequested by: ${this.props.email}`
          );

          // Note: marketplace.json needs to be updated via publish_plugin
          // This is intentional to allow review before publishing

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    name,
                    path: pluginPath,
                    message: `Successfully created plugin ${name}. Use publish_plugin to add it to the marketplace.`,
                    nextSteps: [
                      "Edit the SKILL.md with your skill content",
                      "Use publish_plugin to add to marketplace",
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
                  error: "Failed to create plugin",
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

    // Tool: publish_plugin
    this.server.tool(
      "publish_plugin",
      "Add a plugin to the marketplace (makes it discoverable). " +
        "Use after save_skill to make the plugin publicly available.",
      {
        name: z
          .string()
          .regex(/^[a-z0-9-]+$/, "Plugin name must be lowercase alphanumeric with hyphens")
          .describe("Plugin name"),
        description: z.string().describe("Short description for marketplace listing"),
        category: z
          .string()
          .optional()
          .describe("Plugin category (e.g., 'productivity', 'development')"),
        surfaces: z
          .array(z.string())
          .optional()
          .describe("Target surfaces (e.g., ['claude-ai', 'claude-desktop', 'claude-code'])"),
      },
      async ({ name, description, category, surfaces }) => {
        try {
          const accessControl = await this.getAccessControl();

          // Only global editors can publish plugins
          if (!accessControl.isEditor()) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    error: "Access denied",
                    message: "Only editors can publish plugins to the marketplace",
                  }),
                },
              ],
              isError: true,
            };
          }

          this.logAction("publish_plugin", { plugin: name });

          const writeClient = this.getWriteGitHubClient();

          // Verify plugin files exist (check for SKILL.md at plugin root - official structure)
          const github = this.getGitHubClient();
          const skillExists = await github.fileExists(`plugins/${name}/SKILL.md`);
          if (!skillExists) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    error: "Plugin files not found",
                    message: `No skill files found at plugins/${name}/SKILL.md. Use save_skill or create_plugin first to create the skill files.`,
                  }),
                },
              ],
              isError: true,
            };
          }

          // Add to marketplace
          await writeClient.addToMarketplace(
            {
              name,
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
                    name,
                    message: `Successfully published ${name} to the marketplace`,
                    nextSteps: [
                      "Plugin is now visible in list_plugins",
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
                  error: "Failed to publish plugin",
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
