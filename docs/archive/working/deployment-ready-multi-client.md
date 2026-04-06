# Plan: Deployment-Ready Connector for Multiple Clients

## Objective
Make the Skillport Connector deployable to multiple organizations by:
1. Removing/configuring hardcoded values
2. Cleaning up unused configuration
3. Creating complete setup instructions in README

---

## Phase 1: Fix Hardcoded Domain Restriction (CRITICAL)

**File:** `src/google-handler.ts:188-192`

**Current Code (BLOCKS all non-CraftyCTO users):**
```typescript
// Optional: Verify user is from allowed domain
// Uncomment and set your domain to restrict access
if (user.hd !== "craftycto.com") {
  return c.text("Unauthorized domain", 403);
}
```

**Fix:** Replace with provider-specific `GOOGLE_ALLOWED_DOMAINS` environment variable:
- If not set → allow all authenticated Google users (default for open deployments)
- If set → comma-separated list of allowed Google Workspace domains (e.g., `acme.com,acme.io`)
- Provide clear error message showing which domains are allowed
- Named `GOOGLE_*` to anticipate future `ENTRA_ALLOWED_TENANTS` for Microsoft Entra support

---

## Phase 2: Add CONNECTOR_URL to Configuration

**Issue:** `CONNECTOR_URL` exists in code but is not documented in setup files.

**Files to update:**
- `wrangler.toml.example` - Add to `[vars]` section
- `.dev.vars.example` - Add with explanation

**Note:** The fallback `"https://your-connector.workers.dev"` is fine as a placeholder—it will produce obviously broken URLs if not configured.

---

## Phase 3: Remove Unused Configuration

### 3a. Remove `COOKIE_ENCRYPTION_KEY`
- Never used in any source file
- Remove from: `worker-configuration.d.ts`, `wrangler.toml.example`, `.dev.vars.example`

### 3b. Remove `API_KEYS` KV namespace
- Never used in any source file (was planned for "authless mode" that was never implemented)
- Remove from: `worker-configuration.d.ts`, `wrangler.toml.example`

---

## Phase 4: Update Documentation

### 4a. Update `wrangler.toml.example`
Complete configuration template with:
```toml
[vars]
MARKETPLACE_REPO = "your-org/your-marketplace"
CONNECTOR_URL = "https://your-connector.your-domain.workers.dev"
# GOOGLE_ALLOWED_DOMAINS = "your-domain.com"  # Optional: restrict to specific Google Workspace domains
```

### 4b. Update `.dev.vars.example`
Add:
```
# Your deployed connector URL (required for install/edit scripts)
CONNECTOR_URL=http://localhost:8787

# Optional: Restrict to specific Google Workspace domains (comma-separated)
# GOOGLE_ALLOWED_DOMAINS=your-domain.com
```

### 4c. Add "Deploy Your Own" Section to README.md
Add detailed step-by-step deployment guide after the Quick Start section:

**Contents:**
1. Prerequisites (Cloudflare account, Google Cloud Console, GitHub)
2. Create KV namespace
3. Configure Google OAuth (step-by-step with screenshots link)
4. Create GitHub token
5. Set secrets
6. Deploy
7. Add to Claude.ai/Desktop
8. Verify

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/google-handler.ts` | Replace hardcoded domain check with `GOOGLE_ALLOWED_DOMAINS` env var |
| `worker-configuration.d.ts` | Add `GOOGLE_ALLOWED_DOMAINS?`, remove `COOKIE_ENCRYPTION_KEY`, remove `API_KEYS` |
| `wrangler.toml.example` | Add `CONNECTOR_URL`, `GOOGLE_ALLOWED_DOMAINS`; remove `API_KEYS` KV namespace; remove `COOKIE_ENCRYPTION_KEY` comment |
| `.dev.vars.example` | Add `CONNECTOR_URL`, `GOOGLE_ALLOWED_DOMAINS`; remove `COOKIE_ENCRYPTION_KEY` |
| `README.md` | Add detailed "Deploy Your Own" section with complete setup guide |

---

## Transition for Existing Deployment (CraftyCTO)

After these changes, add to production secrets:
```bash
wrangler secret put GOOGLE_ALLOWED_DOMAINS
# Enter: craftycto.com
```

This maintains the current domain restriction behavior.

---

## Testing Strategy

### Local Testing
1. `npm run dev` without `GOOGLE_ALLOWED_DOMAINS` → verify all Google users can auth
2. Set `GOOGLE_ALLOWED_DOMAINS=test.com` → verify domain restriction works
3. Verify `CONNECTOR_URL` appears correctly in install script output

### Production Verification
1. Deploy to Cloudflare
2. Add connector in Claude.ai, complete OAuth
3. Test `list_skills`, `fetch_skill` tools
4. Verify install script URLs are correct

---

## Estimated Scope
- 5 files modified
- ~30 lines of code changed
- ~20 lines of config/docs updated
