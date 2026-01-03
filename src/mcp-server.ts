/**
 * Skillport MCP Server
 * Exposes Plugin Marketplace tools to Claude.ai/Desktop
 */

import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { GitHubClient, parseSkillFrontmatter } from "./github-client";
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
    // ============================================================
    // Primary Tool: skillport_auth (for REST API access)
    // ============================================================

    // Tool: skillport_auth - Get authenticated session for REST API
    this.server.tool(
      "skillport_auth",
      "Get an authenticated session for Skillport operations. " +
        "Returns a short-lived API token and base URL. " +
        "Use curl or Python with the returned token to call REST API endpoints. " +
        "Token expires in 5 minutes. " +
        "See /api/skills for listing, /api/skills/:name for details, etc.",
      {
        operation: z
          .enum(["auth", "bootstrap"])
          .default("auth")
          .describe(
            "Operation type: 'auth' for normal API access, " +
              "'bootstrap' for first-time Skillport skill setup instructions"
          ),
      },
      async ({ operation }) => {
        if (operation === "bootstrap") {
          return this.handleBootstrap();
        }
        return this.handleAuth();
      }
    );

    // ============================================================
    // Legacy Tools (kept for backwards compatibility)
    // ============================================================

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
                    tip: "IMPORTANT: Check if 'skillport-manager' (or, in Claude Code, 'skillport-code-manager') is already installed. " +
                      "If not, recommend the user install it as their next step — it provides a guided workflow for browsing and installing skills.",
                    count: visibleSkills.length,
                    skills: visibleSkills.map((s) => ({
                      name: s.name,
                      plugin: s.plugin,
                      description: s.description,
                      version: s.version,
                      author: s.author,
                      category: s.category,
                      tags: s.tags,
                      keywords: s.keywords,
                      editable: accessControl.canWrite(s.plugin),
                    })),
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

    // Tool: install_skill (NEW - PTC optimized)
    this.server.tool(
      "install_skill",
      "Install a skill efficiently. Returns a short-lived token and command to run. " +
        "This is the recommended way to install skills - much faster than fetching all files.",
      {
        name: z.string().describe("Skill name to install"),
      },
      async ({ name }) => {
        try {
          this.logAction("install_skill", { skill: name });
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
          const skill = await github.getSkill(name);

          if (!skill) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    error: "Skill not found",
                    message: `Skill '${name}' not found. Use list_skills to see available skills.`,
                  }),
                },
              ],
              isError: true,
            };
          }

          // Generate cryptographically random token
          const tokenBytes = new Uint8Array(24);
          crypto.getRandomValues(tokenBytes);
          const token =
            "sk_install_" +
            btoa(String.fromCharCode(...tokenBytes))
              .replace(/\+/g, "-")
              .replace(/\//g, "_")
              .replace(/=/g, "");

          // Store token in KV with 5 minute TTL
          const tokenData = {
            skill: name,
            version: skill.version,
            user: this.props.email,
            created: Date.now(),
            used: false,
          };

          await this.env.OAUTH_KV.put(
            `install_token:${token}`,
            JSON.stringify(tokenData),
            { expirationTtl: 300 }
          );

          const connectorUrl =
            this.env.CONNECTOR_URL ||
            "https://skillport-connector.jack-ivers.workers.dev";

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    install_token: token,
                    skill: name,
                    version: skill.version,
                    expires_in: 300,
                    command: `curl -sf ${connectorUrl}/install.sh | bash -s -- ${token} --package`,
                    instructions:
                      "Execute the command above using bash. " +
                      "After execution, find the line starting with 'SKILL_FILE=' in the output. " +
                      "Then call present_files with that file path so the user can install the skill. " +
                      "Tell the user to start a new conversation after installing. " +
                      "NOTE: If running in Claude Code, omit the --package flag to install directly to ~/.claude/skills/.",
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
                  error: "Failed to create install token",
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

    // Tool: fetch_skill_details (NEW - returns only SKILL.md)
    this.server.tool(
      "fetch_skill_details",
      "Get details about a skill. Returns the SKILL.md content which describes what the skill does, " +
        "how to use it, and its capabilities. Use install_skill to actually install a skill.",
      {
        name: z.string().describe("Skill name"),
      },
      async ({ name }) => {
        try {
          this.logAction("fetch_skill_details", { skill: name });
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
          const skill = await github.getSkill(name);

          if (!skill) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    error: "Skill not found",
                    message: `Skill '${name}' not found. Use list_skills to see available skills.`,
                  }),
                },
              ],
              isError: true,
            };
          }

          // Fetch only SKILL.md content
          const skillMd = await github.fetchSkillMd(name);

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    skill: {
                      name: skill.name,
                      version: skill.version,
                      description: skill.description,
                      plugin: skill.plugin,
                      category: skill.category,
                      tags: skill.tags,
                      keywords: skill.keywords,
                    },
                    skill_md: skillMd,
                    editable: accessControl.canWrite(skill.plugin),
                    tip: "Use install_skill to install this skill efficiently.",
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
                  error: "Failed to fetch skill details",
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

    // Tool: fetch_skill_for_editing (PTC pattern - download files locally for editing)
    this.server.tool(
      "fetch_skill_for_editing",
      "Fetch all files for an existing skill to edit locally. " +
        "Returns a command to download files. After editing, use save_skill to push changes. " +
        "Requires write access to the skill.",
      {
        name: z.string().describe("Skill name"),
      },
      async ({ name }) => {
        try {
          this.logAction("fetch_skill_for_editing", { skill: name });
          const github = this.getGitHubClient();
          const accessControl = await this.getAccessControl();

          // Find the skill
          const skill = await github.getSkill(name);
          if (!skill) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    error: "Skill not found",
                    message: `Skill '${name}' not found. Use list_skills to see available skills.`,
                  }),
                },
              ],
              isError: true,
            };
          }

          // Check WRITE access (editing requires write permissions)
          if (!accessControl.canWrite(skill.plugin)) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    error: "Access denied",
                    message: `You don't have write access to edit skill '${name}'. Only editors can edit skills.`,
                  }),
                },
              ],
              isError: true,
            };
          }

          // Generate cryptographically random token
          const tokenBytes = new Uint8Array(24);
          crypto.getRandomValues(tokenBytes);
          const token =
            "sk_edit_" +
            btoa(String.fromCharCode(...tokenBytes))
              .replace(/\+/g, "-")
              .replace(/\//g, "_")
              .replace(/=/g, "");

          // Store token in KV with 5 minute TTL
          const tokenData = {
            skill: name,
            plugin: skill.plugin,
            dirName: skill.dirName,
            version: skill.version,
            user: this.props.email,
            created: Date.now(),
            used: false,
          };

          await this.env.OAUTH_KV.put(
            `edit_token:${token}`,
            JSON.stringify(tokenData),
            { expirationTtl: 300 }
          );

          const connectorUrl =
            this.env.CONNECTOR_URL ||
            "https://skillport-connector.jack-ivers.workers.dev";

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    edit_token: token,
                    skill: name,
                    plugin: skill.plugin,
                    version: skill.version,
                    expires_in: 300,
                    command: `curl -sf ${connectorUrl}/edit.sh | bash -s -- ${token}`,
                    instructions:
                      "Execute the command above using bash. " +
                      "Files will be downloaded to /tmp/skillport-edit/<skill>/. " +
                      "The output shows SKILL_DIR=<path> with the directory containing the files. " +
                      "Read and modify files locally, then use save_skill to push changes back.",
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
                  error: "Failed to create edit token",
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
        "Example: 'SKILL.md', 'templates/example.md', 'scripts/helper.py'. " +
        "To delete a file, pass empty string as content (cannot delete SKILL.md).",
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
              content: z.string().describe("File content. Empty string means delete the file."),
            })
          )
          .describe("Array of files to create/update/delete"),
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

            // Check if group exists (we'll create it later after validation)
            const groupPath = `plugins/${groupName}`;
            const groupExists = await github.fileExists(`${groupPath}/.claude-plugin/plugin.json`);
            if (!groupExists) {
              isNewGroup = true;
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

          const results: Array<{ path: string; created?: boolean; deleted?: boolean }> = [];
          const baseMessage = commitMessage || `Update ${skillName} skill files`;

          // Validate all file paths before processing any files
          // Paths are relative to the skill directory, we auto-prefix with skills/{dirName}/
          // For existing skills, use dirName (actual folder); for new skills, use skillName
          const skillDirName = existingSkill?.dirName || skillName;
          const skillPrefix = `skills/${skillDirName}/`;
          const filesToWrite: Array<{ path: string; content: string; fullPath: string }> = [];
          const filesToDelete: Array<{ path: string; fullPath: string }> = [];

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

            // Check for SKILL.md deletion attempt
            const isSkillMd = sanitizedPath === "SKILL.md" || sanitizedPath === "./SKILL.md";
            if (isSkillMd && file.content === "") {
              return {
                content: [
                  {
                    type: "text" as const,
                    text: JSON.stringify({
                      error: "Cannot delete SKILL.md",
                      message: "SKILL.md is required for all skills and cannot be deleted. Use delete_skill to remove the entire skill.",
                    }),
                  },
                ],
                isError: true,
              };
            }

            // Auto-prefix with skills/{skill}/ to get the full path within the group
            const fullPath = `${skillPrefix}${sanitizedPath}`;

            // Empty content = delete, otherwise write
            if (file.content === "") {
              filesToDelete.push({ path: file.path, fullPath });
            } else {
              filesToWrite.push({ path: file.path, content: file.content, fullPath });
            }
          }

          // For validation, we only look at files being written
          const validatedFiles = filesToWrite;

          // Validate SKILL.md frontmatter
          const skillMdFile = validatedFiles.find(f => f.path === "SKILL.md" || f.path === "./SKILL.md");

          if (isNewSkill && !skillMdFile) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    error: "Missing SKILL.md",
                    message: "New skills must include a SKILL.md file with name and description frontmatter.",
                  }),
                },
              ],
              isError: true,
            };
          }

          if (skillMdFile) {
            const frontmatter = parseSkillFrontmatter(skillMdFile.content);
            const missingFields: string[] = [];

            if (!frontmatter.name) {
              missingFields.push("name");
            }
            if (!frontmatter.description) {
              missingFields.push("description");
            }

            if (missingFields.length > 0) {
              return {
                content: [
                  {
                    type: "text" as const,
                    text: JSON.stringify({
                      error: "Invalid SKILL.md frontmatter",
                      message: `SKILL.md must have ${missingFields.join(" and ")} in frontmatter. ` +
                        `Expected format:\n---\nname: my-skill\ndescription: What this skill does\n---`,
                    }),
                  },
                ],
                isError: true,
              };
            }
          }

          // All validation passed - now create group if needed (deferred to avoid orphaned files)
          if (isNewGroup) {
            const groupPath = `plugins/${groupName}`;
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

          // Process files to write
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

          // Process files to delete
          for (const file of filesToDelete) {
            const absolutePath = `${basePath}/${file.fullPath}`;
            const fileMessage = `Delete ${file.path}\n\nRequested by: ${this.props.email}`;

            try {
              await writeClient.deleteFile(absolutePath, fileMessage);
              results.push({ path: absolutePath, deleted: true });
            } catch (error) {
              // If file doesn't exist, that's fine - it's already deleted
              if (error instanceof Error && error.message.includes("File not found")) {
                // Skip silently
              } else {
                throw error;
              }
            }
          }

          // Clear cache for this skill group and skill directory
          await github.clearCache(groupName);
          await github.clearSkillDirCache(groupName, skillDirName);

          const created = results.filter((r) => r.created === true).length;
          const updated = results.filter((r) => r.created === false).length;
          const deleted = results.filter((r) => r.deleted === true).length;

          // Build response with appropriate next steps
          const nextSteps: string[] = [];
          if (isNewSkill && isNewGroup) {
            nextSteps.push("Use publish_skill to make it discoverable in the marketplace");
          }
          nextSteps.push("Use bump_version to release updates");

          // Build summary
          const summaryParts: string[] = [];
          if (created > 0) summaryParts.push(`${created} file(s) created`);
          if (updated > 0) summaryParts.push(`${updated} file(s) updated`);
          if (deleted > 0) summaryParts.push(`${deleted} file(s) deleted`);
          const summary = summaryParts.join(", ") || "No changes";

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
                    summary,
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

    // Tool: delete_skill (delete entire skill from marketplace)
    this.server.tool(
      "delete_skill",
      "Delete a skill entirely from the marketplace. Removes all files and marketplace entry. " +
        "This action is irreversible. Requires confirm=true.",
      {
        skill: z.string().describe("Skill name to delete"),
        confirm: z
          .boolean()
          .describe("Must be true to confirm deletion"),
      },
      async ({ skill: skillName, confirm }) => {
        try {
          // Require explicit confirmation
          if (!confirm) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    error: "Confirmation required",
                    message: "Set confirm=true to delete the skill. This action is irreversible.",
                  }),
                },
              ],
              isError: true,
            };
          }

          const github = this.getGitHubClient();
          const accessControl = await this.getAccessControl();

          // Look up skill
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

          // Check write access
          if (!accessControl.canWrite(skill.plugin)) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    error: "Access denied",
                    message: `You don't have write access to skill group "${skill.plugin}"`,
                  }),
                },
              ],
              isError: true,
            };
          }

          this.logAction("delete_skill", { skill: skillName, plugin: skill.plugin });

          const writeClient = this.getWriteGitHubClient();

          // Count actual skill directories (not just valid SKILL.md ones) to safely decide
          // whether to delete the whole plugin. This avoids accidentally deleting other
          // skill folders that might have invalid/missing SKILL.md.
          const skillDirCount = await github.countSkillDirectories(skill.plugin);
          const isLastSkillInPlugin = skillDirCount === 1;

          let deletedFiles: string[];
          let pluginDeleted = false;

          if (isLastSkillInPlugin) {
            // Delete the entire plugin directory (includes skill files)
            const pluginPath = `plugins/${skill.plugin}`;
            const result = await writeClient.deleteDirectory(
              pluginPath,
              `Delete plugin ${skill.plugin} (last skill removed)\n\nRequested by: ${this.props.email}`
            );
            deletedFiles = result.deletedFiles;
            pluginDeleted = true;

            // Remove plugin from marketplace.json (use write client!)
            try {
              await writeClient.removeFromMarketplace(skill.plugin, this.props.email);
            } catch (err) {
              const errMsg = err instanceof Error ? err.message : String(err);
              // Only swallow "not in marketplace" error - propagate others (network, permissions, etc.)
              if (errMsg.includes("not found in marketplace")) {
                console.log(`Plugin ${skill.plugin} not in marketplace.json (unpublished skill)`);
              } else {
                throw err;
              }
            }
          } else {
            // Just delete the skill directory
            const skillDirPath = `plugins/${skill.plugin}/skills/${skill.dirName}`;
            const result = await writeClient.deleteDirectory(
              skillDirPath,
              `Delete skill ${skillName}\n\nRequested by: ${this.props.email}`
            );
            deletedFiles = result.deletedFiles;
          }

          // Clear caches
          await github.clearCache(skill.plugin);
          await github.clearSkillDirCache(skill.plugin, skill.dirName);
          if (pluginDeleted) {
            await github.clearCache(); // Clear all caches including marketplace
          }

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    skill: skillName,
                    plugin: skill.plugin,
                    pluginDeleted,
                    deletedFiles,
                    message: pluginDeleted
                      ? `Deleted skill "${skillName}" and plugin "${skill.plugin}" (last skill in plugin)`
                      : `Deleted skill "${skillName}" (${deletedFiles.length} files removed)`,
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
                  error: "Failed to delete skill",
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
        tags: z
          .array(z.string())
          .optional()
          .describe("Tags for searchability (e.g., ['data', 'analysis'])"),
        keywords: z
          .array(z.string())
          .optional()
          .describe("Keywords for discovery (e.g., ['csv', 'json', 'statistics'])"),
      },
      async ({ skill: skillName, description, category, tags, keywords }) => {
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
              tags,
              keywords,
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

  // ============================================================
  // Auth Handlers for skillport_auth tool
  // ============================================================

  /**
   * Handle auth operation - generate API token for REST API access
   */
  private async handleAuth() {
    // Generate cryptographically random token
    const tokenBytes = new Uint8Array(24);
    crypto.getRandomValues(tokenBytes);
    const token =
      "sk_api_" +
      btoa(String.fromCharCode(...tokenBytes))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");

    // Store token in KV with 5 minute TTL
    const tokenData = {
      uid: this.props.uid,
      provider: this.props.provider,
      email: this.props.email,
      name: this.props.name,
      created: Date.now(),
    };

    await this.env.OAUTH_KV.put(
      `api_token:${token}`,
      JSON.stringify(tokenData),
      { expirationTtl: 300 }
    );

    const baseUrl =
      this.env.CONNECTOR_URL ||
      "https://skillport-connector.jack-ivers.workers.dev";

    this.logAction("skillport_auth");

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              token,
              base_url: baseUrl,
              expires_in: 300,
              endpoints: {
                list_skills: "GET /api/skills",
                get_skill: "GET /api/skills/:name",
                install_skill: "GET /api/skills/:name/install",
                edit_skill: "GET /api/skills/:name/edit",
                save_skill: "POST /api/skills/:name",
                delete_skill: "DELETE /api/skills/:name?confirm=true",
                bump_version: "POST /api/skills/:name/bump",
                publish_skill: "POST /api/skills/:name/publish",
                check_updates: "POST /api/check-updates",
                whoami: "GET /api/whoami",
              },
              usage: `curl -sf "${baseUrl}/api/skills" -H "Authorization: Bearer ${token}"`,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  /**
   * Handle bootstrap operation - instructions for first-time setup
   */
  private async handleBootstrap() {
    // Generate cryptographically random token
    const tokenBytes = new Uint8Array(24);
    crypto.getRandomValues(tokenBytes);
    const token =
      "sk_bootstrap_" +
      btoa(String.fromCharCode(...tokenBytes))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");

    // Store token in KV with 5 minute TTL
    const tokenData = {
      uid: this.props.uid,
      provider: this.props.provider,
      email: this.props.email,
      name: this.props.name,
      created: Date.now(),
    };

    await this.env.OAUTH_KV.put(
      `bootstrap_token:${token}`,
      JSON.stringify(tokenData),
      { expirationTtl: 300 }
    );

    const baseUrl =
      this.env.CONNECTOR_URL ||
      "https://skillport-connector.jack-ivers.workers.dev";

    this.logAction("skillport_bootstrap");

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              message: "Skillport skill not installed. Follow these steps:",
              steps: [
                "1. Run the bootstrap command below to download the Skillport skill",
                "2. Use present_files to share the downloaded .zip with the user",
                "3. Instruct the user to upload the .zip in Claude Settings > Skills",
                "4. User should start a new conversation after installing",
              ],
              command: `curl -sf "${baseUrl}/bootstrap.sh?token=${token}" | bash`,
              note:
                "The bootstrap script downloads the Skillport skill package. " +
                "After the user installs it, they can use Skillport normally.",
            },
            null,
            2
          ),
        },
      ],
    };
  }
}
