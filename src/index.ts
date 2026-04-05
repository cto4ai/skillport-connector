/**
 * Skillport Connector v3 — CLI + Auth Backend
 *
 * Cloudflare Worker that:
 * - Provides MCP with auth (get_code) + CLI documentation (search)
 * - Serves REST API for CLI operations
 * - Serves the bundled CLI JS file
 * - Handles Google OAuth for user authentication
 */

import { OAuthProvider } from "@cloudflare/workers-oauth-provider";
import googleHandler from "./google-handler";
import { SkillportMCP } from "./mcp-server";
import { handleAPI } from "./rest-api";

// Export MCP server class for Durable Objects
export { SkillportMCP };

// v3 MCP handlers
const sseHandler = SkillportMCP.mount("/sse");
const httpHandler = SkillportMCP.serve("/mcp");

const mcpHandler = {
  fetch: (request: Request, env: Env, ctx: ExecutionContext) => {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/sse")) {
      return sseHandler.fetch(request, env, ctx);
    }
    return httpHandler.fetch(request, env, ctx);
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const oauthProvider = new OAuthProvider({
  apiRoute: ["/mcp", "/sse", "/sse/message"],
  apiHandler: mcpHandler as any,
  defaultHandler: googleHandler,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
});

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // CLI version check (no auth required)
    if (url.pathname === "/cli/version") {
      const version = await env.OAUTH_KV.get("cli:version", "text");
      return new Response(JSON.stringify({ version: version || "unknown" }), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=60",
        },
      });
    }

    // Serve CLI bundle (no auth required)
    if (url.pathname === "/cli/skillport.js") {
      const js = await env.OAUTH_KV.get("cli:bundle", "text");
      if (!js) {
        return new Response("CLI not yet deployed", { status: 404 });
      }
      return new Response(js, {
        headers: {
          "Content-Type": "application/javascript",
          "Cache-Control": "public, max-age=300",
        },
      });
    }

    // REST API
    if (url.pathname.startsWith("/api/")) {
      return handleAPI(request, env);
    }

    // MCP + OAuth
    const response = await oauthProvider.fetch(request, env, ctx);

    // Add Access-Control-Expose-Headers for CORS — required for Claude.ai
    // to read the WWW-Authenticate header during OAuth negotiation
    const origin = request.headers.get("Origin");
    if (origin) {
      const newResponse = new Response(response.body, response);
      newResponse.headers.set("Access-Control-Expose-Headers", "WWW-Authenticate");
      return newResponse;
    }

    return response;
  },
};
