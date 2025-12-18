# Skillport Connector

An MCP Connector that bridges Claude Code Plugin Marketplaces to Claude.ai and Claude Desktop.

## What is Skillport?

Skillport is a solution for organizations that want to share Skills and plugins across all Claude surfaces:

| Surface | Native Plugin Support | Skillport Support |
|---------|:--------------------:|:-----------------:|
| Claude Code | ✅ Plugin Marketplaces | ✅ (native) |
| Claude Desktop | ❌ | ✅ (via this connector) |
| Claude.ai | ❌ | ✅ (via this connector) |

**The key insight:** Claude Code already has a Plugin Marketplace system. Skillport extends that same marketplace to work with Claude.ai and Claude Desktop by providing an MCP Connector that reads from the marketplace and serves Skills to those surfaces.

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│           PLUGIN MARKETPLACE REPO (GitHub)                       │
│                                                                  │
│  .claude-plugin/marketplace.json   ← Standard Claude Code format │
│  + Skillport extensions (surfaces, skillPath, etc.)              │
│                                                                  │
│  plugins/                                                        │
│    ├── sales-pitch/                                             │
│    │     ├── plugin.json                                        │
│    │     ├── skills/SKILL.md      ← For Claude.ai/Desktop       │
│    │     ├── commands/            ← For Claude Code             │
│    │     └── agents/              ← For Claude Code             │
│    └── ...                                                       │
└──────────────────────────────────────────────────────────────────┘
           │                                    │
           │                                    │
           ▼                                    ▼
    ┌──────────────┐                  ┌─────────────────────┐
    │ Claude Code  │                  │ Skillport Connector │
    │              │                  │ (this project)      │
    │ NATIVE:      │                  │                     │
    │ /plugin      │                  │ MCP Server on       │
    │ marketplace  │                  │ Cloudflare Workers  │
    │ add org/repo │                  │                     │
    └──────────────┘                  └─────────────────────┘
                                               │
                                               ▼
                                      ┌─────────────────────┐
                                      │ Claude.ai / Desktop │
                                      │                     │
                                      │ Settings >          │
                                      │ Connectors >        │
                                      │ Add Custom          │
                                      └─────────────────────┘
```

## How It Works

### For Claude Code Users (Native)

Claude Code consumes the marketplace directly:

```bash
/plugin marketplace add your-org/your-marketplace
/plugin install sales-pitch@your-marketplace
```

### For Claude.ai / Claude Desktop Users

1. **Admin** deploys this connector to Cloudflare Workers
2. **Admin** configures the connector with the marketplace repo URL
3. **Users** add the connector in Claude.ai: Settings > Connectors > Add Custom Connector
4. **Users** authenticate via OAuth (GitHub)
5. **Users** can now browse and install Skills via MCP tools

## MCP Tools Exposed

| Tool | Description |
|------|-------------|
| `skillport:list_plugins` | List all plugins, with optional filtering by category or surface |
| `skillport:get_plugin` | Get detailed information about a specific plugin |
| `skillport:fetch_skill` | Fetch skill files for installation on Claude.ai/Desktop |
| `skillport:check_updates` | Check if installed plugins have updates available |

## Connector Types in Claude.ai

Understanding the difference (discovered during our research):

| Connector Type | Example | What It Does |
|----------------|---------|--------------|
| **Content Connector** | GitHub, Google Drive | File picker via "+" button, attaches content to context |
| **Tools Connector** | HubSpot, Fireflies, Skillport | Provides callable MCP tools that Claude can invoke |

Skillport is a **Tools Connector** — it gives Claude actual tools to call, not just content to attach.

## Authentication

Skillport uses OAuth to authenticate users. This provides:

- **Identity**: Know who is accessing which Skills
- **Audit**: Track usage per user
- **Access Control**: Restrict Skills to specific users/roles (future)

### OAuth Flow

When a user adds the Skillport connector:

1. Claude.ai discovers OAuth endpoints via `.well-known/oauth-protected-resource`
2. Claude.ai uses Dynamic Client Registration (DCR) to register itself
3. User is redirected to authenticate (GitHub OAuth)
4. Connector receives auth token and knows user identity
5. Claude.ai uses token for subsequent MCP tool calls

### Why GitHub OAuth?

- Natural fit since marketplace repos are on GitHub
- Can verify org membership for access control
- Users likely already have GitHub accounts
- Simpler than setting up a separate identity provider

Alternative providers (Google Workspace, Auth0, etc.) can be substituted.

## Setup

### Prerequisites

- Cloudflare account (free tier works)
- GitHub OAuth App
- A Skillport-compatible Plugin Marketplace repo

### 1. Create GitHub OAuth Apps

You need two OAuth apps — one for development, one for production.

**Development App:**
- Application name: `Skillport Connector (dev)`
- Homepage URL: `http://localhost:8788`
- Callback URL: `http://localhost:8788/callback`

