/**
 * Skillport Connector - MCP Server for Plugin Marketplaces
 *
 * This is a Cloudflare Worker that exposes a Plugin Marketplace
 * to Claude.ai and Claude Desktop via the MCP protocol.
 *
 * Architecture:
 * - Google OAuth for user authentication
 * - GitHub service token for marketplace access
 * - MCP tools for browsing and fetching plugins
 */

import { OAuthProvider } from "@cloudflare/workers-oauth-provider";
import googleHandler from "./google-handler";
import { SkillportMCP } from "./mcp-server";

// Export the MCP server class for Durable Objects
export { SkillportMCP };

// Create the OAuth provider
const oauthProvider = new OAuthProvider({
  apiRoute: ["/sse", "/sse/message", "/mcp"],
  apiHandler: SkillportMCP.mount("/sse"),
  defaultHandler: googleHandler,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
});

/**
 * Wrapper to add missing CORS headers required by Claude.ai
 * The @cloudflare/workers-oauth-provider doesn't include Access-Control-Expose-Headers
 * which is required for Claude to read the WWW-Authenticate header
 */
export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    // Delegate to OAuth provider
    const response = await oauthProvider.fetch(request, env, ctx);

    // Add Access-Control-Expose-Headers if Origin is present (CORS request)
    const origin = request.headers.get("Origin");
    if (origin) {
      const newResponse = new Response(response.body, response);
      // Expose WWW-Authenticate header so Claude can read the auth challenge
      newResponse.headers.set(
        "Access-Control-Expose-Headers",
        "WWW-Authenticate"
      );
      return newResponse;
    }

    return response;
  },
};
