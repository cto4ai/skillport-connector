/**
 * Skillport MCP Server
 * Exposes Plugin Marketplace tools to Claude.ai/Desktop
 */

import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

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
   * Log user action for audit trail
   */
  private logAction(action: string): void {
    const email = this.props?.email || "unknown";
    const timestamp = new Date().toISOString();
    console.log(`[AUDIT] ${timestamp} user=${email} action=${action}`);
  }

  async init() {
    // ============================================================
    // Primary Tool: skillport_auth (for REST API access)
    // ============================================================

    // Tool: skillport_auth - Get authenticated session for REST API
    this.server.tool(
      "skillport_auth",
      "Get an authenticated session for the Skillport marketplace. " +
        "If you have the skillport skill installed, call with operation='auth' then use your skillport skill for API instructions. " +
        "If you don't have the skillport skill, call with operation='bootstrap' to install it. " +
        "Returns a short-lived API token (5 min) and base URL for REST API calls.",
      {
        operation: z
          .enum(["auth", "bootstrap"])
          .default("auth")
          .describe(
            "'auth': Get token for API calls (use your skillport skill for instructions). " +
              "'bootstrap': Install the Skillport skill if you don't have it."
          ),
      },
      async ({ operation }) => {
        if (operation === "bootstrap") {
          return this.handleBootstrap();
        }
        return this.handleAuth();
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
              instructions:
                "Use your skillport skill for API usage instructions. " +
                "If you don't have the skillport skill, call this tool again with operation='bootstrap' to install it.",
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
   * Uses same sk_api_ token as normal auth
   */
  private async handleBootstrap() {
    // Generate standard API token (same as handleAuth)
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
                "2. Use present_files to share the downloaded .skill file with the user",
                "3. User should start a new conversation after installing",
              ],
              command: `curl -sf "${baseUrl}/bootstrap.sh" -H "Authorization: Bearer ${token}" | bash`,
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
