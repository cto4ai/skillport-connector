# Code Review: Authless Implementation

**Date:** 2025-12-25
**Reviewer:** Claude (with Jack Ivers)
**Scope:** Authless MCP connector implementation for Claude.ai OAuth bug workaround

## Summary

The authless implementation is functional and deployed. The connector is working in Claude.ai with API key authentication. However, several issues need attention before the Skillport Skill can be completed.

**Overall Assessment:** ✅ Functional, needs refinement

---

## Files Reviewed

| File | Purpose |
|------|---------|
| `src/index-authless.ts` | Authless entry point with API key validation |
| `src/mcp-server.ts` | MCP server with tool definitions |
| `src/github-client.ts` | GitHub API client for marketplace access |
| `wrangler-authless.toml` | Cloudflare Worker config for authless deployment |
| `worker-configuration.d.ts` | TypeScript environment interface |

---

## 🔴 Critical Issues

### 1. API Key Exposure in URL

**File:** `src/index-authless.ts` (lines 37-38)

```typescript
const apiKey =
  url.searchParams.get("api_key") ||
  request.headers.get("X-Skillport-API-Key");
```

**Problem:** API keys in query parameters are:
- Logged in server access logs
- Visible in browser history
- Cached by proxies
- Exposed in Referer headers

**Current Usage:** The connector URL in Claude.ai is:
```
https://skillport-connector-authless.jack-ivers.workers.dev/sse?api_key=sk_craftycto_xxx
```

**Why It's Unavoidable:** Claude.ai custom connectors don't support custom headers. The query parameter is the only option for passing the API key.

**Mitigations in Place:**
- Marketplace data is public (read-only)
- Key is really just for audit/rate-limiting
- Keys are stored in KV and can be rotated

**Recommendations:**
1. Document the security trade-off
2. Implement key rotation procedure
3. Monitor access logs for abuse
4. Consider short-lived keys if needed

---

### 2. Missing `user_email` Parameter in MCP Tools

**File:** `src/mcp-server.ts`

**Problem:** The workaround strategy requires passing user email to MCP tools for audit logging, but the current implementation doesn't accept this parameter.

**Current Implementation:**
```typescript
this.server.tool(
  "list_plugins",
  "List all plugins available in the marketplace...",
  {
    category: z.string().optional().describe("Filter by category"),
    surface: z.string().optional().describe("Filter by surface"),
  },
  async ({ category, surface }) => {
    // No user tracking capability
  }
);
```

**Required Implementation:**
```typescript
this.server.tool(
  "list_plugins",
  "List all plugins available in the marketplace...",
  {
    user_email: z
      .string()
      .email()
      .optional()
      .describe("User email for audit logging (provided by Skillport Skill)"),
    category: z.string().optional().describe("Filter by category"),
    surface: z.string().optional().describe("Filter by surface"),
  },
  async ({ user_email, category, surface }) => {
    // Log for audit
    if (user_email) {
      console.log(`list_plugins called by ${user_email} at ${new Date().toISOString()}`);
    }
    // ... existing implementation
  }
);
```

**Impact:** This blocks the Skillport Skill development. The Skill is designed to:
1. Get user email from Claude's memory
2. Pass it to MCP tools on every call
3. Enable per-user audit logging

Without the `user_email` parameter, step 2 fails.

**Action Required:** Add `user_email` parameter to all four tools:
- `list_plugins`
- `get_plugin`
- `fetch_skill`
- `check_updates`

---

## 🟡 Moderate Issues

### 3. Shared MCP Server Class Between OAuth and Authless

**Files:** `src/index.ts`, `src/index-authless.ts`, `src/mcp-server.ts`

**Problem:** Both entry points import the same `SkillportMCP` class:

```typescript
// src/index.ts (OAuth version)
import { SkillportMCP } from "./mcp-server";

// src/index-authless.ts
import { SkillportMCP } from "./mcp-server";
```

The class defines `UserProps` with OAuth-specific fields:

```typescript
interface UserProps extends Record<string, unknown> {
  email: string;
  name: string;
  picture?: string;
  domain?: string;
}
```

In authless mode, these properties are never populated by the OAuth flow. The user identity comes from the `user_email` tool parameter instead.

**Options:**
1. **Keep shared class** - Make `UserProps` optional, rely on tool parameters for identity
2. **Create separate class** - `mcp-server-authless.ts` with simplified types
3. **Use union type** - `UserProps | AuthlessProps`

**Recommendation:** Option 1 (keep shared class) is simplest. The `UserProps` interface already allows the fields to be empty since they come from OAuth which isn't used in authless mode.

---

### 4. No Rate Limiting

**File:** `src/index-authless.ts`

**Problem:** A valid API key can make unlimited requests. No protection against abuse.

**Recommendation:** Add KV-based rate limiting:

```typescript
// Simple hourly rate limit per org
const hour = new Date().toISOString().slice(0, 13); // "2025-12-25T14"
const rateKey = `rate:${orgId}:${hour}`;
const count = parseInt(await env.OAUTH_KV.get(rateKey) || "0");

if (count > 1000) { // 1000 requests per hour per org
  return new Response(
    JSON.stringify({ error: "Rate limit exceeded", retry_after: 3600 }),
    { status: 429, headers: { "Content-Type": "application/json" } }
  );
}

await env.OAUTH_KV.put(rateKey, String(count + 1), { expirationTtl: 3600 });
```

**Priority:** Medium - implement before wider rollout.

---

### 5. Missing CORS Headers

**File:** `src/index-authless.ts`

