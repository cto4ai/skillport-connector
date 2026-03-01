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

## Iteration 1 (commit `fa7f6cd`)

Both issues above resolved:
- **Default flipped** to `"package"` — model now gets `.skill` zip without specifying mode
- **`present_files` delivery resolved** — `present_files` needs a file path, not inline base64. Claude.ai has a sandboxed Ubuntu container (code execution tool). Instructions updated to tell model to decode base64 to `/tmp/{name}.skill` via Python, then call `present_files`.

## Issue 3: Slow base64 decode on Claude.ai

Claude.ai smoke test showed the model writing the base64 string line-by-line into a Python command via bash — extremely slow for large skill packages. The code execution sandbox is processing the entire blob inline in the `python3 -c` command string.

**Optimization ideas:**
1. **Two-step write** — `echo '<b64>' > /tmp/name.b64` then `python3 -c "import base64; open('/tmp/name.skill','wb').write(base64.b64decode(open('/tmp/name.b64').read()))"` — separates the data transfer from the decode step
2. **Chunked content** — Split `content_base64` into smaller chunks in the response so the model can write them incrementally
3. **Download URL instead of inline** — Store the `.skill` zip in R2/KV with a short-lived pre-signed URL. Return the URL; model uses `curl` or `wget` in the sandbox to fetch it, then `present_files`. Eliminates inline base64 entirely — fastest option but adds infrastructure (R2 bucket or KV storage with TTL)
4. **Smaller test skill** — `validating-json-schemas` has 5 files including scripts. Try with a minimal skill (just SKILL.md) to see if the speed is acceptable for small packages

## Issue 4: SKILL.md corrupt in downloaded .skill file

Claude.ai test completed the full flow — `present_files` worked, skill card appeared with "Copy to your skills" button. But clicking it failed: "Failed to extract file contents."

Downloaded file to `/Users/jackivers/Downloads/validating-json-schemas.skill`. Analysis:
- `file` reports valid zip
- `unzip -l` shows correct structure (5 files under `validating-json-schemas/`)
- `unzip -t` shows **SKILL.md has corrupt compressed data** ("incomplete l-tree, invalid compressed data to inflate"). Other 4 files pass.
- Our packager's unit tests pass (round-trip decode works). Corruption happens during the model's base64 transfer in the sandbox — likely truncation or mangling of the base64 string when the model writes it via `python3 -c`.

**Root cause:** The model is embedding the entire base64 string inline in a `python3 -c` command. Long strings get truncated or corrupted during the slow line-by-line write. SKILL.md is the first file in the zip — its compressed bytes are at the start of the base64 string, most vulnerable to truncation.

**Fix:** The download URL approach (Issue 3, option 3) solves both the speed AND corruption problems. Store the `.skill` zip in R2/KV with a short-lived URL. Model just runs `curl -o /tmp/name.skill <url>` in the sandbox — fast, no inline base64, no corruption risk.

## Next Steps

1. **Implement download URL approach** — Store `.skill` in R2 or KV with TTL, return URL instead of inline base64. Model uses `curl` in sandbox, then `present_files`.
2. Re-test on Claude.ai after implementing download URL
3. If R2 is too heavy, consider KV (max 25MB value, plenty for skill zips)

## Notes

- `fflate` works perfectly in CF Workers with `nodejs_compat` — zip creation is fast and correct
- The server-side packaging itself is solid — the gap is in last-mile delivery performance
- `validating-json-schemas` skill in `v2-test-skills` group used as test fixture (surface:CALL)
- MCP reconnect required after deploy for Claude.ai to pick up new tool descriptions
- **The full `present_files` flow WORKS** — skill card with "Copy to your skills" appeared. Just need uncorrupted data.

## Notes

- `fflate` works perfectly in CF Workers with `nodejs_compat` — zip creation is fast and correct
- The server-side packaging itself is solid — the gap is in last-mile delivery performance
- `validating-json-schemas` skill in `v2-test-skills` group used as test fixture (surface:CALL)
- MCP reconnect required after deploy for Claude.ai to pick up new tool descriptions
