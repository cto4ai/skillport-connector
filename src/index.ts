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

// Main export: OAuth provider wrapping the MCP server
export default new OAuthProvider({
  apiRoute: ["/sse", "/sse/message", "/mcp"],
  apiHandler: SkillportMCP.mount("/sse"),
  defaultHandler: googleHandler,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
});
