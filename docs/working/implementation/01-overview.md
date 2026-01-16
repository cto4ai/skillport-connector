# Implementation Plan: Skillport Connector

## Summary

Build an MCP connector on Cloudflare Workers that:
- Authenticates users via **Google Workspace OAuth**
- Fetches Plugin Marketplace data from **GitHub via service token**
- Exposes MCP tools to **Claude.ai and Claude Desktop**

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Claude.ai / Desktop                      │
└─────────────────────────────────────────────────────────────────┘
                                │
                                │ MCP Protocol (SSE/Streamable HTTP)
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Skillport Connector                           │
│                   (Cloudflare Worker)                            │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ Google OAuth │  │  MCP Server  │  │   GitHub API Client  │   │
│  │   Handler    │  │   (Tools)    │  │   (Service Token)    │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    Cloudflare KV                          │   │
│  │              (OAuth tokens, cache)                        │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                                │
                                │ GitHub API (service token)
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Plugin Marketplace Repo                       │
│                    (e.g., cto4ai/skillport-marketplace-template)            │
└─────────────────────────────────────────────────────────────────┘
```

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| User Auth | Google Workspace OAuth | Users have corporate accounts, no GitHub seats needed |
| GitHub Access | Service token (PAT) | Single token for all users, stored as secret |
| Hosting | Cloudflare Workers | $5/mo paid plan, KV storage, official MCP templates |
| Base Template | `remote-mcp-github-oauth` | Proven OAuth + MCP infrastructure |

## Implementation Phases

1. **Phase 1: Scaffold** - Set up from Cloudflare template
2. **Phase 2: Google OAuth** - Replace GitHub handler with Google
3. **Phase 3: GitHub Client** - Service token for marketplace access
4. **Phase 4: MCP Tools** - Implement list/get/fetch tools
5. **Phase 5: Testing** - Local dev, MCP Inspector, Claude.ai integration

## Files to Create/Modify

| File | Purpose |
|------|---------|
| `src/index.ts` | MCP server with tools |
| `src/google-handler.ts` | Google OAuth flow (new) |
| `src/github-client.ts` | GitHub API with service token (new) |
| `wrangler.toml` | Cloudflare configuration |
| `.dev.vars` | Local development secrets |

## Environment Variables

### Public (wrangler.toml)
- `MARKETPLACE_REPO` - GitHub repo path (e.g., `cto4ai/skillport-marketplace-template`)
- `GOOGLE_CLIENT_ID` - Google OAuth client ID

### Secrets (wrangler secret put)
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret
- `GITHUB_SERVICE_TOKEN` - PAT for GitHub API access
- `COOKIE_ENCRYPTION_KEY` - Session encryption

## MCP Tools

| Tool | Purpose |
|------|---------|
| `list_plugins` | List plugins with optional filters |
| `get_plugin` | Get plugin details |
| `fetch_skill` | Fetch SKILL.md and related files |
| `check_updates` | Compare installed vs available versions |

## Next Steps

See individual phase documents for detailed implementation:
- [02-scaffold.md](02-scaffold.md)
- [03-google-oauth.md](03-google-oauth.md)
- [04-github-client.md](04-github-client.md)
- [05-mcp-tools.md](05-mcp-tools.md)
- [06-testing.md](06-testing.md)