**Problem:** SSE endpoints may need CORS headers for browser-based MCP clients or debugging tools.

**Recommendation:**

```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Skillport-API-Key",
};

// Handle preflight
if (request.method === "OPTIONS") {
  return new Response(null, { headers: corsHeaders });
}

// Add to all responses
return new Response(body, {
  headers: { ...corsHeaders, "Content-Type": "application/json" }
});
```

**Priority:** Low - only needed if browser-based tools are used.

---

## 🟢 Minor Issues

### 6. Missing npm Script for Authless Deploy

**File:** `package.json`

**Current:**
```json
"scripts": {
  "dev": "wrangler dev",
  "deploy": "wrangler deploy",
  "test": "vitest"
}
```

**Problem:** Deploying authless requires manual command:
```bash
node node_modules/wrangler/bin/wrangler.js deploy -c wrangler-authless.toml
```

**Recommendation:**
```json
"scripts": {
  "dev": "wrangler dev",
  "dev:authless": "wrangler dev -c wrangler-authless.toml",
  "deploy": "wrangler deploy",
  "deploy:authless": "wrangler deploy -c wrangler-authless.toml",
  "test": "vitest"
}
```

---

### 7. README Not Updated for Authless Mode

**File:** `README.md`

**Problem:** Documentation only describes OAuth authentication. Missing:
- Authless mode explanation
- OAuth bug context
- API key configuration
- Authless deployment instructions

**Recommendation:** Add "Authless Mode" section explaining:
- Why it exists (OAuth bug workaround)
- How to configure API keys
- How to deploy the authless variant
- Link to workaround strategy document

---

### 8. No Unit Tests

**File:** `package.json`

```json
"test": "vitest"
```

But no test files exist in the project.

**Recommendation:** Add tests for:
- `GitHubClient` - mock GitHub API responses
- API key validation - test valid/invalid/missing keys
- MCP tool responses - verify JSON structure

**Example test structure:**
```
src/
├── __tests__/
│   ├── github-client.test.ts
│   ├── api-key-validation.test.ts
│   └── mcp-tools.test.ts
```

---

### 9. Hardcoded Cache TTLs

**File:** `src/github-client.ts`

```typescript
// Hardcoded values scattered through code
return this.fetchWithCache(
  `marketplace:${this.repo}`,
  300, // 5 minutes
  async () => { ... }
);

// Later...
return this.fetchWithCache(
  `plugin:${this.repo}:${name}`,
  3600, // 1 hour
  async () => { ... }
);
```

**Recommendation:** Centralize configuration:

```typescript
// src/config.ts
export const CACHE_TTL = {
  MARKETPLACE: 300,    // 5 minutes
  PLUGIN: 3600,        // 1 hour
  SKILL: 21600,        // 6 hours
};
```

Or use environment variables via `wrangler.toml`:

```toml
[vars]
CACHE_TTL_MARKETPLACE = "300"
CACHE_TTL_PLUGIN = "3600"
CACHE_TTL_SKILL = "21600"
```

---

### 10. CLAUDE.md Status Outdated

**File:** `CLAUDE.md`

```markdown
## Implementation Status

Current state: **Scaffold with TODOs**

- [x] MCP server structure
- [x] Tool definitions with schemas
- [ ] GitHub OAuth handler         # Actually complete
- [ ] GitHub API client            # Actually complete  
- [ ] Tool implementations         # Actually complete
- [ ] KV storage setup             # Actually complete
```

**Recommendation:** Update to reflect actual state:

```markdown
## Implementation Status

Current state: **Production (Authless Mode)**

- [x] MCP server structure
- [x] Tool definitions with schemas
- [x] GitHub OAuth handler (OAuth version)
- [x] Authless API key handler (workaround version)
- [x] GitHub API client for marketplace
- [x] Tool implementations
- [x] KV storage setup
- [ ] User email parameter for audit (pending)
- [ ] Rate limiting (pending)
- [ ] Unit tests (pending)
```

---

## Action Items

### Blocking (Must Fix Before Skill Development)

| Issue | File | Action |
|-------|------|--------|
| Missing `user_email` param | `src/mcp-server.ts` | Add to all 4 tools |

### High Priority (Fix Soon)

| Issue | File | Action |
|-------|------|--------|
| No rate limiting | `src/index-authless.ts` | Add KV-based rate limiting |
| README outdated | `README.md` | Add authless documentation |

### Medium Priority (Nice to Have)

| Issue | File | Action |
|-------|------|--------|
| No npm scripts | `package.json` | Add `dev:authless`, `deploy:authless` |
| Hardcoded TTLs | `src/github-client.ts` | Move to config/env vars |
| CLAUDE.md outdated | `CLAUDE.md` | Update status |

### Low Priority (Future)

| Issue | File | Action |
|-------|------|--------|
| No unit tests | `src/__tests__/` | Add vitest tests |
| Missing CORS | `src/index-authless.ts` | Add if browser tools needed |

---

## Next Steps

1. **Implement `user_email` parameter** - This unblocks Skill development
2. **Add rate limiting** - Basic abuse protection
3. **Update documentation** - README and CLAUDE.md
4. **Create Skillport Skill** - See [authless-workaround-strategy.md](./authless-workaround-strategy.md)

---

## References

- [Authless Workaround Strategy](./authless-workaround-strategy.md)
- [OAuth Investigation Checkpoint](../checkpoints/2025-12-25-1115-claude-ai-oauth-investigation.md)
- [GitHub Issue #11814 - OAuth Bug](https://github.com/anthropics/claude-code/issues/11814)
