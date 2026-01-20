# MCP Tool Search and Server Instructions

**Date:** 2026-01-19
**Status:** Research complete, implemented

## Overview

Claude Code introduced MCP Tool Search (announced January 14, 2026) to address context pollution from MCP servers with many tools. The feature dynamically loads tools on-demand rather than preloading all tool descriptions into context.

## Key Findings

### How Tool Search Works

- Enabled by default in Claude Code
- Activates when MCP tool descriptions would consume >10% of context
- Tools are loaded via search rather than preloaded
- Reduces context usage significantly (benchmarks show 51K → 8.5K tokens in some setups)

### Server Instructions Field

The MCP specification includes an `instructions` field in `InitializeResult` that becomes critical with Tool Search:

> "The server instructions field becomes more useful with tool search enabled. It helps Claude know when to search for your tools, similar to skills."

**Purpose:** Server instructions tell Claude what capabilities your server provides and when to look for them - acting as metadata for tool discovery.

### SDK Support

The `@modelcontextprotocol/sdk` (v1.25.2) fully supports server instructions:

```typescript
// ServerOptions interface (server/index.d.ts:13-15)
{
  /**
   * Optional instructions describing how to use the server and its features.
   */
  instructions?: string;
}
```

The `McpServer` constructor accepts this as an optional second parameter:

```typescript
new McpServer(
  { name: "server-name", version: "1.0.0" },
  { instructions: "Your instructions here..." }
);
```

### InitializeResult Schema

The instructions flow through to the `InitializeResult` sent to clients during the MCP handshake:

```typescript
// types.d.ts:879
instructions: z.ZodOptional<z.ZodString>;
```

## Relevance to Skillport Connector

### Current State

The skillport-connector MCP server does not currently set server instructions:

```typescript
server = new McpServer({
  name: "skillport",
  version: "1.0.0",
});
```

### Impact Assessment

Since skillport-connector only exposes one tool (`skillport_auth`), the context savings from Tool Search are minimal. However, adding clear instructions still provides value:

1. Helps Claude understand when to invoke `skillport_auth`
2. Clarifies the auth → skill workflow
3. Distinguishes between `auth` and `bootstrap` operations
4. Future-proofs for additional tools

### Recommended Instructions

```
This server provides tools for browsing and installing Claude Code skills from the Skillport marketplace. Use skillport_auth to get an authenticated session token for the REST API, then use your skillport skill to understand how to browse, install, manage, and author skills. Call with operation='bootstrap' if you don't have the skillport skill installed yet.
```

## Environment Configuration

Tool Search behavior can be controlled via `ENABLE_TOOL_SEARCH`:

| Value | Behavior |
|-------|----------|
| `auto` | Activates at 10% context threshold (default) |
| `auto:<N>` | Custom threshold (e.g., `auto:5` for 5%) |
| `true` | Always enabled |
| `false` | Disabled, all tools preloaded |

## Model Requirements

Tool Search requires models that support `tool_reference` blocks:
- Sonnet 4 and later
- Opus 4 and later
- **Haiku does not support Tool Search**

## Sources

- [Claude Code MCP Docs](https://code.claude.com/docs/en/mcp)
- [MCP Tool Search Announcement (X/Twitter)](https://x.com/trq212/status/2011523109871108570)
- [MCP Server Instructions Explained](https://www.blog.blockscout.com/mcp-explained-part-8-server-instructions/)
- [VentureBeat: Claude Code Tool Search](https://venturebeat.com/orchestration/claude-code-just-got-updated-with-one-of-the-most-requested-user-features/)
- [Context Savings Analysis (Medium)](https://medium.com/@joe.njenga/claude-code-just-cut-mcp-context-bloat-by-46-9-51k-tokens-down-to-8-5k-with-new-tool-search-ddf9e905f734)

## Implementation

Added server instructions to `src/mcp-server.ts`:

```typescript
server = new McpServer(
  {
    name: "skillport",
    version: "1.0.0",
  },
  {
    instructions:
      "This server provides tools for browsing and installing Claude Code skills from the Skillport marketplace. " +
      "Use skillport_auth to get an authenticated session token for the REST API, then use your skillport skill " +
      "to understand how to browse, install, manage, and author skills. " +
      "Call with operation='bootstrap' if you don't have the skillport skill installed yet.",
  }
);
```
