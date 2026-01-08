# SSE to Streamable HTTP Migration

## Problem

As of Claude Code version 2.0.10+, **SSE (Server-Sent Events) transport has been deprecated and removed**. The skillport-connector originally used SSE only, which caused connection failures for Claude Code users.

### Symptoms

```
Authentication successful, but server reconnection failed.
You may need to manually restart Claude Code for the changes to take effect.
```

- OAuth flow completes successfully
- Claude Code can't connect after auth (SSE no longer supported)
- Issue affects all Claude Code users on versions > 2.0.9

### Root Cause

Claude Code removed SSE support in favor of **Streamable HTTP**, which was introduced in March 2025 as the new standard for remote MCP connections.

**Important:** Claude Code's SSE deprecation is very recent (v2.0.10+, early January 2026). SSE worked fine in Claude Code until just before this migration. The deprecation was a breaking change that forced this work.

## Solution Implemented (2026-01-07)

### Dual Transport Support

We implemented **both** transports because:
- **Claude Code** requires Streamable HTTP (SSE deprecated)
- **Claude.ai and Claude Desktop** still use SSE for connectors

```typescript
// Create handlers for both transports
const sseHandler = SkillportMCP.mount("/sse");  // SSE for Claude.ai/Desktop
const httpHandler = SkillportMCP.serve("/mcp"); // Streamable HTTP for Claude Code

// Combined handler that routes based on path
const combinedMcpHandler = {
  fetch: (request: Request, env: Env, ctx: ExecutionContext) => {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/sse")) {
      return sseHandler.fetch(request, env, ctx);
    }
    return httpHandler.fetch(request, env, ctx);
  }
};

const oauthProvider = new OAuthProvider({
  apiRoute: ["/mcp", "/sse", "/sse/message"],
  apiHandler: combinedMcpHandler,
  // ...
});
```

### OAuth Provider Patch Required

