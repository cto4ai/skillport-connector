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

    // Tool: save_skill (create or update skill files)
    this.server.tool(
      "save_skill",
      "Create or update files for a skill. For new skills, provide skill_group (defaults to skill name for standalone). " +
        "Paths are relative to the skill directory itself. " +
        "Example: 'SKILL.md', 'templates/example.md', 'scripts/helper.py'",
      {
        skill: z
          .string()
          .regex(/^[a-z0-9-]+$/, "Skill name must be lowercase alphanumeric with hyphens")
          .describe("Skill name"),
        skill_group: z
          .string()
          .regex(/^[a-z0-9-]+$/, "Skill group must be lowercase alphanumeric with hyphens")
          .optional()
          .describe("Skill group (required for new skills, defaults to skill name; ignored for existing skills)"),
        files: z
          .array(
            z.object({
              path: z.string().describe("Relative path within the skill directory (e.g., 'SKILL.md', 'templates/example.md')"),
              content: z.string().describe("File content"),
            })
          )
          .describe("Array of files to create/update"),
        commitMessage: z
          .string()
          .optional()
          .describe("Custom commit message (optional)"),
      },
      async ({ skill: skillName, skill_group, files, commitMessage }) => {
        try {
          const github = this.getGitHubClient();
          const accessControl = await this.getAccessControl();

          // Look up skill to find its group
          const existingSkill = await github.getSkill(skillName);

          let groupName: string;
          let isNewSkill = false;
          let isNewGroup = false;

          if (existingSkill) {
            // Existing skill - use its group (ignore skill_group param)
            groupName = existingSkill.plugin;
          } else {
            // New skill - need to determine/create group
            isNewSkill = true;

            // Only editors can create new skills
            if (!accessControl.isEditor()) {
              return {
                content: [
                  {
                    type: "text" as const,
                    text: JSON.stringify({
                      error: "Access denied",
                      message: "Only editors can create new skills. Use list_skills to see existing skills.",
                    }),
                  },
                ],
                isError: true,
              };
            }

            // Determine group name (defaults to skill name for standalone skills)
            groupName = skill_group || skillName;

            // Check if group exists
            const groupPath = `plugins/${groupName}`;
            const groupExists = await github.fileExists(`${groupPath}/.claude-plugin/plugin.json`);

            if (!groupExists) {
              isNewGroup = true;
              // Create the plugin.json for new group
              const writeClient = this.getWriteGitHubClient();
              const manifest = {
                name: groupName,
                version: "1.0.0",
                description: skill_group ? `Skill group: ${groupName}` : `Skill: ${skillName}`,
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
          }

          // Check write access
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
          // For unpublished groups, construct path directly (getPlugin looks in marketplace.json)
          let basePath: string;
          try {
            const { entry } = await github.getPlugin(groupName);
            basePath = entry.source.replace("./", "");
          } catch {
            // Group exists but isn't published yet - construct path directly
            basePath = `plugins/${groupName}`;
          }

          const results: Array<{ path: string; created: boolean }> = [];
          const baseMessage = commitMessage || `Update ${skillName} skill files`;

          // Validate all file paths before processing any files
          // Paths are relative to the skill directory, we auto-prefix with skills/{dirName}/
          // For existing skills, use dirName (actual folder); for new skills, use skillName
          const skillDirName = existingSkill?.dirName || skillName;
          const skillPrefix = `skills/${skillDirName}/`;
          const validatedFiles: Array<{ path: string; content: string; fullPath: string }> = [];
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

            // Auto-prefix with skills/{skill}/ to get the full path within the group
            const fullPath = `${skillPrefix}${sanitizedPath}`;
            validatedFiles.push({ path: file.path, content: file.content, fullPath });
          }

          // Process each validated file
          for (const file of validatedFiles) {
            const absolutePath = `${basePath}/${file.fullPath}`;
            const fileMessage = `${baseMessage}\n\nFile: ${file.fullPath}\nRequested by: ${this.props.email}`;

            const { created } = await writeClient.upsertFile(
              absolutePath,
              file.content,
              fileMessage
            );
            results.push({ path: absolutePath, created });
          }

          // Clear cache for this skill group
          await github.clearCache(groupName);

          const created = results.filter((r) => r.created).length;
          const updated = results.filter((r) => !r.created).length;

          // Build response with appropriate next steps
          const nextSteps: string[] = [];
          if (isNewSkill && isNewGroup) {
            nextSteps.push("Use publish_skill to make it discoverable in the marketplace");
          }
          nextSteps.push("Use bump_version to release updates");

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    skill: skillName,
                    skill_group: groupName,
                    isNewSkill,
                    isNewGroup,
                    files: results,
                    summary: `${created} file(s) created, ${updated} file(s) updated`,
                    message: isNewSkill
                      ? isNewGroup
                        ? `Created new skill "${skillName}" with new group "${groupName}"`
                        : `Created new skill "${skillName}" in existing group "${groupName}"`
                      : `Updated skill "${skillName}" in group "${groupName}"`,
                    nextSteps,
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

          // Get plugin info - requires skill to be published
          let entry, manifest;
          try {
            const result = await github.getPlugin(groupName);
            entry = result.entry;
            manifest = result.manifest;
          } catch {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    error: "Skill not published",
                    message: `Skill "${skillName}" is not published yet. Use publish_skill first.`,
                  }),
                },
              ],
              isError: true,
            };
          }

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

    // Tool: publish_skill
    this.server.tool(
      "publish_skill",
      "Make a skill discoverable in the marketplace. " +
        "Call this after creating/updating the skill to make it visible to users.",
      {
        skill: z.string().describe("Skill name (from save_skill or list_skills)"),
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
                    message: `Skill "${skillName}" not found. Use save_skill first to create the skill.`,
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
