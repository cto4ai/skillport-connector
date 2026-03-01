# Checkpoint: v2 Search Tool — Phase 2 Complete

**Date:** 2026-03-01 08:45
**Status:** COMPLETED
**Branch:** development (PR #29 merged)

## Objective

Add `search` tool to v2 MCP server for on-demand domain knowledge queries, replacing the ~500-line v1 Skill doc with a lightweight in-memory keyword index.

## Changes Made

**New Files:**
- [src/search-index.ts](src/search-index.ts) — 15 domain knowledge chunks + keyword search algorithm (~5KB corpus)

**Modified Files:**
- [src/mcp-server-v2.ts](src/mcp-server-v2.ts) — Add `search` tool registration, update server instructions
- [docs/skillport-v2/architecture.md](docs/skillport-v2/architecture.md) — Mark Phase 2 complete, update Phase 3 design
- [docs/skillport-v2/decisions.md](docs/skillport-v2/decisions.md) — Update Decision 4 with server-side `.skill` packaging
- [CLAUDE.md](CLAUDE.md) — Add v2 tools table (execute + search)

## Commits

- `6aeae4b` feat: add search tool for on-demand domain knowledge (v2 phase 2)
- `56f6dc8` fix: strengthen search tool instructions and update Phase 3 design
- `8e1dc7f` fix: address PR review findings (issues 1-5)
- `7a20e25` Merge pull request #29

## Key Decisions

- **15 chunks, keywords-only matching** — content/titles not searched. Manually curated keywords with synonyms. Simple, predictable, no false positives.
- **Directive MCP instructions** — "ALWAYS call search first" before answering domain knowledge questions. Passive instructions ("Use search to look up...") were ignored by the model.
- **Server-side `.skill` packaging for Phase 3** — matches Anthropic's skill-creator pattern (`package_skill.py`) but server-side. Model just calls `present_files` with the blob.

## PR #29 Review Fixes

1. Added try-catch to search handler (matching execute tool pattern)
2. Fixed architecture.md: search is standalone tool, not execute method
3. Added `:` and `/` to tokenizer split regex (`surface:CC` now works)
4. Removed stale "FTS5 or" phrasing in architecture doc
5. Replaced `!` + `.filter(Boolean)` with explicit check + `console.error`

## Verification

**Local tests (7/7 pass):** frontmatter, naming, surface tags, no-results, limit, listTopics, getChunk

**Live MCP smoke tests (6/6 pass):** All queries return correct chunks, `surface:CC` colon splitting works, no-results shows topic list

**Claude.ai end-to-end:** Full skill lifecycle tested — browse, search for format guidance, create multi-file skill (SKILL.md + references/ + scripts/), verify round-trip, publish with surface:CALL, delete. Model calls `search` before authoring with updated instructions.

**Known gap:** `installSkill` on Claude.ai — model hallucinates successful filesystem install. Phase 3 addresses this with server-side `.skill` packaging + `present_files`.

## Next Steps

1. **Phase 3: Multi-surface install** — `mode: "package"` returns server-built `.skill` zip (base64). Open question: whether `present_files` accepts base64 from MCP tool response.
2. **Test skill cleanup** — `validating-json-schemas` left in marketplace as test fixture
3. Retire v1 `/mcp` endpoint once v2 is proven in production
