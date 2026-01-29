# Claude.ai OAuth Connector Issue - 2026-01-29

**Date:** 2026-01-29 10:07 (updated 11:15)
**Status:** INVESTIGATING (not Anthropic bug - TSIP works)
**Branch:** development

## Problem

Claude.ai custom MCP connectors fail to connect for jack-ivers.workers.dev deployments. OAuth flow initiates but never completes token exchange.

## Symptoms

1. Click "Connect" on custom connector in Claude.ai
2. Google OAuth sign-in appears and completes
3. Spinner shows, then error: "Error connecting to the MCP server"
4. Reference IDs provided: `9d2249c260f6527a`, `40c675b95822452d`, `ddf8f4b34d751fd9`

## Key Discovery

**TSIP's skillport connector WORKS on Claude.ai** (`skillport-connector.jack-48f.workers.dev`).

This proves it's NOT a universal Anthropic/Claude.ai bug. Something is specific to the jack-ivers.workers.dev deployment or Google OAuth client.

## Investigation

### Server Logs Analysis

Watched `wrangler tail` during connection attempts:

```
✅ GET /.well-known/oauth-authorization-server - Ok
✅ POST /register - Ok
✅ GET /authorize - Ok (redirects to Google)
✅ GET /callback - Ok (receives auth code from Google)
❌ POST /token - NEVER CALLED
❌ POST /mcp - 401 invalid_token (no Bearer token)
```

### Deployment Comparison

| Deployment | Cloudflare Account | Google OAuth | Claude.ai Status |
|------------|-------------------|--------------|------------------|
| jack-ivers.workers.dev | Crafty | Client A (Internal) | ❌ Broken |
| jack-48f.workers.dev (TSIP) | TSIP | Client B (Internal) | ✅ Works |

### What's Identical

- OAuth discovery metadata (verified via curl)
- Protected resource metadata
- Server code (same repo)
- Google OAuth "Internal" user type setting

### What's Different

- Cloudflare accounts
- Google OAuth credentials (different Google Cloud projects)
- KV namespaces
- Cloudflare secrets

### Google Cloud Console Findings

- **Audience**: Internal (same as TSIP)
- **Errors**: None recorded
- **Traffic**: Activity Jan 20-21, then none
- **Token grant rate**: Well under 10,000/day limit

## Surface Comparison

| Surface | Auth Method | Status |
|---------|-------------|--------|
| Claude Code | API key via `skillport_auth` tool | ✅ Works |
| Claude.ai (jack-ivers) | OAuth 2.0 | ❌ Broken |
| Claude.ai (TSIP/jack-48f) | OAuth 2.0 | ✅ Works |

## Affected Deployments

Broken (same Google OAuth client):
- `skillport-connector.jack-ivers.workers.dev`
- `obsidian-oauth-mcp.jack-ivers.workers.dev`

Working:
- `skillport-connector.jack-48f.workers.dev` (TSIP)

## Next Steps

1. [ ] Watch `wrangler tail --format=pretty` during connection attempt
2. [ ] Re-set Cloudflare secrets:
   ```bash
   wrangler secret put GOOGLE_CLIENT_SECRET
   wrangler secret put COOKIE_ENCRYPTION_KEY
   ```
3. [ ] Compare Google OAuth client configurations in detail
4. [ ] Consider clearing KV namespace state
5. [ ] Try creating new Google OAuth credentials

## Notes

- Issue is NOT a universal Anthropic bug (TSIP works)
- Issue is specific to jack-ivers deployments OR the associated Google OAuth client
- Same Google OAuth credentials used for both skillport and obsidian (both broken)
- TSIP has separate Google OAuth credentials (works)
