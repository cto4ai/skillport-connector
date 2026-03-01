# Skillport Connector v2: Structured Dispatch Architecture

**Date:** 2026-02-28
**Status:** Decided (see [decisions.md](decisions.md) for resolved questions)
**Context:** [Context Mode deep analysis](../../../../claude-context-mode/docs/checkpoints/2026-02-28-1047-context-mode-deep-analysis.md)

## Problem Statement

Skillport Connector v1 uses a single-MCP-tool + REST API + Skill pattern inspired by Cloudflare's Code Mode. While this reduced tool schema overhead from ~10 tools to 1, it introduced a reliability problem: **the model fails ~40% on first attempt** because it must:

1. Call `skillport_auth` to get a bearer token
2. Parse the response to extract token + base URL
3. Read the Skill doc to find the right REST endpoint
4. Construct curl/Python with correct Bearer header and token prefix
5. Handle three token types (`sk_api_`, `sk_install_`, `sk_edit_`) with 15-min TTLs

This trades structured tool calls (which models handle reliably) for "read docs and construct HTTP requests" (which is error-prone).

## Proposed Approach: Structured Method Dispatch

Replace the current auth-token-then-curl pattern with a single `execute` tool that dispatches to typed `skillport.*` methods server-side. The model specifies `{ method, args }` — the server handles auth, routing, and execution.

> **Note:** The original design used `new Function("skillport", ...)` for in-worker JS eval. This was blocked — Cloudflare Workers disables `new Function()` and `eval()` in production. See [decisions.md](decisions.md) for full rationale.

### Architecture Overview

```
Claude                    Skillport MCP Server (CF Worker)
  │                              │
  │── MCP connect ──────────────►│── OAuth (Google) ──► auto on first connect
  │                              │   auth context stored server-side
  │                              │
  │── execute({ method, args }) ►│── Server-side dispatch
  │                              │   - resolves method on skillport.* proxy
  │                              │   - auth token injected automatically
  │                              │   - method runs, result returns
  │                              │
  │◄── { result: "..." } ───────│
```

### Two MCP Tools (Fixed ~1,000 Token Cost)

```json
[
  {
    "name": "execute",
    "description": "Execute a Skillport API method. Auth is automatic.",
    "inputSchema": {
      "properties": {
        "method": {
          "type": "string",
          "description": "The skillport.* method to call (e.g. 'listSkills', 'installSkill')."
        },
        "args": {
          "type": "object",
          "description": "Arguments to pass to the method. See method signatures below."
        }
      },
      "required": ["method"]
    }
  },
  {
    "name": "search",
    "description": "Search Skillport API reference and skill authoring docs.",
    "inputSchema": {
      "properties": {
        "query": {
          "type": "string",
          "description": "What you want to find (endpoint, workflow, best practice)."
        }
      }
    }
  }
]
```

**Why `search` here (unlike the initial analysis):** The Skillport API is small (~10 endpoints), but the *domain knowledge* (skill authoring best practices, SKILL.md format, surface tags, naming conventions, progressive disclosure patterns) is large. `search` lets the model query that knowledge on-demand without loading the full skill into context.

### Typed API Surface

The `execute` tool dispatches to these methods on the server-side `skillport.*` proxy:

| Method | Args | Description |
|--------|------|-------------|
| `listSkills` | `{ surface?, refresh? }` | List all skills |
| `getSkill` | `{ name }` | Get skill details and SKILL.md |
| `installSkill` | `{ name, mode?: "skill"\|"package" }` | Get install payload |
| `checkUpdates` | `{ installed: [{ name, version }] }` | Check for updates |
| `saveSkill` | `{ name, files, commitMessage?, skillGroup?, metadata? }` | Save skill files |
| `deleteSkill` | `{ name, confirm: true }` | Delete a skill |
| `bumpVersion` | `{ name, type: "patch"\|"minor"\|"major" }` | Bump version |
| `publishSkill` | `{ name, description, category?, tags?, keywords? }` | Publish |
| `editSkill` | `{ name }` | Fetch skill files for editing |
| `whoami` | _(none)_ | Get your identity |
| `debugPlugins` | _(none)_ | Debug plugin listing |

Example calls:

```json
execute({ "method": "listSkills", "args": { "surface": "CC" } })
execute({ "method": "getSkill", "args": { "name": "my-skill" } })
execute({ "method": "whoami" })
```

No tokens. No curl. No headers. The server dispatches to the proxy and injects auth automatically.

### Authentication Flow

```
First MCP connection:
  Client ──► Skillport MCP Server
         ──► Google OAuth redirect (if no cached session)
         ──► User approves in browser
         ──► Server stores OAuth token server-side (KV, 24h TTL)
         ──► MCP connection established

Subsequent tool calls:
  execute({ method, args }) ──► Server retrieves stored OAuth token from KV
                             ──► Dispatches to skillport.* proxy method
                             ──► Proxy makes REST API calls with stored token
                             ──► Only return value enters context
```

**Key change from v1:** The model never sees, handles, or manages auth tokens. OAuth happens at connection time. The server manages token refresh internally. The 40% first-attempt failure rate from token juggling is eliminated.

### What Happens to the Skill

The v1 Skill has two layers:

| Layer | ~Lines | v2 Treatment |
|---|---|---|
| API usage instructions (curl templates, token handling, endpoint reference, error patterns) | ~275 (55%) | **Eliminated.** Replaced by typed API + execute tool. |
| Domain knowledge (authoring best practices, SKILL.md format, naming conventions, surface tags, progressive disclosure, testing methodology) | ~225 (45%) | **Moved to `search` index.** Queryable on-demand. |

