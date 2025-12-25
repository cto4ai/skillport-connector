# Skillport Connector

MCP connector that bridges Claude Code Plugin Marketplaces to Claude.ai and Claude Desktop.

## Project Overview

This is a **Cloudflare Worker** that:
- Exposes a Plugin Marketplace via MCP protocol
- Authenticates users via GitHub OAuth
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
- **Auth**: GitHub OAuth with Dynamic Client Registration (DCR)
- **Storage**: Cloudflare KV (for OAuth tokens)

## Key Files

| File | Purpose |
|------|---------|
| [src/index.ts](src/index.ts) | Main MCP server with tool definitions |
| [wrangler.toml](wrangler.toml) | Cloudflare Worker configuration |
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
npm install          # Install dependencies
npm run dev          # Local development server (localhost:8788)
npm run deploy       # Deploy to Cloudflare
```

**Note:** Wrangler v4 requires Node v20+. The VS Code extension runs Node v19.3.0, so run wrangler directly:
```bash
node node_modules/wrangler/bin/wrangler.js dev
node node_modules/wrangler/bin/wrangler.js deploy
node node_modules/wrangler/bin/wrangler.js secret put <SECRET_NAME>
```

## Configuration

### wrangler.toml
```toml
[vars]
MARKETPLACE_REPO = "your-org/your-marketplace"
```

### Secrets (via wrangler secret put)
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `COOKIE_ENCRYPTION_KEY`

## Implementation Status

Current state: **Scaffold with TODOs**

- [x] MCP server structure
- [x] Tool definitions with schemas
- [ ] GitHub OAuth handler
- [ ] GitHub API client for fetching marketplace
- [ ] Tool implementations
- [ ] KV storage setup

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