The `@cloudflare/workers-oauth-provider` had a bug where audience validation failed for requests with paths (GitHub issue #108). We created a postinstall patch:

1. **Added pathname to resourceServer calculation** (lines 792, 805)
2. **Smart audience matching** - prefix match for backward compatibility

See `scripts/patch-oauth-provider.js`

## Client Configuration

### Claude Code (`~/.claude.json`)
```json
"skillport": {
  "type": "http",
  "url": "https://skillport-connector.jack-ivers.workers.dev/mcp"
}
```

### Claude.ai / Claude Desktop
Add connector with URL: `https://skillport-connector.jack-ivers.workers.dev/sse`

Note: Claude.ai/Desktop connector UI has no transport selector - they auto-detect (and currently use SSE).

## Key Discoveries

### 1. Documentation vs Reality Mismatch

Anthropic docs claim all clients support Streamable HTTP:
> "Claude supports both SSE- and Streamable HTTP-based remote servers"

**Reality**: When we deployed Streamable HTTP only (`/mcp`), Claude.ai and Claude Desktop:
- Showed "Connected" in settings
- But tool calls never reached the server
- Server logs showed only `/sse` discovery requests (from Claude Code polling)
- No `POST /mcp` requests from Claude.ai/Desktop

### 2. Transport Auto-Detection

Claude.ai/Desktop connectors:
- Only require Name + URL (no transport selector in UI)
- Have "Advanced settings" for OAuth client ID/secret only
- Apparently auto-detect transport and default to SSE

### 3. OAuth Audience Matching Bug

`@cloudflare/workers-oauth-provider` issue #108:
- Token issued with audience `https://example.com`
- Request to `https://example.com/mcp`
- Validation failed: audience didn't match `${protocol}//${host}${pathname}`
- Fix: Smart matching that allows base URL audience to match path-specific requests

## Research Findings (2026-01-08)

### Transport Support Reality

**Official Documentation Claims:**
> "Claude supports both SSE- and Streamable HTTP-based remote servers, although support for SSE may be deprecated in the coming months."

**Actual Implementation (Remote Connectors):**

| Client | Transport That Works | Notes |
|--------|---------------------|-------|
| Claude Code | Streamable HTTP (`/mcp`) | SSE deprecated in v2.0.10+ |
| Claude Desktop | SSE (`/sse`) | Via Settings > Connectors |
| Claude.ai Web | SSE (`/sse`) | Via Settings > Connectors |

**Key Finding:** Claude Desktop has two MCP integration paths:

1. **Local "Desktop Extensions"** (via `claude_desktop_config.json`) - stdio only, requires local installation
2. **Remote Connectors** (via Settings > Connectors) - SSE transport, easy setup

We use **Remote Connectors only** - the local stdio approach requires users to install bridges and configure JSON files, defeating the purpose of an easy marketplace experience.

**Note:** Bridge tools like mcp-proxy exist for the local stdio path, but these are irrelevant for our connector-based approach.

### Confirmed: Connectors Use SSE

From [GitHub issue #11814](https://github.com/anthropics/claude-code/issues/11814):
> "Claude Desktop (latest as of November 2025) and claude.ai use custom MCP servers with **Transport: SSE (Server-Sent Events)** over HTTPS."

This matches our observations:
- When we deployed Streamable HTTP only (`/mcp`), Claude.ai/Desktop showed "Connected" but tool calls never reached the server
- Server logs confirmed: no `/mcp` requests from these clients
- Same clients worked immediately when SSE endpoint (`/sse`) was added

### Known OAuth Issues with Connectors

Multiple GitHub issues report OAuth failures with Claude Desktop/claude.ai connectors:

1. **[Issue #11814](https://github.com/anthropics/claude-code/issues/11814)** - OAuth infinite loop (`about:blank`)
   - Claude Desktop/Web never initiate OAuth flow
   - Server receives zero requests
   - Same server works with Claude Code CLI and MCP Inspector

2. **[Issue #5](https://github.com/anthropics/claude-ai-mcp/issues/5)** - OAuth broken after December 18, 2025 update
   - Claude Desktop opens internal OAuth URL instead of server endpoints
   - Error: "There was an error connecting to the MCP server"
   - No OAuth-related requests reach the server

3. **[Discussion #16](https://github.com/orgs/modelcontextprotocol/discussions/16)** - HTTP-with-SSE not supported
   - Community frustration: other tools (Cursor, VSCode, LibreChat) support SSE
   - Anthropic's "Remote MCP" is "quite different implementation"
   - November 2024: "This is not supported at the moment"

### Why Our Dual Transport Works

Our solution sidesteps these issues because:

1. **SSE endpoint for Claude.ai/Desktop** - Uses the transport these clients actually implement
2. **Streamable HTTP for Claude Code** - Uses the transport Claude Code requires
3. **OAuth flow works for both** - Our OAuth provider handles both paths

The key insight is that **Claude.ai and Claude Desktop connectors are fundamentally SSE-only**, regardless of what the documentation claims about Streamable HTTP support.

### Community Workarounds (for Remote Connectors)

Others facing this problem use:

1. **Cloudflare Workers with dual endpoints** - Exactly what we implemented
2. **SSE-only deployments** - Accept that Claude Desktop/claude.ai connectors won't use Streamable HTTP
3. **Claude Code-only support** - Some just target Claude Code with Streamable HTTP and skip Claude.ai/Desktop

### Conclusion

The documentation vs reality mismatch is confirmed by:
- Multiple GitHub issues and discussions
- Existence of multiple bridge tools specifically for this problem
- Direct testing showing Claude.ai/Desktop only send SSE requests

**SSE support is NOT being deprecated for Claude.ai/Desktop connectors** - it's the only transport that works. The deprecation warning likely refers to Claude Code's evolution, not the connector system.

## Open Questions (Remaining)

### Will Anthropic fix connector Streamable HTTP support?

- No official response in GitHub issues
- Issue #11814 marked as duplicate but root issue unresolved
- December 2025 update made OAuth worse, not better

### Should we monitor for changes?

- Watch [anthropics/claude-ai-mcp](https://github.com/anthropics/claude-ai-mcp) for connector updates
- Monitor Claude Desktop release notes
- Consider removing SSE endpoint once/if Streamable HTTP works

## Current Status

### Working
- [x] Claude Code via `/mcp` (Streamable HTTP)
- [x] Claude.ai via `/sse` (SSE)
- [x] Claude Desktop via `/sse` (SSE)
- [x] MCP Inspector via `/sse` (SSE with OAuth)
- [x] OAuth provider patched for audience matching
- [x] Postinstall script for automatic patching

### Not Working / Unknown
- [ ] Claude.ai via `/mcp` (Streamable HTTP) - fails silently
- [ ] Claude Desktop via `/mcp` (Streamable HTTP) - fails silently
- [ ] MCP Inspector via `/mcp` (Streamable HTTP) - "proxy session token" error

## References

### Implementation
- [Cloudflare MCP Transport docs](https://developers.cloudflare.com/agents/model-context-protocol/transport/)
- [Cloudflare workers-oauth-provider](https://github.com/cloudflare/workers-oauth-provider)
- [workers-oauth-provider issue #108](https://github.com/cloudflare/workers-oauth-provider/issues/108) - Audience matching bug
- [Building Custom Connectors](https://support.claude.com/en/articles/11503834-building-custom-connectors-via-remote-mcp-servers)

### Transport Issues
- [MCP Discussion #16](https://github.com/orgs/modelcontextprotocol/discussions/16) - Claude Desktop HTTP-with-SSE not supported
- [Claude Code issue #11814](https://github.com/anthropics/claude-code/issues/11814) - OAuth infinite loop with connectors
- [claude-ai-mcp issue #5](https://github.com/anthropics/claude-ai-mcp/issues/5) - OAuth broken after Dec 2025 update
- [Claude Code issue #1387](https://github.com/anthropics/claude-code/issues/1387) - Streamable HTTP support request

### Bridge Tools (for local stdio path, not relevant to our connector approach)
- [mcp-proxy](https://github.com/sparfenyuk/mcp-proxy) - Bridges stdio ↔ SSE/Streamable HTTP
- [claude-desktop-transport-bridge](https://mcp.so/server/claude-desktop-transport-bridge) - SSE/WebSocket to stdio

## Timeline

| Date | Event |
|------|-------|
| 2026-01-07 | Discovered SSE deprecation in Claude Code |
| 2026-01-07 | Attempted Streamable HTTP only - Claude.ai/Desktop broken |
| 2026-01-07 | Discovered OAuth audience matching bug |
| 2026-01-07 | Implemented dual transport (SSE + HTTP) |
| 2026-01-07 | All clients working with appropriate endpoints |
| 2026-01-08 | Research complete: confirmed connectors are SSE-only |
