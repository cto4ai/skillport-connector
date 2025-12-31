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
| `save_skill` | Create or update skill files (unified create/edit) |
| `publish_skill` | Make a skill discoverable in the marketplace |
| `bump_version` | Bump version for a skill's group |

## Testing

**Important:** Cannot test MCP tools directly from Claude Code due to OAuth requirements. Use one of these methods:

1. **Claude.ai with connector enabled** - Add the connector in Settings, test tools in conversation
2. **MCP Inspector** - `npx @anthropic-ai/mcp-inspector` with the SSE URL
3. **Wrangler tail for logs** - `node node_modules/wrangler/bin/wrangler.js tail` to see audit logs

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

Documentation is organized in `/docs/`:

### Reference (permanent docs)
- [project-overview.md](docs/reference/project-overview.md) - High-level project overview
- [architecture-decisions.md](docs/reference/architecture-decisions.md) - ADRs explaining design choices
- [implementation-guide.md](docs/reference/implementation-guide.md) - Step-by-step implementation guide
- [access-control.md](docs/reference/access-control.md) - User roles and permissions

### Research
- [claude-connectors-research.md](docs/research/claude-connectors-research.md) - Research on Claude.ai connectors
- [skills-system-research.md](docs/research/skills-system-research.md) - Research on Claude's Skills system

### Working (checkpoints, in-progress)
- `docs/working/checkpoints/` - Session checkpoints
- `docs/working/` - Various working documents and explorations

## Git Workflow

- Use conventional commits
- All code changes (unless specifically requested otherwise by user) happen in a branch using a PR process
- Testing will often take place before a PR is issued for the branch
- Updates direct to main for documentation changes are ok
- "save our work" means add, commit, push
