# Claude.ai OAuth Connector Issue - 2026-01-29

**Date:** 2026-01-29 10:07 (resolved ~12:00)
**Status:** RESOLVED (transient Anthropic-side issue)
**Branch:** development

## Problem

Claude.ai custom MCP connectors failed to connect for jack-ivers.workers.dev deployments. OAuth flow initiated but never completed token exchange.

## Resolution

Issue self-resolved. All surfaces and connectors now working:

| Surface | Skillport | Obsidian |
|---------|-----------|----------|
| Claude Code (via mcp-remote) | ✅ Works | ✅ Works |
| Claude Desktop | ✅ Works | ✅ Works |
| Claude.ai | ✅ Works | ✅ Works |

Likely cause: Transient Anthropic-side issue that was fixed/resolved without action on our part.

## Timeline

- **10:07** - Issue discovered: Claude.ai failing to connect to Skillport
- **~10:30** - TSIP's connector tested and worked, suggesting deployment-specific issue
- **~11:15** - Investigation into Google OAuth settings, KV state, secrets
- **~12:00** - Retested: Claude Desktop works, Claude.ai works, Obsidian works - issue resolved

## Investigation Summary

### Symptoms (while broken)

1. Click "Connect" on custom connector in Claude.ai
2. Google OAuth sign-in appears and completes
3. Spinner shows, then error: "Error connecting to the MCP server"
4. Reference IDs: `9d2249c260f6527a`, `40c675b95822452d`, `ddf8f4b34d751fd9`

### Server Logs (while broken)

```
✅ GET /.well-known/oauth-authorization-server - Ok
✅ POST /register - Ok
✅ GET /authorize - Ok (redirects to Google)
✅ GET /callback - Ok (receives auth code from Google)
❌ POST /token - NEVER CALLED
❌ POST /mcp - 401 invalid_token (no Bearer token)
```

### Key Observation

During the outage, TSIP's deployment (`jack-48f.workers.dev`) worked while jack-ivers deployment didn't. This initially suggested a deployment-specific issue, but the problem resolved without any changes on our side.

## Learnings

1. **All Claude surfaces use OAuth for remote MCP** - Claude Code via `mcp-remote`, Claude Desktop, and Claude.ai all go through the OAuth flow
2. **Transient issues can appear deployment-specific** - Different deployments may be affected differently during Anthropic-side issues
3. **Test multiple surfaces** - Claude Desktop working was a strong signal the issue was resolving

## No Action Taken

The issue resolved without:
- Re-setting Cloudflare secrets
- Clearing KV namespace
- Creating new Google OAuth credentials
- Any code changes
