/**
 * Skillport MCP Server
 * Exposes Plugin Marketplace tools to Claude.ai/Desktop
 */

import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { GitHubClient } from "./github-client";

interface UserProps extends Record<string, unknown> {
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

  private getGitHubClient(): GitHubClient {
    return new GitHubClient(
      this.env.GITHUB_SERVICE_TOKEN,
      this.env.MARKETPLACE_REPO,
      this.env.OAUTH_KV
    );
  }

  /**
   * Log user action for audit trail
   * Priority: OAuth session email > user_email param (authless) > "unknown"
   */
  private logAction(action: string, opts?: { plugin?: string; user_email?: string }): void {
    const email = this.props?.email || opts?.user_email || "unknown";
    const timestamp = new Date().toISOString();
    const pluginInfo = opts?.plugin ? ` plugin=${opts.plugin}` : "";
    console.log(`[AUDIT] ${timestamp} user=${email} action=${action}${pluginInfo}`);
  }

  async init() {
    // Tool: list_plugins
    this.server.tool(
      "list_plugins",
      "List all plugins available in the marketplace. Optionally filter by category or target surface.",
      {
        user_email: z
          .string()
          .email()
          .optional()
          .describe("User email for audit logging (provided by Skillport Skill)"),
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
      async ({ user_email, category, surface }) => {
        try {
          this.logAction("list_plugins", { user_email });
          const github = this.getGitHubClient();
          const plugins = await github.listPlugins({ category, surface });

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    count: plugins.length,
                    plugins: plugins.map((p) => ({
                      name: p.name,
                      description: p.description,
                      version: p.version,
                      category: p.category,
                      surfaces: p.surfaces,
                    })),
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
        user_email: z
          .string()
          .email()
          .optional()
          .describe("User email for audit logging (provided by Skillport Skill)"),
        name: z.string().describe("Plugin name (e.g., 'sales-pitch')"),
      },
      async ({ user_email, name }) => {
        try {
          this.logAction("get_plugin", { plugin: name, user_email });
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
        user_email: z
          .string()
          .email()
          .optional()
          .describe("User email for audit logging (provided by Skillport Skill)"),
        name: z.string().describe("Plugin name containing the skill"),
      },
      async ({ user_email, name }) => {
        try {
          this.logAction("fetch_skill", { plugin: name, user_email });
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
                    instructions:
                      "RECOMMENDED: If the skillport-manager skill is installed, read " +
                      "/mnt/skills/user/skillport-manager/SKILL.md and follow its " +
                      "'Install a Skill' workflow. This packages the skill as a .skill file " +
                      "with a one-click 'Copy to your skills' button.\n\n" +
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
        user_email: z
          .string()
          .email()
          .optional()
          .describe("User email for audit logging (provided by Skillport Skill)"),
        installed: z
          .array(
            z.object({
              name: z.string().describe("Plugin name"),
              version: z.string().describe("Currently installed version"),
            })
          )
          .describe("List of installed plugins with their versions"),
      },
      async ({ user_email, installed }) => {
        try {
          this.logAction("check_updates", { user_email });
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
  }
}
