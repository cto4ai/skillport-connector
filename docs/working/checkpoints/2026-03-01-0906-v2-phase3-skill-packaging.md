# Checkpoint: v2 Phase 3 — Server-side .skill Packaging

**Date:** 2026-03-01 09:06
**Status:** IN PROGRESS
**Branch:** development

## Objective

Move `.skill` zip packaging server-side so Claude.ai/Desktop can install skills via `present_files` instead of hallucinating client-side zip creation.

## Changes Made

**New Files:**
- [src/skill-packager.ts](src/skill-packager.ts) — Pure `packageSkill()` function using `fflate` for sync zip in CF Workers
- [src/skill-packager.test.ts](src/skill-packager.test.ts) — 3 unit tests (zip structure, plugin.json filtering, base64 binary)

**Modified Files:**
- [src/skillport-proxy.ts](src/skillport-proxy.ts) — Replaced `mode: "package"` branch: now calls `packageSkill()` and returns `content_base64` instead of raw files + "create a zip" instructions
- [src/search-index.ts](src/search-index.ts) — Added 16th chunk `installing-skills` documenting install across surfaces
- [src/mcp-server-v2.ts](src/mcp-server-v2.ts) — Updated `installSkill` description to clarify two modes
- [package.json](package.json) — Added `fflate` dependency (~8KB gzipped, pure JS, sync API)
- [docs/skillport-v2/architecture.md](docs/skillport-v2/architecture.md) — Marked Phase 3 complete

**Commits:**
- `18bff06` feat: add server-side .skill packaging for multi-surface install (v2 phase 3)

## Verification

- `tsc --noEmit` — clean
- `vitest` — 3/3 tests pass
- Deployed to CF Workers
- MCP smoke test via Claude Code: `installSkill({ name: "acp", mode: "package" })` returns `content_base64` with valid zip
- Search smoke test: "how do I install a skill" returns `installing-skills` chunk as top result

## Problem: Claude.ai Live Testing

Two issues discovered during Claude.ai smoke testing:

### Issue 1: Model defaults to wrong mode

When asked to "install the validating-json-schemas skill", the model uses default `mode: "skill"` (returns `type: "direct"` with file paths). On Claude.ai there's no filesystem, so it hallucinated a successful install without writing anything. The model didn't think to search for install guidance first.

**Possible solutions:**
- **Flip the default** from `"skill"` to `"package"` in the proxy. The v2 MCP endpoint exists for Claude.ai/Desktop — CC uses native plugins. `"package"` is the right default for this endpoint.
- **Stronger tool description** — Add explicit guidance: "Use mode 'package' on Claude.ai/Desktop, 'skill' only on Claude Code."
- **Both** — safest approach.

### Issue 2: Model doesn't know how to use `present_files`

After being nudged to use `mode: "package"`, the model correctly got back `content_base64` — but then tried to `echo` the base64 string to a file via bash instead of calling `present_files`. It doesn't know how to pass base64 content from an MCP tool response to `present_files`.

This is the **open risk** identified in the plan. `present_files` accepting base64 from an MCP tool response is untested — Anthropic's skill-creator uses it from a local skill context, not over MCP.

**Possible solutions:**
- **Research `present_files` API** — Understand its actual input format and whether it can accept inline base64 from MCP tool responses.
- **Pre-signed download URL** — Instead of inline base64, store the zip in R2/KV with a short-lived URL. Return the URL; model tells user to download it. More complex but avoids the `present_files` uncertainty.
- **Data URI approach** — Return the content as a data URI that the model can present as a clickable link.
- **Hybrid instructions** — Update instructions to guide the model step-by-step on how to use `present_files`, with fallback to describing manual download if `present_files` isn't available.

## Next Steps

1. Fix Issue 1: Flip default mode to `"package"` + stronger tool description
2. Research `present_files` API to understand delivery mechanism
3. If `present_files` won't work over MCP, implement pre-signed URL fallback
4. Re-test on Claude.ai after fixes

## Notes

- `fflate` works perfectly in CF Workers with `nodejs_compat` — zip creation is fast and correct
- The server-side packaging itself is solid — the gap is purely in the last-mile delivery to the user
- `validating-json-schemas` skill in `v2-test-skills` group used as test fixture (surface:CALL)
