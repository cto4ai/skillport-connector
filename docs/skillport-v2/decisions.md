# Skillport Connector v2: Architecture Decisions

**Date:** 2026-02-28
**Status:** Decided
**Context:** [v2 architecture proposal](architecture.md)

## Decisions

### 1. Code execution: Structured dispatch (not eval, not Workers for Platforms)

**Decision:** The `execute` tool takes `{ method, args }` and dispatches to the proxy. No dynamic code evaluation.

**Original plan:** Use `new Function("skillport", ...)` for in-worker eval. This was blocked — Cloudflare Workers disables `new Function()` and `eval()` in production. The `cloudflare:unsafe-eval` module only works in local dev (workerd with `--experimental`). There is no compatibility flag that enables runtime eval on the $5 Workers Paid plan.

**Why this still solves the v1 problems:** The core value of v2 was never the JS code execution itself — it was eliminating token handling, curl construction, and skill doc dependency. Structured dispatch achieves all three: the model picks a method name and passes arguments, the server handles auth internally, no tokens enter context.

**Trade-off vs code mode:** The model can't chain multiple API calls in a single tool invocation. In practice this rarely matters — most interactions are single calls, and the model can make multiple `execute` calls if needed.

**Rejected:** `new Function()` eval (blocked by CF Workers runtime), Workers for Platforms ($25/mo), `cloudflare:unsafe-eval` (local dev only).

### 2. Search implementation: In-memory keyword map

**Decision:** Bundle domain knowledge as static chunks in the worker source. Keyword match against section titles/tags.

**Rationale:** The corpus is ~225 lines (~5KB). FTS5 or D1 would add external dependencies and latency for no benefit at this scale. In-memory is instant, has no dependencies, and updates on redeploy.

**Rejected:** FTS5 via D1 (overkill), KV-stored chunks (unnecessary latency).

### 3. Migration: Versioned MCP endpoints, v1 untouched

**Decision:** Add `/v2/mcp` endpoint serving the new tool set. `/mcp` continues to serve v1 (`skillport_auth`) unchanged. Both share OAuth, KV, and GitHub client.

**Rationale:** The user depends on v1 daily. Running both endpoints in the same worker lets v2 be tested in parallel without risk to v1. When v2 is proven, update connector URLs and retire `/mcp`.

**Rejected:** Separate worker (duplicates infrastructure), both tool sets on same endpoint (model confusion), feature flags (overengineered).

### 4. Install workflow: Mode parameter, model decides

**Decision:** `installSkill(name, { mode: "skill" | "package" })` — model detects its own environment and passes the right mode.

- `mode: "skill"` → returns `{ files: [...], installPath: "~/.claude/skills/{name}/" }` — model writes files directly (CC)
- `mode: "package"` → server zips skill files into a `.skill` package (zip with `.skill` extension), returns `{ filename: "{name}.skill", content: "<base64>" }` — model calls `present_files` to offer download (CAI/CD)

**Rationale:** The server cannot reliably detect the client surface. `client_info` from the MCP handshake returns the same value for Claude Desktop, Claude.ai, and Cowork. The real detection signals (tool name patterns like `-local`, `mcp__cowork__*`, `present_files`) are only visible model-side. The existing `surface-detect` skill handles this independently.

**Updated (2026-03-01):** `mode: "package"` now specifies server-side zip packaging rather than returning raw files. This matches Anthropic's skill-creator pattern (`package_skill.py` produces a `.skill` zip) but moves packaging server-side so the model only needs one `present_files` call. Avoids multi-step client-side packaging that's error-prone across surfaces.

**Rejected:** Server-side surface detection (unreliable — `client_info` is identical across CD/CAI/CW). Client-side packaging (model would need to write temp files, zip, then present — too many failure points on CAI/CD). Download URL (adds auth complexity, user leaves chat).

### 5. Skillport skill: Eliminate, bring back small if needed

**Decision:** Ship v2 without a client-side skill. The `execute` tool description + `search` index should provide everything the model needs. If gaps appear in practice (e.g., local filesystem paths for version checking), add a minimal skill (<20 lines).

**Rationale:** The v1 skill is ~500 lines. ~55% is API usage instructions (eliminated by typed API). ~45% is domain knowledge (moved to `search` index). The remaining local filesystem knowledge (installed skill paths, post-install instructions) can live in the `search` index or `execute` tool description.

### 6. Surface-detect skill: Independent, no Skillport dependency

**Decision:** The `surface-detect` skill should not depend on any Skillport MCP tool. Its detection logic is entirely model-side tool inspection:

1. `client_info` null → CC (shortcut, but not required)
2. `-local` suffix tools → CD
3. `mcp__cowork__*` tools → CW
4. `present_files` tool → CAI
5. None match → CC or ambiguous

The `client_info` null check (step 1) currently requires calling `skillport_auth`. In v2, this can be dropped — CC is equally detectable as the fallback when no other signals match.

### 7. Security: Server-side dispatch, no user code execution

**Decision:** The `execute` tool dispatches to a fixed set of proxy methods. The model specifies `{ method, args }` — no arbitrary code runs in the worker.

**Rationale:** This is inherently more secure than the original eval approach. The server only executes known methods with validated arguments. No allowlist/blocklist needed because there's no code to evaluate — just method dispatch.

## File Plan

### New files

| File | Purpose |
|------|---------|
| `src/mcp-server-v2.ts` | MCP server with `execute` + `search` tools |
| `src/skillport-proxy.ts` | `skillport.*` API proxy — wraps REST API calls with stored auth |
| `src/search-index.ts` | In-memory domain knowledge chunks + keyword matcher |

### Modified files

| File | Change |
|------|--------|
| `src/index.ts` | Route `/v2/mcp` to v2 MCP server |

### Unchanged

| File | Why |
|------|-----|
| `src/mcp-server.ts` | v1 stays live on `/mcp` |
| `src/github-client.ts` | Shared by v1 and v2 |
| `src/google-handler.ts` | OAuth shared by both |
| `src/rest-api.ts` | REST API unchanged; proxy calls same handlers |
