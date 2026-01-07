# Claude Code Web Compatibility Research

**Date:** January 2026

## Overview

Investigation into whether Skillport skills can be used from Claude Code Web (CC Web).

## Key Findings

### Skills Not Supported in CC Web

Claude Code Web does not support skills/plugins. Skills are a Claude Code CLI feature only.

- Skills require local file system access (`~/.claude/skills/`)
- CC Web runs in a sandboxed cloud environment
- The `Skill` tool and skill invocation syntax aren't available in CC Web

### Network Access Works

CC Web's "Trusted" network mode allows outbound HTTPS requests:

| Endpoint | Status | Response |
|----------|--------|----------|
| `/` (root) | 200 OK | Service metadata |
| `/api/skills` | 401 | Proper auth error |
| `/authorize` | 503 | TLS error (see below) |
| `/sse` | 503 | TLS error (see below) |

### OAuth Flow Blocked

CC Web routes traffic through an egress proxy (`21.0.0.97`) that performs TLS inspection. This breaks:

1. **Google OAuth redirects** - Certificate verification fails when the proxy intercepts redirects to Google's auth servers
2. **SSE streaming** - The MCP SSE transport also fails with TLS errors

Error seen:
```
CERTIFICATE_VERIFY_FAILED: TLS_error:|268435581:SSL routines:OPENSSL_internal:CERTIFICATE_VERIFY_FAILED
```

### Token Passthrough Works

If a token is obtained via `skillport_auth` in Claude Code CLI, it can be passed to CC Web for use. **All API endpoints work:**

| Endpoint | Method | Result |
|----------|--------|--------|
| `/api/skills` | GET | Lists all skills |
| `/api/skills/{name}` | GET | Full skill details + SKILL.md content |
| `/api/skills/{name}/install` | GET | Install token + curl command |
| `/api/check-updates` | POST | Detects available updates |

```bash
# In CC Web, with token from CLI:
curl -sf "https://skillport-connector.jack-ivers.workers.dev/api/skills" \
  -H "Authorization: Bearer ${TOKEN}"
```

Tokens expire after 15 minutes.

### Skills Work as Instructions

Skills are markdown files with instructions - they don't require CLI-specific features. Once CC Web reads the skill content (via `/api/skills/{name}`), it can follow those instructions to use the REST API.

The `/skillport` invocation syntax won't work, but Claude can:
1. Fetch skill content via API
2. Read the instructions in `skill_md`
3. Execute those instructions (curl commands)

## Workarounds for CC Web Support

If CC Web support is desired in the future:

### Option 1: API Keys
Use the existing `API_KEYS` KV namespace to issue long-lived API keys that bypass OAuth.

### Option 2: Environment Variable Tokens
Pre-provision tokens via CC Web's custom environment variables feature.

### Option 3: Token Relay
User authenticates in CLI, copies token to CC Web session. Limited by 15-minute expiry.

## Teleport Feature

CC Web has a "Teleport" feature to transfer sessions to CLI:
- Useful when a task requires skill support
- Transfers full conversation context
- Allows continuing work locally with full skill access

## Conclusion

**CC Web can fully use Skillport** when provided with an API token. All REST API endpoints work correctly.

The only barrier is token acquisition:
- OAuth flow fails through CC Web's TLS-inspecting proxy
- `skillport_auth` MCP tool isn't available in CC Web

**Tested and confirmed working (January 2026):**
- Browse skill marketplace
- Read skill documentation (SKILL.md content)
- Get install packages
- Check for updates

**Path forward:** API key auth (already supported via `sk_api_*` tokens) enables CC Web users to access Skillport. Users can obtain a token from CLI and use it in CC Web, or a future CC Web-specific auth flow could be implemented.
