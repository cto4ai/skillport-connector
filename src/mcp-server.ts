/**
 * Skillport MCP Server
 * Exposes Plugin Marketplace tools to Claude.ai/Desktop
 */

import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { GitHubClient } from "./github-client";

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
        "Returns a short-lived API token (15 min) and base URL for REST API calls.",
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

    // Store token in KV with 15 minute TTL
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
      { expirationTtl: 900 }
    );

    const baseUrl =
      this.env.CONNECTOR_URL ||
      "https://your-connector.workers.dev";

    this.logAction("skillport_auth");

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              token,
              base_url: baseUrl,
              expires_in: 900,
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
   * Handle bootstrap operation - install skillport skill from marketplace
   * Uses the standard install flow for the "skillport" skill
   */
  private async handleBootstrap() {
    const connectorUrl =
      this.env.CONNECTOR_URL ||
      "https://your-connector.workers.dev";

    // Check if skillport skill exists in the marketplace
    const github = new GitHubClient(
      this.env.GITHUB_SERVICE_TOKEN,
      this.env.MARKETPLACE_REPO,
      this.env.OAUTH_KV
    );

    const skill = await github.getSkill("skillport");
    if (!skill) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                error: "Skillport skill not found in marketplace",
                message:
                  "The 'skillport' skill needs to be added to the marketplace before bootstrap can work.",
                instructions: [
                  "Add the skillport skill to your marketplace repo",
                  "Then call bootstrap again",
                ],
              },
              null,
              2
            ),
          },
        ],
      };
    }

    // Generate install token (same as handleInstallSkill in rest-api.ts)
    const tokenBytes = new Uint8Array(24);
    crypto.getRandomValues(tokenBytes);
    const installToken =
      "sk_install_" +
      btoa(String.fromCharCode(...tokenBytes))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");

    await this.env.OAUTH_KV.put(
      `install_token:${installToken}`,
      JSON.stringify({
        skill: "skillport",
        version: skill.version,
        user: this.props.email,
        created: Date.now(),
        used: false,
      }),
      { expirationTtl: 900 }
    );

    this.logAction("skillport_bootstrap");

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              message: "Skillport skill found. Follow these steps:",
              steps: [
                "1. Run the install command below to download the Skillport skill",
                "2. Use present_files to share the downloaded .skill file with the user",
                "3. User should click 'Copy to your skills' then start a new conversation",
              ],
              command: `curl -sf ${connectorUrl}/install.sh | bash -s -- ${installToken} --package`,
              version: skill.version,
            },
            null,
            2
          ),
        },
      ],
    };
  }
}
