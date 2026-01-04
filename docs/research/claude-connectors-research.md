# Claude.ai Connectors Deep Dive

This document captures our research into how Claude.ai connectors work, which informed the Skillport design.

## Connector Types

Claude.ai has two distinct types of connectors:

### Content Connectors

**Examples:** GitHub, Google Drive, OneDrive

**How they work:**
- Provide a file picker via the "+" button in the chat interface
- Attach file content to the conversation context
- Do NOT provide callable tools

**Key insight:** The GitHub connector in Claude.ai is a **content connector**, not a tools connector. It only lets you attach files — Claude cannot programmatically read or write to GitHub through it.

### Tools Connectors (MCP)

**Examples:** HubSpot, Fireflies, Snowflake, Zapier, n8n

**How they work:**
- Provide callable MCP tools
- Must be enabled per-conversation via "Search and tools" menu
- Claude can invoke tools programmatically
- User authenticates via OAuth when adding connector

**Skillport is a Tools Connector** — it provides MCP tools that Claude can call.

## Verified Behavior

We tested this directly in Claude.ai:

1. **Fireflies connector** was added and enabled
2. Claude could see and call Fireflies tools:
   - `Fireflies:fireflies_search`
   - `Fireflies:fireflies_get_transcripts`
   - `Fireflies:fireflies_fetch`
   - etc.
3. Tools actually worked — retrieved real meeting data

This confirmed that:
- Tools connectors expose real callable tools
- A Skill could reference these tools by name
- Skillport can follow the same pattern

## OAuth Flow for Tools Connectors

When you add a tools connector like Fireflies:

1. **Discovery**: Claude.ai queries `/.well-known/oauth-protected-resource` on the MCP server
2. **DCR**: Claude.ai uses Dynamic Client Registration to register itself as an OAuth client
3. **Auth Redirect**: User is redirected to authenticate (e.g., "Sign in with Google" for Fireflies)
4. **Token Exchange**: MCP server issues token to Claude.ai
5. **Tool Calls**: Claude.ai includes token in subsequent MCP tool calls

**Key point:** When using DCR, users don't need to enter Client ID/Secret. The "Advanced settings" fields in Claude.ai are only needed for servers that don't support DCR.

## Adding Custom Connectors

From Settings > Connectors > "Add custom connector":

**Required:**
- MCP Server URL (e.g., `https://your-server.com/sse`)

**Optional (Advanced):**
- OAuth Client ID — only if server doesn't support DCR
- OAuth Client Secret — only if server doesn't support DCR

## Tool Permissions

After adding a connector, you can configure tool permissions:

- **Ask every time** — Claude asks before using tools
- **Always allow** — Tools are automatically available
- **Read-only tools** vs **All tools** — Separate permissions

For org use, "Always allow" for read-only tools is convenient.

## MCP Protocol Requirements

For a custom connector to work with Claude.ai:

### Transport
- HTTP + SSE (Server-Sent Events) — currently supported
- Streamable HTTP — also supported
- Note: SSE may be deprecated in favor of Streamable HTTP

### Authentication
- Authless — supported (but not recommended for org use)
- OAuth 2.0 — supported
- Dynamic Client Registration (DCR) — supported and preferred

### Protocol Features Supported
- Tools ✅
- Prompts ✅
- Resources ✅
- Text and image tool results ✅
- Resource subscriptions ❌ (not yet)
- Sampling ❌ (not yet)

### Required Endpoints
- `/.well-known/oauth-protected-resource` — OAuth discovery
- `/authorize` — OAuth authorization
- `/token` — OAuth token exchange
- `/register` — Dynamic Client Registration (if using DCR)
- `/sse` or `/mcp` — MCP protocol endpoint

## Claude's OAuth Details

When building a connector, these Claude.ai specifics matter:

**Callback URLs** (allowlist both):
- `https://claude.ai/api/mcp/auth_callback`
- `https://claude.com/api/mcp/auth_callback`

**Client name:** `Claude`

**IP addresses:** See [Anthropic IP addresses](https://docs.anthropic.com/en/api/ip-addresses#ipv4-2) for allowlisting

## Testing Connectors

### MCP Inspector

```bash
npx @modelcontextprotocol/inspector@latest
```

Open `http://localhost:5173`, enter your MCP server URL, and test:
- OAuth flow completion
- Tool discovery
- Tool invocation

### Cloudflare AI Playground

https://playground.ai.cloudflare.com/ — another option for testing remote MCP servers

### Adding to Claude.ai

The ultimate test is adding your connector to Claude.ai and verifying tools appear and work.

## Reference Links

- [Building Custom Connectors](https://support.claude.com/en/articles/11503834-building-custom-connectors-via-remote-mcp-servers)
- [Getting Started with Connectors](https://support.claude.com/en/articles/11175166-getting-started-with-custom-connectors-using-remote-mcp)
- [MCP Authorization Spec](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization)
- [Cloudflare Remote MCP Guide](https://developers.cloudflare.com/agents/guides/remote-mcp-server/)
