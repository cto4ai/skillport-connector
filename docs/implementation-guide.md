# Implementation Guide

This guide walks through implementing the Skillport Connector.

## Overview

The connector is a Cloudflare Worker that:

1. Handles OAuth authentication (GitHub)
2. Reads from a configured Plugin Marketplace repo
3. Exposes MCP tools for browsing and fetching plugins
4. Serves Skills to Claude.ai/Desktop users

## Starting Point: Cloudflare's MCP Template

Rather than building from scratch, start with Cloudflare's OAuth-enabled MCP template:

```bash
npm create cloudflare@latest -- skillport-connector --template=cloudflare/ai/demos/remote-mcp-github-oauth
```

This gives you:
- OAuth flow with GitHub
- MCP server scaffold
- KV storage for tokens
- Proper transport (SSE/Streamable HTTP)

## Core Components

### 1. OAuth Handler

The template provides `GitHubHandler` which:
- Redirects to GitHub for auth
- Handles callback with auth code
- Exchanges code for access token
- Stores token in KV

### 2. MCP Server

Define tools using the MCP SDK:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const server = new McpServer({
  name: "skillport",
  version: "0.1.0",
});

server.tool(
  "list_plugins",
  "List all plugins in the marketplace",
  { /* schema */ },
  async (params) => { /* implementation */ }
);
```

### 3. GitHub API Client

Fetch marketplace data from GitHub:

```typescript
async function fetchMarketplace(repo: string, token: string) {
  const response = await fetch(
    `https://api.github.com/repos/${repo}/contents/.claude-plugin/marketplace.json`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3.raw",
      },
    }
  );
  return response.json();
}
```

## MCP Tools Implementation

### list_plugins

```typescript
server.tool(
  "list_plugins",
  "List all plugins available in the marketplace",
  {
    category: z.string().optional(),
    surface: z.string().optional(),
  },
  async ({ category, surface }, { env, user }) => {
    const marketplace = await fetchMarketplace(env.MARKETPLACE_REPO, user.token);
    
    let plugins = marketplace.plugins;
    
    // Filter by surface if specified
    if (surface) {
      plugins = plugins.filter(p => 
        !p.surfaces || p.surfaces.includes(surface)
      );
    }
    
    // Filter by category if specified
    if (category) {
      plugins = plugins.filter(p => p.category === category);
    }
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ plugins }),
      }],
    };
  }
);
```

### get_plugin

```typescript
server.tool(
  "get_plugin",
  "Get detailed information about a specific plugin",
  {
    name: z.string(),
  },
  async ({ name }, { env, user }) => {
    const marketplace = await fetchMarketplace(env.MARKETPLACE_REPO, user.token);
    const plugin = marketplace.plugins.find(p => p.name === name);
    
    if (!plugin) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ error: "Plugin not found" }),
        }],
      };
    }
    
    // Optionally fetch additional details from plugin.json
    const details = await fetchPluginManifest(env.MARKETPLACE_REPO, plugin.source, user.token);
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ plugin: { ...plugin, ...details } }),
      }],
    };
  }
);
```

### fetch_skill

```typescript
server.tool(
  "fetch_skill",
  "Fetch skill files for installation on Claude.ai/Desktop",
  {
    name: z.string(),
  },
  async ({ name }, { env, user }) => {
    const marketplace = await fetchMarketplace(env.MARKETPLACE_REPO, user.token);
    const plugin = marketplace.plugins.find(p => p.name === name);
    
    if (!plugin) {
      return { content: [{ type: "text", text: JSON.stringify({ error: "Plugin not found" }) }] };
    }
    
    // Determine skill path
    const skillPath = plugin.skillPath || "skills/SKILL.md";
    const basePath = plugin.source.replace("./", "");
    
    // Fetch SKILL.md
    const skillContent = await fetchFile(
      env.MARKETPLACE_REPO,
      `${basePath}/${skillPath}`,
      user.token
    );
    
    // Fetch any referenced files (scripts, references, assets)
    // This could be expanded to fetch entire skill directory
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          name: plugin.name,
          version: plugin.version,
          files: [{
            path: "SKILL.md",
            content: skillContent,
          }],
          // Include instructions for installation
          installInstructions: "Save these files and upload as .skill via Settings > Capabilities",
        }),
      }],
    };
  }
);
```

### check_updates

```typescript
server.tool(
  "check_updates",
  "Check if installed plugins have updates available",
  {
    installed: z.array(z.object({
      name: z.string(),
      version: z.string(),
    })),
  },
  async ({ installed }, { env, user }) => {
    const marketplace = await fetchMarketplace(env.MARKETPLACE_REPO, user.token);
    
    const updates = installed
      .map(inst => {
        const current = marketplace.plugins.find(p => p.name === inst.name);
        if (current && current.version !== inst.version) {
          return {
            name: inst.name,
            installedVersion: inst.version,
            availableVersion: current.version,
          };
        }
        return null;
      })
      .filter(Boolean);
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ updates }),
      }],
    };
  }
);
```

## Helper Functions

```typescript
async function fetchFile(repo: string, path: string, token: string): Promise<string> {
  const response = await fetch(
    `https://api.github.com/repos/${repo}/contents/${path}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3.raw",
      },
    }
  );
  
  if (!response.ok) {
    throw new Error(`Failed to fetch ${path}: ${response.status}`);
  }
  
  return response.text();
}

async function fetchPluginManifest(repo: string, source: string, token: string) {
  const basePath = source.replace("./", "");
  try {
    const content = await fetchFile(repo, `${basePath}/plugin.json`, token);
    return JSON.parse(content);
  } catch {
    return {};
  }
}
```

## Wiring It Together

```typescript
import { OAuthProvider } from "workers-mcp-oauth";
import GitHubHandler from "./github-handler";

export default new OAuthProvider({
  apiRoute: "/sse",
  apiHandler: SkillportMCP.Router,
  defaultHandler: GitHubHandler,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
});
```

## Configuration

### wrangler.toml

```toml
name = "skillport-connector"
main = "src/index.ts"
compatibility_date = "2024-12-01"

[vars]
MARKETPLACE_REPO = "your-org/your-marketplace"

[[kv_namespaces]]
binding = "OAUTH_KV"
id = "your-kv-id"
```

### Secrets

```bash
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
wrangler secret put COOKIE_ENCRYPTION_KEY
```

## Testing

### Local Development

```bash
npm run dev
# Server runs at http://localhost:8788/sse
```

### MCP Inspector

```bash
npx @modelcontextprotocol/inspector@latest
# Connect to http://localhost:8788/sse
# Complete OAuth flow
# Test tools
```

### Claude.ai Integration

1. Deploy: `npm run deploy`
2. Add connector in Settings > Connectors
3. Authenticate
4. Test in conversation: "What plugins are available in my skillport?"

## Future Enhancements

### Skill Packaging

Instead of returning raw files, the connector could:
1. Fetch all skill files
2. Create a .skill ZIP in-memory
3. Return as base64 or downloadable URL

### Caching

Add caching to reduce GitHub API calls:
- Cache marketplace.json (short TTL)
- Cache plugin files (longer TTL)
- Invalidate on webhook (if configured)

### Multi-Marketplace

Support multiple marketplace repos:
- User specifies marketplace in tool call
- Or connector discovers from user's org membership

### Access Control

Implement role-based access:
- Check user's GitHub org/team membership
- Restrict certain plugins to specific roles
- Audit log of who accessed what
