# Phase 4: MCP Tools Implementation

## Objective

Implement the four MCP tools that expose the Plugin Marketplace to Claude.ai/Desktop.

## Tool Definitions

| Tool | Purpose | Parameters |
|------|---------|------------|
| `list_plugins` | Browse available plugins | `category?`, `surface?` |
| `get_plugin` | Get plugin details | `name` |
| `fetch_skill` | Get skill files for installation | `name` |
| `check_updates` | Check for newer versions | `installed[]` |

## Implementation: src/mcp-server.ts

```typescript
import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { GitHubClient } from "./github-client";

interface Props {
  email: string;
  name: string;
  picture?: string;
  domain?: string;
}

export class SkillportMCP extends McpAgent<Env, unknown, Props> {
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
          .describe("Filter by surface: 'claude-code', 'claude-desktop', or 'claude-ai'"),
      },
      async ({ category, surface }) => {
        try {
          const github = this.getGitHubClient();
          const plugins = await github.listPlugins({ category, surface });

          return {
            content: [
              {
                type: "text",
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
                type: "text",
                text: JSON.stringify({
                  error: "Failed to list plugins",
                  message: error instanceof Error ? error.message : String(error),
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
          const github = this.getGitHubClient();
          const { entry, manifest } = await github.getPlugin(name);

          return {
            content: [
              {
                type: "text",
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
                type: "text",
                text: JSON.stringify({
                  error: "Plugin not found",
                  message: error instanceof Error ? error.message : String(error),
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
          const github = this.getGitHubClient();
          const { plugin, files } = await github.fetchSkill(name);

          return {
            content: [
              {
                type: "text",
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
                      "To install this skill on Claude.ai/Desktop:\n" +
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
                type: "text",
                text: JSON.stringify({
                  error: "Failed to fetch skill",
                  message: error instanceof Error ? error.message : String(error),
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
          const github = this.getGitHubClient();
          const updates = await github.checkUpdates(installed);

          return {
            content: [
              {
                type: "text",
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
                type: "text",
                text: JSON.stringify({
                  error: "Failed to check updates",
                  message: error instanceof Error ? error.message : String(error),
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
```

## Main Entry Point: src/index.ts

```typescript
import { OAuthProvider } from "@cloudflare/workers-oauth-provider";
import googleHandler from "./google-handler";
import { SkillportMCP } from "./mcp-server";

export { SkillportMCP };

export default new OAuthProvider({
  apiRoute: ["/sse", "/mcp"],
  apiHandler: SkillportMCP.mount("/"),
  defaultHandler: googleHandler,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
});
```

## Example Tool Responses

### list_plugins

```json
{
  "count": 2,
  "plugins": [
    {
      "name": "sales-pitch",
      "description": "Generate compelling sales pitches",
      "version": "1.2.0",
      "category": "sales",
      "surfaces": ["claude-code", "claude-desktop", "claude-ai"]
    },
    {
      "name": "example-skill",
      "description": "Example skill demonstrating the format",
      "version": "1.0.0",
      "category": "examples",
      "surfaces": ["claude-code", "claude-desktop", "claude-ai"]
    }
  ]
}
```

### get_plugin

```json
{
  "name": "sales-pitch",
  "description": "Generate compelling sales pitches from product specs",
  "version": "1.2.0",
  "author": { "name": "Sales Team", "email": "sales@example.com" },
  "category": "sales",
  "tags": ["sales", "writing", "proposals"],
  "surfaces": ["claude-code", "claude-desktop", "claude-ai"],
  "permissions": ["web_search"],
  "license": "MIT"
}
```

### fetch_skill

```json
{
  "plugin": {
    "name": "sales-pitch",
    "version": "1.2.0"
  },
  "files": [
    {
      "path": "SKILL.md",
      "content": "---\nname: sales-pitch\ndescription: Generate compelling sales pitches...\n---\n\n# Sales Pitch Generator\n\n## When to Use This Skill\n..."
    }
  ],
  "instructions": "To install this skill on Claude.ai/Desktop:\n1. Copy the SKILL.md content\n..."
}
```

### check_updates

```json
{
  "hasUpdates": true,
  "updates": [
    {
      "name": "sales-pitch",
      "installedVersion": "1.0.0",
      "availableVersion": "1.2.0"
    }
  ],
  "message": "1 update(s) available"
}
```

## User Context in Tools

The authenticated user's info is available via `this.props`:

```typescript
// Inside a tool
console.log(`User ${this.props.email} is listing plugins`);

// Optional: Restrict tools by domain
if (this.props.domain !== "allowed-domain.com") {
  return { content: [{ type: "text", text: "Unauthorized domain" }], isError: true };
}
```

## Error Handling Best Practices

1. Always return valid JSON
2. Use `isError: true` for error responses
3. Include actionable error messages
4. Don't expose internal error details to users
