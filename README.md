# Skillport Connector

An MCP Connector that bridges Claude Code Plugin Marketplaces to Claude.ai and Claude Desktop.

## What is Skillport?

Skillport enables organizations to share Skills across all Claude surfaces:

| Surface | Native Plugin Support | Skillport Support |
|---------|:--------------------:|:-----------------:|
| Claude Code | Plugin Marketplaces | (native) |
| Claude Desktop | - | via this connector |
| Claude.ai | - | via this connector |

**The key insight:** Claude Code already has a Plugin Marketplace system. Skillport extends that same marketplace to work with Claude.ai and Claude Desktop by providing an MCP Connector that reads from the marketplace and serves Skills to those surfaces.

## Architecture

```
                    PLUGIN MARKETPLACE REPO (GitHub)
  ┌──────────────────────────────────────────────────────────────────┐
  │  .claude-plugin/marketplace.json    <- Plugin index              │
  │  .skillport/access.json             <- Access control (optional) │
  │                                                                  │
  │  plugins/                                                        │
  │    └── example-skills/              <- Skill group               │
  │          ├── .claude-plugin/                                     │
  │          │     └── plugin.json      <- Group manifest            │
  │          └── skills/                                             │
  │                ├── my-skill/                                     │
  │                │     └── SKILL.md   <- Skill definition          │
  │                └── another-skill/                                │
  │                      └── SKILL.md                                │
  └──────────────────────────────────────────────────────────────────┘
                    │                              │
                    ▼                              ▼
             ┌──────────────┐            ┌─────────────────────┐
             │ Claude Code  │            │ Skillport Connector │
             │   (native)   │            │   (this project)    │
             │              │            │                     │
             │ /plugin      │            │ MCP Server on       │
             │ marketplace  │            │ Cloudflare Workers  │
             └──────────────┘            └─────────────────────┘
                                                  │
                                         ┌────────┴────────┐
                                         ▼                 ▼
                                   Claude.ai       Claude Desktop
```

## Skill-Centric Model

**Skills are the primary unit** users interact with. Plugins (skill groups) are just containers.

- Users browse and install individual skills via `list_skills` and `fetch_skill`
- Skills are discovered from `plugins/*/skills/*/SKILL.md`
- Each skill belongs to a skill group (plugin) which provides versioning
- Editors create/modify skills; users consume them

## MCP Tools

### User Tools (read-only)
| Tool | Description |
|------|-------------|
| `list_skills` | List all skills across all plugins |
| `fetch_skill` | Fetch skill files (SKILL.md + resources) for installation |
| `check_updates` | Check if installed plugins have updates available |
| `whoami` | Get your user identity (for access.json setup) |

### Editor Tools (require write access)
| Tool | Description |
|------|-------------|
| `save_skill` | Create or update skill files |
| `publish_skill` | Make a skill discoverable in the marketplace |
| `bump_version` | Bump version for a skill's group |

## Access Control

Skillport implements role-based access control via `.skillport/access.json`:

| Role | Capabilities |
|------|--------------|
| **Skill User** | Read skills, fetch for installation |
| **Skill Editor** | Create skills, edit skills, publish, bump versions |

See [docs/reference/access-control.md](docs/reference/access-control.md) for details.

## Authentication

Skillport uses **Google OAuth** to authenticate users. This provides:

- **Identity**: Know who is accessing which Skills
- **Access Control**: Restrict editing to authorized users
- **Audit**: Track usage per user

### OAuth Flow

1. User adds connector in Claude.ai Settings > Connectors
2. Claude.ai discovers OAuth endpoints via `.well-known/oauth-protected-resource`
3. User authenticates with Google
4. Connector receives stable user ID for access control
5. Claude.ai uses token for subsequent MCP tool calls

## Setup

### Prerequisites

- Cloudflare account (free tier works)
- Google Cloud OAuth credentials
- A Skillport-compatible Plugin Marketplace repo
- GitHub Personal Access Token (for marketplace access)

### 1. Create Google OAuth Credentials

In Google Cloud Console:
1. Create OAuth 2.0 Client ID (Web application)
2. Add authorized redirect URI: `https://your-worker.workers.dev/callback`

### 2. Create GitHub Token

Create a Personal Access Token with `repo` scope (for reading marketplace repos).

### 3. Configure Environment

Create `.dev.vars` for local development:

```bash
GOOGLE_CLIENT_ID="your-client-id"
GOOGLE_CLIENT_SECRET="your-client-secret"
GITHUB_SERVICE_TOKEN="ghp_your_token"
COOKIE_ENCRYPTION_KEY="$(openssl rand -hex 32)"
```

### 4. Create KV Namespace

```bash
npx wrangler kv namespace create "OAUTH_KV"
```

Update `wrangler.toml` with the returned namespace ID.

### 5. Deploy

```bash
npm install
npm run deploy
```

### 6. Set Production Secrets

```bash
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put GITHUB_SERVICE_TOKEN
wrangler secret put COOKIE_ENCRYPTION_KEY
```

### 7. Add to Claude.ai

1. Go to Settings > Connectors
2. Click "Add custom connector"
3. Enter: `https://your-worker.workers.dev/sse`
4. Authenticate with Google
5. Configure tool permissions

## Development

### Local Development

```bash
npm install
npm run dev   # Runs at http://localhost:8788
```

**Note:** Wrangler v4 requires Node v20+. If using VS Code extension with older Node, run directly:
```bash
node node_modules/wrangler/bin/wrangler.js dev
```

### Testing

1. **Claude.ai** - Add connector, test tools in conversation
2. **MCP Inspector** - `npx @anthropic-ai/mcp-inspector` with SSE URL
3. **Wrangler tail** - `wrangler tail` for live logs

## Cloudflare Workers Free Tier

This connector runs comfortably on Cloudflare's free tier:

| Resource | Free Tier Limit | Typical Usage |
|----------|-----------------|---------------|
| Requests | 100,000/day | ~1,000/day for small org |
| CPU time | 10ms/request | Well under limit |
| KV storage | 1GB | Minimal (OAuth tokens) |

## Documentation

- [Project Overview](docs/reference/project-overview.md) - High-level overview
- [Architecture Decisions](docs/reference/architecture-decisions.md) - ADRs
- [Access Control](docs/reference/access-control.md) - User roles and permissions
- [Implementation Guide](docs/reference/implementation-guide.md) - Building the connector

## Related Projects

| Project | Purpose |
|---------|---------|
| `skillport-connector` | This project - the MCP bridge |
| `skillport-marketplace-template` | GitHub template for creating marketplaces |

## Reference Links

### Anthropic Docs
- [Building Custom Connectors](https://support.claude.com/en/articles/11503834-building-custom-connectors-via-remote-mcp-servers)
- [MCP Authorization Spec](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization)
- [Claude Code Plugin Marketplaces](https://code.claude.com/docs/en/plugin-marketplaces)

### Cloudflare Docs
- [Build a Remote MCP Server](https://developers.cloudflare.com/agents/guides/remote-mcp-server/)

## License

MIT
