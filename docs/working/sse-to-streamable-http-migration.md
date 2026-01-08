# SSE to Streamable HTTP Migration

## Problem

As of Claude Code version 2.0.10+, **SSE (Server-Sent Events) transport has been deprecated and removed** from the MCP standard. The skillport-connector currently uses SSE, which causes connection failures.

### Symptoms

```
Authentication successful, but server reconnection failed.
You may need to manually restart Claude Code for the changes to take effect.
```

- OAuth flow completes successfully
- `/sse` endpoint returns 401 Unauthorized when Claude Code tries to connect
- Issue affects all Claude Code users on versions > 2.0.9
- Confirmed broken on multiple machines

### Root Cause

Claude Code removed SSE support in favor of **Streamable HTTP**, which was introduced in March 2025 as the new standard for remote MCP connections. SSE is only retained for legacy client compatibility via the `McpAgent` class.

## Current Implementation (Broken)

### Client Config (`~/.claude.json`)
```json
"skillport-connector": {
  "type": "sse",
  "url": "https://skillport-connector.jack-ivers.workers.dev/sse"
}
```

### Server Code (`src/index.ts`)
```typescript
import { OAuthProvider } from "@cloudflare/workers-oauth-provider";

const oauthProvider = new OAuthProvider({
  apiRoute: ["/sse", "/sse/message", "/mcp"],
  apiHandler: SkillportMCP.mount("/sse"),  // <-- SSE transport
  // ...
});
```

## Required Changes

### 1. Update Server to Streamable HTTP

Replace `McpAgent.mount("/sse")` with `createMcpHandler`:

```typescript
import { createMcpHandler } from "@cloudflare/agents";

// Use createMcpHandler for Streamable HTTP transport
const mcpHandler = createMcpHandler(SkillportMCP);

const oauthProvider = new OAuthProvider({
  apiRoute: ["/mcp"],
  apiHandler: mcpHandler,
  // ...
});
```

### 2. Update Client Config

```json
"skillport-connector": {
  "type": "streamable-http",
  "url": "https://skillport-connector.jack-ivers.workers.dev/mcp"
}
```

## Migration Steps

1. **Update dependencies**
   ```bash
   npm update @cloudflare/workers-oauth-provider
   npm update @modelcontextprotocol/sdk
   ```

2. **Refactor `src/index.ts`** to use `createMcpHandler` instead of `McpAgent.mount()`

3. **Update `src/mcp-server.ts`** if needed to conform to new handler API

4. **Deploy updated worker**
   ```bash
   npm run deploy
   ```

5. **Update Claude Code MCP config** to use `streamable-http` type and `/mcp` endpoint

6. **Test connection**
   ```bash
   claude mcp remove skillport-connector
   claude mcp add-sse skillport-connector https://skillport-connector.jack-ivers.workers.dev/mcp
   # Note: may need different add command for streamable-http
   ```

## References

- [Cloudflare MCP Transport docs](https://developers.cloudflare.com/agents/model-context-protocol/transport/)
- [Cloudflare workers-oauth-provider](https://github.com/cloudflare/workers-oauth-provider)
- [Claude Code issue #10250 - OAuth succeeds but reconnection fails](https://github.com/anthropics/claude-code/issues/10250)
- [Claude Code issue #9127 - Jira SSE issues](https://github.com/anthropics/claude-code/issues/9127)
- [Build Remote MCP Servers on Cloudflare](https://developers.cloudflare.com/agents/guides/remote-mcp-server/)

## Temporary Workarounds

1. **Restart Claude Code** after OAuth completes - tokens are stored and may work on restart
2. **Downgrade Claude Code** to version 2.0.9 or earlier (not recommended long-term)

## Status

- [ ] Research `createMcpHandler` API requirements
- [ ] Update `src/index.ts` to use Streamable HTTP
- [ ] Update `src/mcp-server.ts` if needed
- [ ] Test locally with `npm run dev`
- [ ] Deploy to production
- [ ] Update client configuration docs
- [ ] Verify with Claude Code

## Date Discovered

2025-01-07
