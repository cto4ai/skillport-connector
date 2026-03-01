# Skillport Connector v2: Architecture Decisions

**Date:** 2026-02-28
**Status:** Decided
**Context:** [v2 architecture proposal](architecture.md)

## Decisions

### 1. Code execution: In-worker eval (not Workers for Platforms)

**Decision:** Use `new Function("skillport", ...)` directly in the worker. No dynamic isolate spawning.

**Rationale:** Workers for Platforms costs $25/mo and is designed for multi-tenant platforms running untrusted third-party code. Our use case is single-user, model-generated code calling a fixed API proxy. The model's code is always short (2-10 lines) and scoped to `skillport.*` methods. Security is enforced by only passing `skillport` into the function scope — `fetch`, `env`, and worker APIs are simply not available.

**Rejected:** Workers for Platforms ($25/mo), Cloudflare Code Mode SDK (requires Workers for Platforms).

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
- `mode: "package"` → returns `{ filename: "{name}.skill", content: "..." }` — model uses `present_files` for download (CAI/CD)

**Rationale:** The server cannot reliably detect the client surface. `client_info` from the MCP handshake returns the same value for Claude Desktop, Claude.ai, and Cowork. The real detection signals (tool name patterns like `-local`, `mcp__cowork__*`, `present_files`) are only visible model-side. The existing `surface-detect` skill handles this independently.

**Rejected:** Server-side surface detection (unreliable — `client_info` is identical across CD/CAI/CW).

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

### 7. Security: Scope restriction via function parameters

**Decision:** The `execute` function receives only `skillport` as a parameter. No `fetch`, `env`, `caches`, `crypto`, or other worker APIs are passed in.

```typescript
const fn = new Function("skillport", `return (async () => { ${code} })()`);
const result = await fn(skillportProxy);
```

**Rationale:** No allowlist/blocklist needed. If it's not passed in, it's not accessible. The model's code can only call `skillport.*` methods, which internally make authenticated REST API calls. Standard JS builtins (String, Array, JSON, Math) remain available, which is fine.

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
