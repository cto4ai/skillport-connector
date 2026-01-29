# Claude.ai OAuth Connector Issue - 2026-01-29

**Date:** 2026-01-29 10:07
**Status:** BLOCKED (Anthropic bug)
**Branch:** development

## Problem

Claude.ai custom MCP connectors fail to connect. OAuth flow initiates but never completes token exchange.

## Symptoms

1. Click "Connect" on custom connector in Claude.ai
2. Google OAuth sign-in appears and completes
3. Spinner shows, then error: "Error connecting to the MCP server"
4. Reference IDs provided: `9d2249c260f6527a`, `40c675b95822452d`, `ddf8f4b34d751fd9`

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

**Key Finding:** Claude.ai completes Google sign-in but **never calls `/token`** to exchange the authorization code for an access token.

### Endpoints Tested

| Endpoint | Response |
|----------|----------|
| `/.well-known/oauth-authorization-server` | ✅ Valid metadata |
| `/.well-known/oauth-protected-resource` | ✅ Valid metadata |
| `/register` | ✅ Client registration works |
| `/authorize` | ✅ Redirects to Google |
| `/callback` | ✅ Receives auth code |
| `/token` | ❓ Never called by Claude.ai |
| `/mcp` | 401 (expected without token) |

### Transport Comparison

| Transport | Endpoint | OAuth Triggered |
|-----------|----------|-----------------|
| SSE | `/sse` | Sometimes triggers OAuth, fails at token exchange |
| Streamable HTTP | `/mcp` | Inconsistent - sometimes triggers, sometimes doesn't |

### Surface Comparison

| Surface | Auth Method | Status |
|---------|-------------|--------|
| Claude Code | API key via `skillport_auth` tool | ✅ Works |
| Claude.ai | OAuth 2.0 | ❌ Broken |
| Claude Desktop | OAuth 2.0 | ❌ Broken (same issue) |

## Root Cause

**Claude.ai's MCP client is not completing the OAuth 2.0 token exchange.**

The flow breaks after step 4:
1. ✅ Discover OAuth server metadata
2. ✅ Register as OAuth client
3. ✅ Redirect to `/authorize` → Google
4. ✅ Receive callback with authorization code
5. ❌ **Call `/token` to exchange code** ← MISSING
6. ❌ Include Bearer token in MCP requests

## Affected Connectors

Tested and confirmed broken:
- `skillport-connector` (this project)
- `obsidian-oauth-mcp` (same OAuth pattern)

## Related Issues

- [anthropics/claude-ai-mcp#5](https://github.com/anthropics/claude-ai-mcp/issues/5) - "Custom Connector OAuth Broken After Claude Desktop Update (December 18, 2025)"
- [anthropics/claude-ai-mcp#28](https://github.com/anthropics/claude-ai-mcp/issues/28) - "MCP tools/call blocked with Insufficient permissions" (Jan 27, 2026)

Issue #5 was assigned to Anthropic engineer on Jan 14, 2026 but no fix deployed yet.

## Workarounds

### For Claude Code Users
Claude Code works fine - uses API key auth via `skillport_auth` MCP tool, not OAuth.

### For Claude.ai Users
No workaround available. Must wait for Anthropic fix.

## Verification Test

To confirm issue persists:
```bash
# Watch server logs
wrangler tail --format=pretty

# In Claude.ai: Settings → Connectors → Connect to custom connector
# Observe: /token is never called after /callback
```

## Next Steps

1. [ ] Report to Anthropic with reference IDs and log evidence
2. [ ] Monitor [anthropics/claude-ai-mcp](https://github.com/anthropics/claude-ai-mcp/issues) for updates
3. [x] Confirmed Claude Code still works (tested `skillport_auth` and `obsidian_auth`)
4. [ ] Test TSIP's Claude.ai to confirm widespread issue

## Notes

- Issue is NOT server-side - servers respond correctly to all OAuth endpoints
- Issue is NOT configuration - same connectors worked "as recently as yesterday"
- Issue appears to be in Anthropic's MCP proxy/client OAuth implementation
