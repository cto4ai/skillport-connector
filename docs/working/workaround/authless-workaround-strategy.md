# Authless Workaround Strategy for Claude.ai OAuth Bug

**Date:** 2025-12-25
**Status:** Proposed
**Relates to:** [2025-12-25-1115-claude-ai-oauth-investigation.md](../checkpoints/2025-12-25-1115-claude-ai-oauth-investigation.md)

## Executive Summary

Claude.ai and Claude Desktop have a [known bug](https://github.com/anthropics/claude-code/issues/11814) preventing OAuth authentication with custom MCP connectors. This document outlines a workaround strategy that bypasses OAuth entirely while maintaining access control and user identity tracking.

**The Strategy:**
1. Convert Skillport Connector MCP to **authless mode** with org-level API key
2. Create a **Skillport Skill** that manages user identity via Claude's memory system
3. Pass user email as a **tool parameter** on each MCP call

---

## Part 1: MCP Server Changes (Authless Mode)

### Current Architecture

```
┌─────────────┐     OAuth Flow      ┌──────────────────┐
│  Claude.ai  │ ──────────────────► │ Skillport MCP    │
│             │   (BROKEN)          │ + Google OAuth   │
└─────────────┘                     │ + User Identity  │
                                    └──────────────────┘
```

The current implementation uses `@cloudflare/workers-oauth-provider` to:
- Require Google OAuth authentication
- Restrict access to `@craftycto.com` domain
- Identify users by email for audit/personalization

### Proposed Architecture

```
┌─────────────┐     Direct SSE      ┌──────────────────┐
│  Claude.ai  │ ──────────────────► │ Skillport MCP    │
│  + Skill    │   + API Key Header  │ (Authless)       │
│  + Memory   │   + User Email Param│ + API Key Check  │
└─────────────┘                     └──────────────────┘
```

### Implementation Changes

#### 1. New Entry Point (`src/index-authless.ts`)

```typescript
/**
 * Authless Skillport Connector
 * Bypasses OAuth, uses API key + user email parameter
 */

import { Hono } from "hono";
import { SkillportMCP } from "./mcp-server-authless";

const app = new Hono<{ Bindings: Env }>();

// Health check / discovery
app.get("/", (c) => {
  return c.json({
    name: "Skillport Connector",
    version: "1.0.0",
    auth: "api-key",
    mcp: { endpoint: "/sse", version: "2025-06-18" },
  });
});

// API Key validation middleware
const validateApiKey = async (c: any, next: any) => {
  const apiKey = c.req.header("X-Skillport-API-Key") || 
                 c.req.query("api_key");
  
  if (!apiKey) {
    return c.json({ error: "Missing API key" }, 401);
  }
  
  // Validate against stored org keys
  const orgId = await c.env.API_KEYS.get(apiKey);
  if (!orgId) {
    return c.json({ error: "Invalid API key" }, 403);
  }
  
  c.set("orgId", orgId);
  await next();
};

// MCP SSE endpoint (authless but API key protected)
app.all("/sse", validateApiKey, (c) => {
  return SkillportMCP.mount("/sse").fetch(c.req.raw, c.env, c.executionCtx);
});

app.all("/sse/message", validateApiKey, (c) => {
  return SkillportMCP.mount("/sse").fetch(c.req.raw, c.env, c.executionCtx);
});

export default app;
export { SkillportMCP };
```

#### 2. Updated MCP Server (`src/mcp-server-authless.ts`)

Key changes:
- Remove `UserProps` dependency on OAuth
- Add `user_email` parameter to tools that need identity
- Add `org_api_key` validation at tool level

```typescript
// Tool: list_plugins (updated)
this.server.tool(
  "list_plugins",
  "List all plugins available in the marketplace.",
  {
    user_email: z
      .string()
      .email()
      .optional()
      .describe("User email for audit logging (optional)"),
    category: z
      .string()
      .optional()
      .describe("Filter by category"),
    surface: z
      .string()
      .optional()
      .describe("Filter by surface"),
  },
  async ({ user_email, category, surface }) => {
    // Log access for audit
    if (user_email) {
      console.log(`list_plugins called by ${user_email}`);
    }
    
    // ... existing implementation
  }
);
```

#### 3. API Key Management

Store API keys in Cloudflare KV:

```bash
# Create KV namespace
wrangler kv:namespace create "API_KEYS"

# Add org API key
wrangler kv:key put --binding=API_KEYS "sk_craftycto_xxx" "craftycto.com"
```

#### 4. Wrangler Configuration Update

```toml
# wrangler.toml
[[kv_namespaces]]
binding = "API_KEYS"
id = "xxx"  # From KV creation

[vars]
# Keep existing vars
MARKETPLACE_REPO = "craftycto/skillport-marketplace"
```

### Connection URL

After changes, Claude.ai connector URL becomes:

```
https://skillport-connector.jack-ivers.workers.dev/sse?api_key=sk_craftycto_xxx
```

Or with header (Claude Desktop/Code only):
```bash
claude mcp add skillport https://skillport-connector.jack-ivers.workers.dev/sse \
  --header "X-Skillport-API-Key: sk_craftycto_xxx"
```

---

## Part 2: Skillport Skill Strategy

The Skillport Skill handles user identity acquisition and passes it to the MCP.

### Skill Location

```
~/.claude/skills/skillport/
├── SKILL.md
├── config.json          # Local config (API key, cached email)
└── scripts/
    └── setup.py         # Optional: config management
```

### SKILL.md Content

```markdown
---
name: skillport
description: Browse and install skills from the Skillport marketplace. Use when the user wants to find, explore, or install Claude skills.
allowed-tools: bash, Skillport:*
---

# Skillport Marketplace Skill

You are a skill marketplace assistant. You help users discover, browse, and install skills from the Skillport marketplace.

## User Identity Management

Before calling any Skillport MCP tools, you MUST ensure you have the user's email:

### Step 1: Check Memory
Look for the user's Skillport email in your memories. It will be stored as:
- "User's Skillport email is [email]"

### Step 2: If Not Found, Ask Once
If no email is found in memory, ask the user:

> "To use Skillport, I need your email address. This is used for:
> - Tracking which skills you've installed
> - Syncing across your devices
> - Access control (must be @craftycto.com domain)
>
> What email should I use?"

### Step 3: Validate and Store
1. Validate the email ends with `@craftycto.com`
2. Use the `memory_user_edits` tool to store it:
   - command: "add"
   - control: "User's Skillport email is [their-email]"
3. Confirm: "Great, I've saved your Skillport email. You won't need to enter it again."

### Step 4: Include in All Tool Calls
When calling Skillport MCP tools, ALWAYS include the `user_email` parameter:

```json
{
  "user_email": "jack@craftycto.com",
  "category": "development"
}
```

## Available Commands

### Browse Skills
"Show me available skills" → Call `list_plugins`
"What skills are there for sales?" → Call `list_plugins` with category="sales"

### Get Skill Details  
"Tell me about the pitch-deck skill" → Call `get_plugin` with name

### Install a Skill
"Install the pitch-deck skill" → Call `fetch_skill`, then guide user through installation

### Check for Updates
"Are any of my skills outdated?" → Call `check_updates` with installed list

## Installation Guidance

When a user wants to install a skill:

1. Fetch the skill files using `fetch_skill`
2. Present the SKILL.md content
3. Provide platform-specific instructions:

**For Claude.ai:**
1. Go to Settings > Features > Skills
2. Click "Upload Skill"
3. Upload the skill as a .zip file

**For Claude Desktop:**
1. Create folder: `~/.claude/skills/[skill-name]/`
2. Save SKILL.md in that folder
3. Restart Claude Desktop

## Error Handling

If a tool call fails:
- Check if the user's email domain is authorized
- Verify the API key is configured
- Suggest contacting support if issues persist
```

### Configuration File (`config.json`)

```json
{
  "api_key": "sk_craftycto_xxx",
  "org_domain": "craftycto.com",
  "mcp_url": "https://skillport-connector.jack-ivers.workers.dev/sse"
}
```

This can be pre-populated when distributing the skill to org members.

---

## Part 3: User Experience Flow

### First-Time User

```
User: "What skills are available?"

Claude: [Checks memory - no email found]

Claude: "To use Skillport, I need your email address. This is used for
tracking installed skills and access control. What email should I use?"

User: "jack@craftycto.com"

Claude: [Validates @craftycto.com domain]
Claude: [Calls memory_user_edits to store email]
Claude: "Great, I've saved your Skillport email. You won't need to enter it again."

Claude: [Calls list_plugins with user_email="jack@craftycto.com"]
Claude: "Here are the available skills: ..."
```

### Returning User

```
User: "What skills are available?"

Claude: [Checks memory - finds "User's Skillport email is jack@craftycto.com"]
Claude: [Calls list_plugins with user_email="jack@craftycto.com"]
Claude: "Here are the available skills: ..."
```

---

## Part 4: Security Considerations

### Access Control Layers

1. **API Key** (Org Level)
   - One key per organization
   - Distributed with the Skillport Skill
   - Can be rotated if compromised
   - Stored in skill's config.json

2. **Domain Validation** (User Level)
   - Email must match org domain (e.g., `@craftycto.com`)
   - Validated by Skill before calling MCP
   - Logged on MCP server for audit

3. **Tool-Level Logging**
   - Every MCP call logs user_email
   - Provides audit trail
   - Enables usage analytics

### What We Lose vs OAuth

| Feature | OAuth | Authless |
|---------|-------|----------|
| Cryptographic user verification | ✓ | ✗ |
| Per-user access tokens | ✓ | ✗ |
| Token revocation | ✓ | ✗ |
| User consent flow | ✓ | ✗ |

### What We Gain

| Feature | OAuth | Authless |
|---------|-------|----------|
| Works with Claude.ai | ✗ | ✓ |
| Simple setup | ✗ | ✓ |
| No external auth dependencies | ✗ | ✓ |
| Instant connection | ✗ | ✓ |

### Risk Mitigation

- **Email spoofing**: User could claim any email. Mitigated by:
  - Domain validation in Skill
  - All marketplace data is read-only/public anyway
  - Future: Add email verification tool if needed

- **API key leakage**: If key is exposed:
  - Rotate key in KV
  - Distribute new skill config to org
  - Key only grants read access to public marketplace

---

## Part 5: Implementation Plan

### Phase 1: MCP Server Changes (Day 1)
- [ ] Create `src/index-authless.ts`
- [ ] Create `src/mcp-server-authless.ts`
- [ ] Set up API_KEYS KV namespace
- [ ] Add API key validation middleware
- [ ] Deploy and test with curl

### Phase 2: Skill Development (Day 2)
- [ ] Create SKILL.md with identity management
- [ ] Create config.json template
- [ ] Test memory storage/retrieval
- [ ] Test full flow in Claude.ai

### Phase 3: Documentation & Distribution (Day 3)
- [ ] Update README with authless setup
- [ ] Create skill distribution package (.zip)
- [ ] Document API key management for admins
- [ ] Create onboarding guide for users

### Phase 4: Monitoring (Ongoing)
- [ ] Set up logging for tool calls
- [ ] Monitor for unauthorized access attempts
- [ ] Track usage patterns by user/org

---

## Appendix: Alternative Approaches Considered

### A. Static Client Registration
Claude.ai supports entering client_id/secret in Advanced Settings.
**Rejected:** Requires per-user setup, violates "no credential configuration" requirement.

### B. Claude Code CLI Only
Works perfectly with OAuth.
**Rejected:** Claude.ai is the primary target platform.

### C. Wait for Anthropic Fix
Bug is acknowledged but no timeline.
**Rejected:** Unacceptable delay for launch.

### D. Anthropic Partnership Program
Apply for official connector status.
**Considered:** Long-term option, doesn't solve immediate need.

---

## References

- [Claude.ai OAuth Bug - GitHub #11814](https://github.com/anthropics/claude-code/issues/11814)
- [Claude Custom Connectors Documentation](https://support.claude.com/en/articles/11503834)
- [MCP OAuth 2.1 Specification](https://spec.modelcontextprotocol.io/specification/2025-03-26/basic/authorization/)
- [Claude Skills Documentation](https://docs.anthropic.com/en/docs/build-with-claude/computer-use)
- [Close CRM MCP - Authless Pattern Reference](https://help.close.com/docs/mcp-server)
