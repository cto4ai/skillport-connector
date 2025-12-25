/**
 * Authless Skillport Connector
 *
 * Bypasses OAuth for Claude.ai compatibility (workaround for OAuth discovery bug).
 * Uses API key authentication via query parameter.
 *
 * Usage: https://skillport-connector.jack-ivers.workers.dev/sse?api_key=sk_xxx
 */

import { SkillportMCP } from "./mcp-server";

export { SkillportMCP };

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);

    // Health check / discovery endpoint
    if (url.pathname === "/" && request.method === "GET") {
      return new Response(
        JSON.stringify({
          name: "Skillport Connector",
          version: "1.0.0",
          auth: "api-key",
          mcp: { endpoint: "/sse", version: "2025-06-18" },
        }),
        {
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // MCP endpoints - require API key
    if (url.pathname === "/sse" || url.pathname === "/sse/message") {
      // Get API key from query param or header
      const apiKey =
        url.searchParams.get("api_key") ||
        request.headers.get("X-Skillport-API-Key");

      if (!apiKey) {
        return new Response(
          JSON.stringify({ error: "Missing API key" }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        );
      }

      // Validate API key against KV
      const orgId = await env.API_KEYS.get(apiKey);
      if (!orgId) {
        return new Response(
          JSON.stringify({ error: "Invalid API key" }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }

      // Log access for audit
      console.log(`MCP access: org=${orgId}, path=${url.pathname}`);

      // Pass through to MCP server
      return SkillportMCP.mount("/sse").fetch(request, env, ctx);
    }

    // 404 for unknown routes
    return new Response(
      JSON.stringify({ error: "Not found" }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  },
};
