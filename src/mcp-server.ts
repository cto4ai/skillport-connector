import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { dispatch } from "./dispatch";
import { SearchIndex } from "./search-index";
import { getSearchChunks } from "./search-chunks";
import { resolveConnectorUrl, getCliUrl } from "./config";
import { ExecuteInputSchema, SearchInputSchema } from "./types";
import type { UserProps, SearchChunk } from "./types";

const METHOD_SUMMARY = "auth.get_code, auth.whoami";

function getReadmeContent(env: Env): string {
  const cliUrl = getCliUrl(env);
  return (
    "# Skillport\n\n" +
    "Browse, install, author, and publish plugins and skills for Claude Code plugin marketplaces.\n\n" +
    "## Quick Start\n\n" +
    "1. Get an auth code: `execute({ method: \"auth.get_code\" })`\n" +
    `2. Download the CLI: \`curl -sO ${cliUrl}\`\n` +
    "3. Run a command: `node skillport.js list --code <CODE>`\n\n" +
    "## CLI Commands\n\n" +
    "All remote commands require `--code <CODE>` from step 1.\n\n" +
    "**Browse:**\n" +
    "- `list [--surface CC|CD|CAI|CALL]` — List plugins in the marketplace\n" +
    "- `info <name>` — Plugin or skill details (works with either)\n" +
    "- `updates --installed '<json>'` — Check for version updates\n" +
    "- `whoami` — Show authenticated user\n\n" +
    "**Install:**\n" +
    "- `get <name>` — Download skill files to current directory\n" +
    "- `get <plugin> --skill <skill>` — Download specific skill from a plugin\n" +
    "- `get <plugin> --skills-only` — Download all skills as standalone\n" +
    "- `get <name> --format skill` — Download as .skill ZIP\n" +
    "- `get <plugin> --format plugin` — Download as .plugin ZIP\n\n" +
    "**Author:**\n" +
    "- `create <name>` — Scaffold a new plugin locally (no auth needed)\n" +
    "- `create --skill <name>` — Scaffold a standalone skill\n" +
    "- `save <name> <patch|minor|major>` — Push local files + bump version\n" +
    "- `save <plugin> --skill <skill> <bump>` — Save one skill within a plugin\n\n" +
    "**Lifecycle:**\n" +
    "- `deactivate <name>` — Remove from marketplace (keeps files)\n" +
    "- `reactivate <name>` — Restore to marketplace\n" +
    "- `delete <name> --confirm` — Permanently remove (must deactivate first)\n" +
    "- `sync [--dry-run]` — Regenerate marketplace.json\n\n" +
    "## Tips\n\n" +
    "- The CLI auto-updates when a new version is available\n" +
    "- Use `search` tool for detailed docs on any command or workflow\n" +
    "- `list` shows plugins grouped by name; multi-skill plugins expand to show skills\n" +
    "- `info` works with both plugin names and skill names\n"
  );
}

interface State {
  searchIndex: null;
}

export class SkillportMCP extends McpAgent<Env, State, UserProps> {
  server = new McpServer(
    {
      name: "skillport",
      version: "3.0.0",
    },
    {
      instructions:
        "Skillport — browse, install, author, and publish plugins and skills " +
        "for Claude Code plugin marketplaces.\n\n" +
        "Three tools available:\n" +
        "- readme: Call this first — returns full usage guide with all CLI commands\n" +
        "- execute: Auth methods (auth.get_code, auth.whoami)\n" +
        "- search: Query documentation on specific commands or workflows\n\n" +
        "Workflow: call readme → get auth code via execute → download CLI → use CLI for all operations.",
    },
  );

  initialState: State = { searchIndex: null };

  private cachedIndex: SearchIndex | null = null;

  private getSearchIndex(): SearchIndex {
    if (this.cachedIndex) return this.cachedIndex;
    this.cachedIndex = new SearchIndex(getSearchChunks(resolveConnectorUrl(this.env)));
    return this.cachedIndex;
  }

  async init() {
    // Validate CONNECTOR_URL at init time (logs warnings for missing/malformed)
    resolveConnectorUrl(this.env);

    // ── readme tool ─────────────────────────────────────────────
    this.server.registerTool(
      "readme",
      {
        description:
          "How to use Skillport — call this first. Returns the full guide: " +
          "setup, CLI commands, workflows, and tips.",
        inputSchema: {},
      },
      async () => {
        const timestamp = new Date().toISOString();
        console.log(`[AUDIT] ${timestamp} user=${this.props?.email} action=readme`);

        return {
          content: [{ type: "text" as const, text: getReadmeContent(this.env) }],
        };
      },
    );

    // ── execute tool ────────────────────────────────────────────
    this.server.registerTool(
      "execute",
      {
        description:
          `Run a Skillport auth method. Available: ${METHOD_SUMMARY}. ` +
          "Call auth.get_code to get a CLI auth code, then download and run the CLI " +
          `(curl -sO ${getCliUrl(this.env)}). ` +
          "The CLI handles all marketplace operations (list, get, save, etc.). " +
          "Call readme for the full command reference.",
        inputSchema: ExecuteInputSchema,
      },
      async ({ method, args }) => {
        const uid = this.props?.uid;
        if (!uid) {
          return {
            content: [{ type: "text" as const, text: "Not authenticated" }],
            isError: true,
          };
        }

        const timestamp = new Date().toISOString();
        console.log(`[AUDIT] ${timestamp} user=${this.props?.email} action=execute:${method}`);

        try {
          return await dispatch(method, args ?? {}, this.env, `${this.props.provider}:${uid}`, {
            uid: this.props.uid,
            provider: this.props.provider,
            email: this.props.email,
            name: this.props.name,
          });
        } catch (error) {
          console.error(`[execute] Unhandled error in ${method}:`, error);
          return {
            content: [{ type: "text" as const, text: `Internal error executing ${method}: ${error instanceof Error ? error.message : String(error)}` }],
            isError: true,
          };
        }
      },
    );

    // ── search tool ─────────────────────────────────────────────
    this.server.registerTool(
      "search",
      {
        description:
          "Search Skillport documentation — command usage, workflows, " +
          "plugin structure, and best practices. " +
          "This searches docs only, not the live marketplace catalog. " +
          "To browse plugins, use the CLI (skillport list). " +
          "Call readme first for an overview.",
        inputSchema: SearchInputSchema,
      },
      async ({ query, limit }) => {
        const timestamp = new Date().toISOString();
        console.log(`[AUDIT] ${timestamp} user=${this.props?.email} action=search:${query}`);

        const index = this.getSearchIndex();
        const results = index.search(query, limit);

        if (results.length === 0) {
          const topicList = index
            .listTopics()
            .map((t) => `- **${t.id}**: ${t.title} _(${t.category})_`)
            .join("\n");

          return {
            content: [
              {
                type: "text" as const,
                text: topicList.length > 0
                  ? `No results for "${query}". Try one of these topics:\n\n${topicList}`
                  : `No results for "${query}". The search index is empty.`,
              },
            ],
          };
        }

        const formatted = results
          .map((chunk) => `## ${chunk.title}\n*${chunk.category}*\n\n${chunk.content}`)
          .join("\n\n---\n\n");

        return {
          content: [{ type: "text" as const, text: formatted }],
        };
      },
    );
  }
}
