import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { dispatch } from "./dispatch";
import { SearchIndex } from "./search-index";
import { SEARCH_CHUNKS } from "./search-chunks";
import { ExecuteInputSchema, SearchInputSchema } from "./types";
import type { UserProps, SearchChunk } from "./types";

const METHOD_SUMMARY = "auth.get_code, auth.whoami";

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
        "Skillport CLI manager — install, author, and publish plugins and skills " +
        "for Claude Code plugin marketplaces.\n\n" +
        "Two tools available:\n" +
        "- execute: Auth methods ({ method, args }). Call auth.get_code to get a CLI auth code.\n" +
        "- search: Query CLI documentation on-demand.\n\n" +
        // FIXME: hardcoded worker URL — should use CONNECTOR_URL from env
        // but McpServer instructions are static (set before env is available).
        // Options: make instructions dynamic in init(), or use a generic domain.
        "Quick start:\n" +
        "1. execute({ method: \"auth.get_code\" }) → get a code\n" +
        "2. curl -sO https://skillport-connector.jack-ivers.workers.dev/cli/skillport.js\n" +
        "3. node skillport.js list --code <CODE>\n\n" +
        "Call search(\"getting started\") for full workflow details.",
    },
  );

  initialState: State = { searchIndex: null };

  private cachedIndex: SearchIndex | null = null;

  private getSearchIndex(): SearchIndex {
    if (this.cachedIndex) return this.cachedIndex;
    this.cachedIndex = new SearchIndex(SEARCH_CHUNKS);
    return this.cachedIndex;
  }

  async init() {
    this.server.registerTool(
      "execute",
      {
        description:
          `Execute a Skillport method. Available: ${METHOD_SUMMARY}. ` +
          "Auth is automatic — call auth.get_code to get a CLI auth code.",
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

    this.server.registerTool(
      "search",
      {
        description:
          "Search Skillport CLI documentation — commands, workflows, " +
          "plugin structure, surface compatibility, and best practices. " +
          "Query by topic.",
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