**Production App:**
- Application name: `Skillport Connector`
- Homepage URL: `https://your-worker.your-account.workers.dev`
- Callback URL: `https://your-worker.your-account.workers.dev/callback`

### 2. Configure Environment

Create `.dev.vars` for local development:

```bash
GITHUB_CLIENT_ID="your-dev-client-id"
GITHUB_CLIENT_SECRET="your-dev-client-secret"
MARKETPLACE_REPO="your-org/your-marketplace"
```

Set production secrets:

```bash
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
wrangler secret put COOKIE_ENCRYPTION_KEY  # openssl rand -hex 32
```

### 3. Create KV Namespace

```bash
npx wrangler kv namespace create "OAUTH_KV"
```

Update `wrangler.toml` with the returned namespace ID.

### 4. Deploy

```bash
npm install
npm run deploy
```

### 5. Add to Claude.ai

1. Go to Settings > Connectors
2. Click "Add custom connector"
3. Enter: `https://your-worker.your-account.workers.dev/sse`
4. Authenticate with GitHub
5. Configure tool permissions (set to "Always allow" for convenience)

## Development

### Local Development

```bash
npm install
npm run dev
```

The connector runs at `http://localhost:8788/sse`.

### Testing with MCP Inspector

```bash
npx @modelcontextprotocol/inspector@latest
```

Open `http://localhost:5173`, connect to your local server, and test the tools.

## Cloudflare Workers Free Tier

This connector runs comfortably on Cloudflare's free tier:

| Resource | Free Tier Limit | Typical Usage |
|----------|-----------------|---------------|
| Requests | 100,000/day | ~1,000/day for small org |
| CPU time | 10ms/request | Well under limit |
| KV storage | 1GB | Minimal (OAuth tokens) |
| KV reads | 100,000/day | Well under limit |

## Project Context

### Why Build This?

Claude Code has a plugin marketplace. Claude.ai and Claude Desktop don't. This connector bridges that gap, allowing organizations to:

1. Maintain **one marketplace** that works everywhere
2. Share Skills across all Claude surfaces
3. Use the **official Claude Code format** (not a custom format)
4. Get native Claude Code support **plus** Claude.ai/Desktop support via the connector

### Bitter Lesson Consideration

Anthropic will likely build native skill/plugin distribution for Claude.ai/Desktop eventually. This project:

- Uses their official format (compatible, not competing)
- Solves a real need today
- Provides learning and deep understanding of the systems
- Can migrate gracefully when native support arrives

### Related Projects

| Project | Purpose |
|---------|---------|
| `skillport-connector` | This project — the MCP bridge |
| `skillport-template` | GitHub template for creating marketplaces |
| `craftycto-skillport` | Example marketplace instance |

## Reference Documentation

### Anthropic Docs

- [Building Custom Connectors via Remote MCP Servers](https://support.claude.com/en/articles/11503834-building-custom-connectors-via-remote-mcp-servers)
- [Getting Started with Custom Connectors](https://support.claude.com/en/articles/11175166-getting-started-with-custom-connectors-using-remote-mcp)
- [MCP Authorization Spec](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization)
- [Claude Code Plugin Marketplaces](https://code.claude.com/docs/en/plugin-marketplaces)

### Cloudflare Docs

- [Build a Remote MCP Server](https://developers.cloudflare.com/agents/guides/remote-mcp-server/)
- [MCP Server with GitHub OAuth](https://github.com/cloudflare/ai/tree/main/demos/remote-mcp-github-oauth)

## License

MIT
