# PR #22 Review Findings

From review of "feat: SSE + Streamable HTTP dual transport support"

## Critical (1)

### 1. Hardcoded Domain Restriction
- **File:** `src/google-handler.ts:190-192`
- **Issue:** Domain restriction hardcoded to `craftycto.com`
- **Fix:** Make configurable via `ALLOWED_DOMAIN` env var or remove for open source

```typescript
if (user.hd !== "craftycto.com") {
  return c.text("Unauthorized domain", 403);
}
```

## Important (6)

### 2. Silent Fallback to HTTP Handler
- **File:** `src/index.ts:28-36`
- **Issue:** Combined handler routes ALL non-/sse requests to httpHandler, including invalid paths
- **Fix:** Explicitly check for `/mcp` and return 404 for unknown paths

### 3. Patch Script Silent Skip (Missing Provider)
- **File:** `scripts/patch-oauth-provider.js:21-24`
- **Issue:** If `@cloudflare/workers-oauth-provider` isn't installed, logs warning and exits 0
- **Fix:** Should fail with non-zero exit code

### 4. Patch Script Silent Skip (Changed Patterns)
- **File:** `scripts/patch-oauth-provider.js:35-55`
- **Issue:** If OAuth provider updates and patterns change, prints "No patches needed" but bug isn't fixed
- **Fix:** Should fail if expected patterns aren't found AND new patterns aren't present

### 5. No Version Check in Patch Script
- **File:** `scripts/patch-oauth-provider.js:20-62`
- **Issue:** When upstream fix lands, patch continues running unnecessarily
- **Fix:** Add version checking to skip for fixed versions (once known)

### 6. Missing Error Handling for JSON.parse
- **File:** `src/index.ts:75, src/index.ts:373`
- **Issue:** JSON.parse on KV data without try-catch throws 500 on corrupted data
- **Fix:** Wrap in try-catch with actionable error

### 7. KV.put Operations Not Wrapped
- **File:** `src/index.ts:96-98`
- **Issue:** KV failures could silently allow token reuse
- **Fix:** Add try-catch around KV operations

## Test Coverage Gap

Project has zero test files despite vitest being configured.

### Priority Tests Needed
| Priority | Test Area | Criticality |
|----------|-----------|-------------|
| 1 | Dual transport routing logic | 9/10 |
| 2 | Domain restriction security | 8/10 |
| 3 | OAuth route protection | 8/10 |
| 4 | Patch script logic | 6/10 |

## Categorization

**This PR's scope (fix before main):**
- #2 Silent fallback routing
- #3, #4, #5 Patch script robustness

**Pre-existing issues (separate PRs):**
- #1 Hardcoded domain restriction
- #6 JSON.parse error handling
- #7 KV.put error handling
- Test coverage

## Date
2026-01-07