#### What the `search` tool indexes

The domain knowledge currently in the Skill gets chunked and indexed server-side (in-memory keyword map, ~5KB corpus). The model queries it as needed via the standalone `search` tool:

```json
// Model needs to know SKILL.md frontmatter format
search({ "query": "SKILL.md frontmatter format required fields" })

// Model needs naming conventions
search({ "query": "skill naming conventions gerund form" })

// Model needs surface tag reference
search({ "query": "surface tags CC CD CAI meaning" })
```

This is progressive disclosure — the model loads domain knowledge only when the task requires it, instead of consuming ~225 lines of context on every Skillport interaction.

#### What stays client-side

Two things the model still needs to know without searching:

1. **Installed version gathering** — reading `.claude-plugin/plugin.json` from `~/.claude/skills/{name}/` is a local filesystem operation. The model needs to know this path convention to call `checkUpdates`. This is ~5 lines of knowledge.

2. **Post-install instructions** — "start a new conversation for Claude to see the installed skill." This is ~1 line.

These could live in the `execute` tool description or a minimal 10-line skill.

### Install Workflow

Installation is the most complex workflow because it involves client-side file operations. In v2:

```json
execute({ "method": "installSkill", "args": { "name": "my-skill", "mode": "skill" } })
// Returns: { type: "direct", name, version, installPath: "~/.claude/skills/my-skill/", files: [...] }
```

The execute tool returns the file contents and target path. The model then uses standard file tools (Write) to place them. This is simpler than the current shell-script-download approach and works across all surfaces.

**Alternative:** The server could return a self-contained install script that the model pipes to bash, similar to v1 but without the token complexity.

### What This Eliminates

| v1 Pain Point | v2 Resolution |
|---|---|
| 40% first-attempt failure on auth | OAuth at connection time, invisible to model |
| Three token types (sk_api_, sk_install_, sk_edit_) | No model-visible tokens at all |
| 15-min TTL requiring re-auth | Server manages token lifecycle internally |
| curl construction errors | Typed `skillport.*` API, no HTTP construction |
| Skill doc context load (~500 lines) | ~10 lines + on-demand search |
| Token variable parsing errors | No variables to parse |

### What This Preserves

- Google OAuth identity (same auth provider)
- All existing REST API endpoints (server-side, unchanged)
- Access control model (.skillport/access.json)
- Skill authoring knowledge (reindexed, not removed)
- Multi-surface support (CC, CD, CAI)
- Version management via bump API

### Resolved Questions

See [decisions.md](decisions.md) for full rationale on each.

1. **Dispatch mechanism:** Structured `{ method, args }` dispatch — no `new Function()` or Workers for Platforms needed ($0 extra cost).
2. **`search` implementation:** In-memory keyword map bundled in worker source (~5KB corpus).
3. **Install on non-CC surfaces:** Model detects its surface and passes `mode: "skill"` (CC) or `mode: "package"` (CAI/CD). Server returns appropriate format.
4. **Backward compatibility:** Versioned endpoints — `/mcp` stays v1, `/v2/mcp` serves v2. Both in same worker.
5. **Skillport skill:** Eliminated in v2. Bring back minimal (<20 lines) only if gaps appear.
6. **Surface detection:** Model-side only (tool name inspection). No dependency on Skillport MCP tools.

## Implementation Phases

### Phase 1: Core execute tool
- New `src/mcp-server-v2.ts` with `execute` tool
- New `src/skillport-proxy.ts` — typed `skillport.*` proxy wrapping existing REST handlers
- Route `/v2/mcp` in `src/index.ts`
- Structured `{ method, args }` dispatch — server-side method resolution, no eval
- OAuth at connection time (shared with v1)

### Phase 2: Search + domain knowledge ✅
- New `src/search-index.ts` — in-memory chunks with keyword matching (15 chunks, ~5KB)
- Add `search` tool to v2 MCP server
- Port domain knowledge from v1 Skill into search index

### Phase 3: Multi-surface install ✅
- `installSkill(name, { mode: "skill" | "package" })` — model passes mode
- `mode: "skill"` returns files array for direct Write (CC) — straightforward
- `mode: "package"` — server builds `.skill` zip via `fflate`, returns base64; model calls `present_files` to offer download
- Deprecate v1 token-based install flow

**Design: server-side `.skill` packaging.** A `.skill` file is a zip with a `.skill` extension (see Anthropic's `skill-creator` plugin — `package_skill.py`). The server already has all the files; it zips them and returns `{ filename: "{name}.skill", content: "<base64>" }`. The model's only job is to pass the blob to `present_files` — one tool call, no client-side packaging logic.

This matches the existing skill-creator workflow (init → edit → `package_skill.py` → present `.skill` to user) but moves the packaging server-side so it works on any surface with `present_files`.

**Open question:** Whether `present_files` accepts base64 binary from an MCP tool response is untested — that's a Claude.ai platform capability outside our control. Fallback: return a short-lived download URL instead of inline content. See [installation research](../research/skillport-installation-optimization-across-surfaces.md) for full surface analysis.

## References

- [Context Mode deep analysis checkpoint](../../../../claude-context-mode/docs/checkpoints/2026-02-28-1047-context-mode-deep-analysis.md)
- [v1 single-tool architecture](../working/single-tool-connector-plus-skill/README.md)
- [decisions.md](decisions.md) — resolved questions including eval rejection rationale
