# Setup Overview

This guide walks through configuring the Skillport Connector for local development and production deployment.

## Prerequisites

- Node.js v20+ (required for Wrangler v4)
- A Cloudflare account
- A Google Cloud Console account
- A GitHub account with access to the marketplace repo

## Configuration Items

| Item | Purpose | Where to Get |
|------|---------|--------------|
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | Google Cloud Console |
| `GITHUB_SERVICE_TOKEN` | GitHub PAT for marketplace access | GitHub Settings |
| `COOKIE_ENCRYPTION_KEY` | Session encryption | Generate locally |
| `OAUTH_KV` namespace ID | Token storage | Wrangler CLI |

## Setup Order

1. [Create KV Namespace](02-kv-namespace.md) - Cloudflare storage for OAuth tokens
2. [Google OAuth Setup](03-google-oauth.md) - Configure Google Cloud Console
3. [GitHub Token](04-github-token.md) - Create service token for API access
4. [Local Secrets](05-local-secrets.md) - Create `.dev.vars` file
5. [Testing](06-testing.md) - Verify the setup works

## File Locations

| File | Purpose | Git Status |
|------|---------|------------|
| `.dev.vars` | Local development secrets | **Ignored** (in .gitignore) |
| `.dev.vars.example` | Template for secrets | Committed |
| `wrangler.toml` | Cloudflare Worker config | Committed |

## Production vs Development

### Development (local)
- Secrets stored in `.dev.vars`
- KV namespace simulated locally by Miniflare
- Google OAuth redirect: `http://localhost:8787/callback`

### Production (deployed)
- Secrets set via `wrangler secret put`
- Real KV namespace on Cloudflare
- Google OAuth redirect: `https://your-worker.workers.dev/callback`
