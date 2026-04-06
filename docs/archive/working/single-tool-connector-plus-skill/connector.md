# MCP Connector Implementation

## Overview

The MCP Connector is reduced to a **single tool** that handles authentication only. All business logic moves to REST API endpoints.

## The Single Tool

```typescript
import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

interface UserProps extends Record<string, unknown> {
  uid: string;
  provider: string;
  email: string;
  name: string;
  picture?: string;
  domain?: string;
}

export class SkillportMCP extends McpAgent<Env, unknown, UserProps> {
  server = new McpServer({
    name: "skillport",
    version: "2.0.0",
  });

  async init() {
    this.server.tool(
      "skillport_auth",
      "Get an authenticated session for Skillport operations. " +
        "IMPORTANT: After calling this tool, read and follow the instructions in " +
        "the Skillport skill at /mnt/skills/user/skillport/SKILL.md to perform operations. " +
        "This tool only provides authentication — the Skill explains how to use the API.",
      {
        operation: z
          .enum(["auth", "bootstrap"])
          .default("auth")
          .describe(
            "Operation type: 'auth' for normal use (requires Skillport skill installed), " +
            "'bootstrap' for first-time setup instructions"
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

    this.logAction("auth");

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
                "Read /mnt/skills/user/skillport/SKILL.md for how to use this token. " +
                "If the skill is not installed, call skillport_auth with operation='bootstrap'.",
            },
            null,
            2
          ),
        },
      ],
    };
  }

  private async handleBootstrap() {
    // Generate cryptographically random token
    const tokenBytes = new Uint8Array(24);
    crypto.getRandomValues(tokenBytes);
    const token =
      "sk_bootstrap_" +
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
      `bootstrap_token:${token}`,
      JSON.stringify(tokenData),
      { expirationTtl: 300 }
    );

    const baseUrl =
      this.env.CONNECTOR_URL ||
      "https://skillport-connector.jack-ivers.workers.dev";

    this.logAction("bootstrap");

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              message: "Skillport skill not installed. Follow these steps:",
              steps: [
                "1. Run the bootstrap command below to download the Skillport skill",
                "2. Use present_files to share the downloaded .zip with the user",
                "3. Instruct the user to upload the .zip in Claude Settings > Skills",
                "4. User should start a new conversation after installing",
              ],
              command: `curl -sf "${baseUrl}/bootstrap.sh?token=${token}" | bash`,
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

  private logAction(action: string): void {
    const email = this.props?.email || "unknown";
    const timestamp = new Date().toISOString();
    console.log(`[AUDIT] ${timestamp} user=${email} action=${action}`);
  }
}
```

## Token Validation Middleware

For the REST API endpoints, validate tokens with this middleware:

```typescript
interface TokenData {
  uid: string;
  provider: string;
  email: string;
  name: string;
  created: number;
}

async function validateToken(
  request: Request,
  env: Env
): Promise<TokenData | null> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice(7);
  if (!token.startsWith("sk_api_")) {
    return null;
  }

  const data = await env.OAUTH_KV.get(`api_token:${token}`);
  if (!data) {
    return null;
  }

  return JSON.parse(data) as TokenData;
}
```

## What Changes From Current Implementation

| Current | New |
|---------|-----|
| 10 MCP tools with full logic | 1 MCP tool (auth only) |
| Logic in MCP tool handlers | Logic in REST API handlers |
| Claude calls MCP tools directly | Claude calls REST API via curl/Python |
| ~3,000-5,000 tokens overhead | ~300-500 tokens overhead |

## What Stays The Same

- OAuth flow handled by Claude.ai
- User identity from `this.props`
- Token storage in KV
- GitHub client logic
- Access control logic
- All business logic (just moves to REST handlers)

## Context Overhead Comparison

### Before (10 tools)

```
list_skills - List all skills available across all plugins...
  (no parameters)

install_skill - Install a skill efficiently. Returns a short-lived token...
  name: string - Skill name to install

fetch_skill_details - Get details about a skill. Returns the SKILL.md content...
  name: string - Skill name

fetch_skill_for_editing - Fetch all files for an existing skill to edit locally...
  name: string - Skill name

save_skill - Create or update files for a skill...
  skill: string - Skill name
  skill_group: string (optional) - Skill group
  files: array - Files to save
  commitMessage: string (optional) - Commit message

delete_skill - Delete a skill entirely from the marketplace...
  skill: string - Skill name
  confirm: boolean - Confirmation

bump_version - Bump the version of a skill...
  skill: string - Skill name
  type: "major" | "minor" | "patch"

publish_skill - Make a skill discoverable...
  skill: string - Skill name
  description: string
  category: string (optional)
  tags: array (optional)
  keywords: array (optional)

check_updates - Check if any installed plugins have updates...
  installed: array

whoami - Get your user identity information...
  (no parameters)
```

**Estimated: ~3,000-5,000 tokens**

### After (1 tool)

```
skillport_auth - Get an authenticated session for Skillport operations.
  IMPORTANT: After calling this tool, read and follow the instructions in
  the Skillport skill at /mnt/skills/user/skillport/SKILL.md to perform operations.
  This tool only provides authentication — the Skill explains how to use the API.
  
  operation: "auth" | "bootstrap" (default: "auth")
```

**Estimated: ~300-500 tokens**
