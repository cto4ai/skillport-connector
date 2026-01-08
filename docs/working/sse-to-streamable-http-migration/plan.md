# SSE to Streamable HTTP Migration Plan

## Summary

Migrate the Skillport Connector from deprecated SSE transport to Streamable HTTP transport for MCP connections. This resolves connection failures in Claude Code 2.0.10+ while maintaining compatibility with Claude.ai and Claude Desktop.

## Background

- **Problem**: Claude Code deprecated SSE transport in v2.0.10, causing "Authentication successful, but server reconnection failed" errors
- **Solution**: Switch to Streamable HTTP transport, which is supported by all Claude clients
- **Risk**: Low - all target clients (Claude.ai, Desktop, Code) support Streamable HTTP

## Implementation Steps

### 1. Update Server Code

**File: `src/index.ts`**

```typescript
// Change from:
const oauthProvider = new OAuthProvider({
  apiRoute: ["/sse", "/sse/message", "/mcp"],
  apiHandler: SkillportMCP.mount("/sse"),  // SSE transport
  // ...
});

// To:
const oauthProvider = new OAuthProvider({
  apiRoute: ["/mcp"],
  apiHandler: SkillportMCP.serve("/mcp"),  // Streamable HTTP transport
  // ...
});
```

**Key differences:**
| Method | Transport | Protocol |
|--------|-----------|----------|
| `.mount()` / `.serveSSE()` | SSE | GET for stream, POST to /message |
| `.serve()` | Streamable HTTP | POST with JSON-RPC |

### 2. Update Dependencies (Optional)

Current: `agents@0.0.72`
Latest: `agents@0.3.3`

```bash
npm update agents
```

Note: Test thoroughly if updating - major version jump may have breaking changes.

### 3. Deploy

```bash
npm run deploy
```

### 4. Update Client Configurations

**Claude Code:**
```bash
claude mcp remove skillport
claude mcp add --transport http skillport https://skillport-connector.jack-ivers.workers.dev/mcp
```

**Claude.ai / Desktop:**
Update connector URL from `/sse` to `/mcp` in settings.

### 5. Update Documentation

- Update CLAUDE.md with new endpoint
- Update any client setup instructions

## Testing Checklist

- [ ] Deploy updated worker
- [ ] Test with Claude Code (`claude mcp add --transport http`)
- [ ] Test with Claude.ai (add connector in settings)
- [ ] Test with Claude Desktop (if applicable)
- [ ] Verify OAuth flow completes
- [ ] Verify MCP tools are accessible
- [ ] Test `skillport_auth` tool

## Rollback Plan

If issues arise, revert `src/index.ts` changes:
```typescript
apiRoute: ["/sse", "/sse/message", "/mcp"],
apiHandler: SkillportMCP.mount("/sse"),
```

Deploy and reconfigure clients to use SSE endpoint.

## References

- [Claude Code MCP Docs](https://code.claude.com/docs/en/mcp)
- [Cloudflare MCP Transport](https://developers.cloudflare.com/agents/model-context-protocol/transport/)
- [MCP Streamable HTTP Spec](https://www.claudemcp.com/blog/mcp-streamable-http)
- [GitHub Issue #1387](https://github.com/anthropics/claude-code/issues/1387) - Streamable HTTP support request

## Follow-up Tasks

### Upgrade agents package (separate PR)

After verifying the transport migration works, upgrade `agents@0.0.72` → `agents@0.3.3`.

**Key changes to test:**
| Package | Current | Latest | Risk |
|---------|---------|--------|------|
| `@modelcontextprotocol/sdk` | ^1.10.2 | 1.23.0 | Medium - MCP spec changes |
| `ai` | ^4.3.9 | ^6.0.0 | High - Major version bump |
| `zod` | ^3.24.3 | ^3.25.0 \|\| ^4.0.0 | Low |

**Test checklist for upgrade:**
- [ ] Tool registration still works
- [ ] OAuth flow still works
- [ ] Props passed correctly to handlers
- [ ] All MCP tools functional

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2025-01-07 | Migrate to Streamable HTTP | SSE deprecated in Claude Code 2.0.10+, all clients support HTTP |
| 2025-01-07 | Use `/mcp` endpoint | Convention from Cloudflare docs, clearer than `/sse` |
| 2025-01-07 | Skip agents package update | Test migration first, update separately if needed |
| 2025-01-07 | Keep agents@0.0.72 | .serve() exists, avoid AI SDK 4→6 breaking changes |
