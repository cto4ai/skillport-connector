# Skillport Connector

MCP connector + CLI for managing Claude Code plugin marketplaces. Works across Claude.ai, Claude Desktop, and Claude Code.

## Project Overview

This is a **Cloudflare Worker** that:
- Provides a thin MCP layer (auth + docs) for Claude.ai/Desktop
- Serves a CLI (bundled JS) for all marketplace operations
- Exposes a REST API that the CLI talks to
- Authenticates users via Google OAuth

## Sibling Repository

| Repo | Purpose |
|------|---------|
| **skillport-connector** (this repo) | MCP + CLI + REST API deployed on Cloudflare Workers |
| **skillport-marketplace** | GitHub template for creating skill marketplaces |

## Architecture

```
Claude Surface (CC, Claude.ai, Desktop)
  │
  ├── MCP Connection (auto OAuth)
  │     • readme: full usage guide
  │     • execute: auth.get_code / auth.whoami
  │     • search: CLI documentation
  │
  └── CLI (bundled JS, downloaded via curl)
        • All marketplace operations (list, get, save, etc.)
        • Passes --code <CODE> from auth.get_code
        • Self-updating via /cli/version check
        │
        └── REST API (Cloudflare Worker)
              • GitHub proxy (authenticated via shared PATs)
              • Code-based auth (codes stored in KV)
              • Plugin/skill CRUD operations
```

## Tech Stack

- **Runtime**: Cloudflare Workers
- **Language**: TypeScript
- **MCP SDK**: @modelcontextprotocol/sdk
- **Auth**: Google OAuth (MCP) + code-based auth (CLI → REST API)
- **Storage**: Cloudflare KV (OAuth tokens, CLI codes, CLI bundle)
- **CLI Build**: esbuild

## Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Worker entry point, OAuth provider, CLI serving |
| `src/mcp-server.ts` | MCP server: readme, execute, search tools |
| `src/rest-api.ts` | REST API endpoints for CLI |
| `src/dispatch.ts` | Namespace-based method routing |
| `src/auth.ts` | auth.get_code, auth.whoami handlers |
| `src/github-client.ts` | GitHub API client (read + write) |
| `src/search-index.ts` | Porter stemmer + search index |
| `src/search-chunks.ts` | CLI documentation content |
| `cli/src/index.ts` | CLI entry point, arg parsing, command routing |
| `cli/src/api-client.ts` | HTTP client with proxy-aware curl fallback |
| `cli/src/commands/*.ts` | One file per CLI command |
| `cli/src/update.ts` | CLI self-update mechanism |
| `cli/build.mjs` | esbuild bundler for CLI |

## MCP Tools

| Tool | Purpose |
|------|---------|
| `readme` | Full usage guide — call this first |
| `execute` | Auth methods: `auth.get_code`, `auth.whoami` |
| `search` | Query CLI documentation (commands, workflows, best practices) |

## CLI Commands

All remote commands require `--code <CODE>` from `auth.get_code`.

| Command | Purpose |
|---------|---------|
| `list [--surface]` | List plugins in marketplace |
| `info <name> [--skill]` | Plugin or skill details |
| `get <name> [--skill] [--skills-only] [--format]` | Download plugin/skill |
| `save <name> <bump> [--skill]` | Push local files + bump version |
| `create <name>` / `create --skill <name>` | Scaffold plugin or skill |
| `updates --installed <json>` | Check for version updates |
| `deactivate <name>` | Remove from marketplace |
| `reactivate <name>` | Restore to marketplace |
| `delete <name> --confirm` | Permanent deletion |
| `sync [--dry-run]` | Regenerate marketplace.json |
| `whoami` | User identity |

## Setup

### 1. Copy configuration template

```bash
cp wrangler.toml.example wrangler.toml
```

### 2. Create KV namespace

```bash
npx wrangler kv namespace create OAUTH_KV
```

Update `wrangler.toml` with the namespace ID from the output.

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
npx wrangler secret put GITHUB_SERVICE_TOKEN    # read-only token
npx wrangler secret put GITHUB_WRITE_TOKEN      # read-write token (for editor tools)
```

## Development

```bash
npm install              # Install dependencies
npm run dev              # Start local dev server (localhost:8788)
npm run build:cli        # Bundle CLI → dist/skillport.js
npm run deploy           # Deploy to Cloudflare Workers
npx vitest run           # Run tests (81 tests)
```

## Deployed Endpoints

| Endpoint | URL |
|----------|-----|
| MCP (Streamable HTTP) | `https://skillport-connector.jack-ivers.workers.dev/mcp` |
| MCP (SSE, legacy) | `https://skillport-connector.jack-ivers.workers.dev/sse` |
| CLI bundle | `https://skillport-connector.jack-ivers.workers.dev/cli/skillport.js` |
| CLI version | `https://skillport-connector.jack-ivers.workers.dev/cli/version` |
| REST API | `https://skillport-connector.jack-ivers.workers.dev/api/` |

## Testing

1. **Claude.ai** — Add connector in Settings → Integrations using the MCP endpoint above
2. **Claude Code** — `claude mcp add --transport http skillport https://skillport-connector.jack-ivers.workers.dev/mcp`
3. **MCP Inspector** — `npx @modelcontextprotocol/inspector` then connect to the MCP endpoint
4. **Wrangler tail for logs** — `npx wrangler tail` to see audit logs

**Note:** MCP Inspector + wrangler dev + Remote OAuth has historically been unreliable. Test MCP tools against the live deployed Worker. Claude Code can smoke-test the MCP once deployed. REST API endpoints can be tested locally via wrangler dev.

## Documentation

- [access-control.md](docs/reference/access-control.md) — User roles and permissions
- [anthropic-skill-formats.md](docs/reference/anthropic-skill-formats.md) — Anthropic's skill format reference
- [v3 design spec](docs/superpowers/specs/2026-04-03-skillport-v3-design.md) — Architecture and design decisions
- [v3 implementation plans](docs/superpowers/plans/) — Plans 1-4 with full TDD steps

## Git Workflow

- **Branching model**: `main` is a subset of `development`. All dev work happens in feature branches based on `development`, and PRs merge back to `development`.
- Use conventional commits
- Create branches from `development` (not `main`)
- PRs target `development` branch
- Direct commits to main are ok for documentation-only changes
