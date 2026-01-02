# Skillport Connector

MCP connector that bridges Claude Code Skill Marketplaces to Claude.ai and Claude Desktop.

> **Note:** If `CLAUDE-MORE-DETAILS.md` exists in this repo, review it for additional development context.

## Project Overview

This is a **Cloudflare Worker** that:
- Exposes a Skill Marketplace via MCP protocol
- Authenticates users via Google OAuth
- Provides tools to browse and fetch Skills for Claude.ai/Desktop users

## Sibling Repository

This project is part of a two-repo system:

| Repo | Purpose |
|------|---------|
| **skillport-connector** (this repo) | MCP connector deployed on Cloudflare Workers |
| **skillport-marketplace** | GitHub template for creating skill marketplaces |

## Architecture

```
Skill Marketplace Repo → Claude Code (native plugin support)
                       → Skillport Connector (MCP) → Claude.ai / Claude Desktop
```

## Tech Stack

- **Runtime**: Cloudflare Workers
- **Language**: TypeScript
- **MCP SDK**: @modelcontextprotocol/sdk
- **Auth**: Google OAuth
- **Storage**: Cloudflare KV (for OAuth tokens)

## Key Files

| File | Purpose |
|------|---------|
| [src/index.ts](src/index.ts) | Entry point with OAuth handler |
| [src/mcp-server.ts](src/mcp-server.ts) | MCP server with tool definitions |
| [wrangler.toml.example](wrangler.toml.example) | Worker configuration template |
| [package.json](package.json) | Dependencies and scripts |

## MCP Tools

The connector exposes these MCP tools:

### User Tools
| Tool | Purpose |
|------|---------|
| `list_skills` | List all skills across all plugins |
| `fetch_skill` | Fetch SKILL.md and related files for installation |
| `check_updates` | Check if installed skills have updates |
| `whoami` | Get your user identity (for access.json setup) |

### Editor Tools (require write access)
| Tool | Purpose |
|------|---------|
| `save_skill` | Create or update skill files |
| `publish_skill` | Make a skill discoverable in the marketplace |
| `bump_version` | Bump version for a skill's group |

## Setup

### 1. Copy configuration template

```bash
cp wrangler.toml.example wrangler.toml
```

### 2. Create KV namespaces

```bash
npx wrangler kv namespace create OAUTH_KV
npx wrangler kv namespace create API_KEYS
```

Update `wrangler.toml` with the namespace IDs from the output.

### 3. Configure your marketplace

Edit `wrangler.toml`:
```toml
[vars]
MARKETPLACE_REPO = "your-org/your-marketplace"
```

### 4. Set secrets

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put GITHUB_SERVICE_TOKEN
npx wrangler secret put COOKIE_ENCRYPTION_KEY
```

## Development

```bash
npm install              # Install dependencies
npm run dev              # Start local dev server (localhost:8788)
npm run deploy           # Deploy to Cloudflare Workers
```

**Note:** Wrangler v4 requires Node v20+. If using an older Node version:
```bash
node node_modules/wrangler/bin/wrangler.js dev
node node_modules/wrangler/bin/wrangler.js deploy
```

## Testing

1. **Claude.ai with connector enabled** - Add the connector in Settings, test tools in conversation
2. **MCP Inspector** - `npx @anthropic-ai/mcp-inspector` with your SSE URL
3. **Wrangler tail for logs** - `npx wrangler tail` to see audit logs

## Documentation

See `/docs/reference/` for detailed documentation:
- [project-overview.md](docs/reference/project-overview.md) - High-level project overview
- [architecture-decisions.md](docs/reference/architecture-decisions.md) - Design decisions
- [implementation-guide.md](docs/reference/implementation-guide.md) - Implementation guide
- [access-control.md](docs/reference/access-control.md) - User roles and permissions

## Git Workflow

- Use conventional commits
- Use branch/PR process for code changes
- Direct commits to main are ok for documentation-only changes
