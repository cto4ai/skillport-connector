# Cleanup Plan

Two areas need attention after the SSE → Streamable HTTP migration.

## Track 1: PR #22 Review Findings

Issues discovered during code review. See `pr-22-review-findings.md` for details.

### This PR's Scope (fix now)

| # | Issue | File | Effort |
|---|-------|------|--------|
| 2 | Silent fallback routing | `src/index.ts:28-36` | Small |
| 3 | Patch script silent skip (missing provider) | `scripts/patch-oauth-provider.js` | Small |
| 4 | Patch script silent skip (changed patterns) | `scripts/patch-oauth-provider.js` | Small |
| 5 | No version check in patch script | `scripts/patch-oauth-provider.js` | Medium |

### Pre-existing Issues (separate work)

| # | Issue | File | Effort |
|---|-------|------|--------|
| 1 | Hardcoded domain `craftycto.com` | `src/google-handler.ts:190-192` | Small |
| 6 | Missing JSON.parse error handling | `src/index.ts:75, 373` | Small |
| 7 | KV.put not wrapped in try-catch | `src/index.ts:96-98` | Small |
| - | Zero test coverage | - | Large |

## Track 2: OAuth Provider Patch Lifecycle

### Current State

- **Patch:** `scripts/patch-oauth-provider.js`
- **Why needed:** `@cloudflare/workers-oauth-provider` issue #108 - audience validation fails with path
- **Our workaround:** Postinstall script patches `dist/oauth-provider.js`

### Upstream Status (as of 2026-01-08)

| Item | Status |
|------|--------|
| Issue #108 | Open (since Nov 10, 2025) |
| PR #109 | Open, not merged (2+ months waiting) |
| Current version | 0.2.2 (we're on latest) |
| Fixed version | None released yet |

### Cleanup Plan

**Phase 1: Improve patch robustness (now)**
- Add version detection to patch script
- Fail loudly if patterns not found and not already patched
- Log which version is being patched

**Phase 2: Monitor upstream (ongoing)**
- Watch for PR #109 merge
- Watch for new `@cloudflare/workers-oauth-provider` releases
- Test new versions when available

**Phase 3: Remove patch (when fix lands)**
- Update to fixed version
- Verify audience validation works without patch
- Remove `scripts/patch-oauth-provider.js`
- Remove postinstall script from `package.json`

## Track 3: Dependency Upgrades

### agents Package

| Current | Latest | Risk |
|---------|--------|------|
| 0.0.72 | 0.3.3 | Medium-High |

**Why we held back:** The migration plan noted potential breaking changes:
- `@modelcontextprotocol/sdk`: ^1.10.2 → 1.23.0 (MCP spec changes)
- `ai`: ^4.3.9 → ^6.0.0 (major version bump)

**Upgrade checklist:**
- [ ] Review agents changelog for breaking changes
- [ ] Test `.mount()` (SSE) still works
- [ ] Test `.serve()` (Streamable HTTP) still works
- [ ] Test OAuth flow with both transports
- [ ] Test all MCP tools functional
- [ ] Deploy to staging first

### Other Dependencies

Run `npm outdated` to check for other upgrades.

## Priority Order

1. **High:** Track 1 items #2-5 (patch script & routing robustness)
2. **High:** Track 2 Phase 1 (patch script improvements)
3. **Medium:** Track 3 agents upgrade (after dual transport is stable)
4. **Medium:** Track 1 item #1 (hardcoded domain - blocks open source)
5. **Low:** Track 1 items #6-7 (error handling improvements)
6. **Ongoing:** Track 2 monitoring for upstream fix

## Next Steps

1. Create branch for Track 1 items #2-5 + Track 2 Phase 1
2. Test patch script improvements
3. PR to development
4. Separately: Plan agents upgrade with full test coverage
