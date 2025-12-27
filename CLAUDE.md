# Skillport Connector

MCP connector that bridges Claude Code Plugin Marketplaces to Claude.ai and Claude Desktop.

## Project Overview

This is a **Cloudflare Worker** that:
- Exposes a Plugin Marketplace via MCP protocol
- Authenticates users via Google OAuth (OAuth version) or API key (authless version)
- Provides tools to browse and fetch Skills for Claude.ai/Desktop users

## Sibling Repository

This project is part of a two-repo workspace:

| Repo | Purpose |
|------|---------|
| **skillport-connector** (this repo) | MCP connector deployed on Cloudflare Workers |
| **skillport-template** | GitHub template for creating Plugin Marketplaces |

The template is at `../skillport-template/` in this workspace.

## Architecture

```
Plugin Marketplace Repo → Claude Code (native)
                       → Skillport Connector (MCP) → Claude.ai / Claude Desktop
```

## Tech Stack

- **Runtime**: Cloudflare Workers
- **Language**: TypeScript
- **MCP SDK**: @modelcontextprotocol/sdk
- **Auth**: Google OAuth (OAuth version) or API key (authless version)
- **Storage**: Cloudflare KV (for OAuth tokens and API keys)

## Key Files

| File | Purpose |
|------|---------|
| [src/index.ts](src/index.ts) | OAuth entry point (for Claude Code) |
| [src/index-authless.ts](src/index-authless.ts) | API key entry point (for Claude.ai) |
| [src/mcp-server.ts](src/mcp-server.ts) | MCP server with tool definitions |
| [wrangler.toml](wrangler.toml) | OAuth worker configuration |
| [wrangler-authless.toml](wrangler-authless.toml) | Authless worker configuration |
| [package.json](package.json) | Dependencies and scripts |

## MCP Tools

The connector exposes these MCP tools:

| Tool | Purpose |
|------|---------|
| `list_plugins` | List all plugins (with optional category/surface filters) |
| `get_plugin` | Get details about a specific plugin |
| `fetch_skill` | Fetch SKILL.md and related files for installation |
| `check_updates` | Check if installed plugins have updates |

## Development

```bash
npm install              # Install dependencies
npm run dev              # OAuth version (localhost:8788)
npm run dev:authless     # Authless version (localhost:8788)
npm run deploy           # Deploy OAuth version
npm run deploy:authless  # Deploy authless version
```

**Note:** Wrangler v4 requires Node v20+. The VS Code extension runs Node v19.3.0, so run wrangler directly:
```bash
node node_modules/wrangler/bin/wrangler.js dev
node node_modules/wrangler/bin/wrangler.js dev -c wrangler-authless.toml
node node_modules/wrangler/bin/wrangler.js deploy
node node_modules/wrangler/bin/wrangler.js deploy -c wrangler-authless.toml
```

## Configuration

### wrangler.toml
```toml
[vars]
MARKETPLACE_REPO = "your-org/your-marketplace"
```

### Secrets (via wrangler secret put)

**OAuth version:**
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GITHUB_SERVICE_TOKEN`
- `COOKIE_ENCRYPTION_KEY`

**Authless version:**
- `GITHUB_SERVICE_TOKEN`

## Production URLs

| Version | URL | Use Case |
|---------|-----|----------|
| OAuth (recommended) | https://skillport-connector.jack-ivers.workers.dev/sse | Claude.ai, Claude Desktop, Claude Code |
| Authless (deprecated) | https://skillport-connector-authless.jack-ivers.workers.dev/sse?api_key=... | Fallback only |

**Note:** OAuth is now the recommended authentication method. The authless version with API key in query string was created as a workaround when OAuth had bugs, but OAuth is now working correctly.

## User Email & Audit Logging

**OAuth version:** User email is captured from Google OAuth and stored in `this.props.email` via the McpAgent session. This is the authoritative source for user identity.

**Authless version:** Has a `user_email` parameter on each tool - this was a workaround before OAuth was working. Now deprecated.

**Current approach:** Use `this.props.email` from OAuth session and log to console. View logs via `wrangler tail` or Cloudflare dashboard.

**Implementation:** `logAction()` method uses `this.props.email` (OAuth) with fallback to `user_email` param (authless).

## Implementation Status

Current state: **Production (OAuth + Authless)**

- [x] MCP server structure
- [x] Tool definitions with schemas
- [x] Google OAuth handler (OAuth version)
- [x] API key authentication (authless version)
- [x] GitHub API client for marketplace
- [x] Tool implementations
- [x] KV storage setup
- [x] Audit logging via `logAction()` (OAuth email with authless fallback)
- [ ] Rate limiting
- [ ] Unit tests

## Documentation

See `/docs/` for detailed documentation:
- [project-overview.md](docs/project-overview.md) - High-level project overview
- [architecture-decisions.md](docs/architecture-decisions.md) - ADRs explaining design choices
- [implementation-guide.md](docs/implementation-guide.md) - Step-by-step implementation guide
- [claude-connectors-research.md](docs/claude-connectors-research.md) - Research on Claude.ai connectors
- [skills-system-research.md](docs/skills-system-research.md) - Research on Claude's Skills system

## Git Workflow

- Use conventional commits
- Push to main after user approval
- "save our work" means add, commit, push
