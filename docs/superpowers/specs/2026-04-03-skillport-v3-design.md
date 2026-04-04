# Skillport v3 Design Spec

**Date:** 2026-04-03
**Status:** Approved
**Approach:** Incremental refactor (keep Worker running, modernize internals, add CLI alongside)
**TDD:** 100% Red Green — every feature gets a failing test before implementation

---

## 1. System Architecture

Three components with clear boundaries:

```
┌─────────────────────────────────────────────────────┐
│  Claude Surface (CC, Claude.ai, Cowork, Desktop)    │
│                                                      │
│  MCP Connection                                      │
│    • search: CLI docs (pre-install)                  │
│    • execute: auth.get_code / auth.whoami            │
│                        │                             │
│                        ▼ code                        │
│  CLI (bundled JS, runs in shell)                     │
│    • All file I/O (reads/writes disk directly)       │
│    • Commands: get, save, list, info, etc.           │
│    • Passes --code on every remote call              │
└────────────────────┬────────────────────────────────┘
                     │ HTTPS (code as Bearer token)
                     ▼
┌─────────────────────────────────────────────────────┐
│  Cloudflare Worker                                   │
│    • OAuth provider (Google OAuth, MCP-standard)     │
│    • REST API (all marketplace operations)           │
│    • GitHub proxy (authenticated via shared PATs)    │
│    • Package server (.plugin/.skill ZIPs)            │
│    • CLI distributor (bundled JS at /cli/skillport.js)│
│    • KV: auth codes, user identity                   │
└────────────────────┬────────────────────────────────┘
                     │ GitHub API (shared PATs)
                     ▼
┌─────────────────────────────────────────────────────┐
│  GitHub (Marketplace Repo)                           │
│    • Plugin directories (plugin.json, skills/, etc.) │
│    • marketplace.json (derived, synced by CLI/Worker)│
│    • .skillport/access.json (role-based access)      │
└─────────────────────────────────────────────────────┘
```

### Key Invariant

File content never passes through the model. The CLI reads files from disk and POSTs them to the REST API. The CLI GETs file content from the REST API and writes it to disk. The model sees only CLI stdout (status messages, confirmations, errors).

### Auth Flow

1. User connects MCP — Remote OAuth happens automatically (Google sign-in)
2. Model calls MCP `execute({ method: "auth.get_code" })` — Worker generates a code tied to the authenticated user, stores in KV with several-hour TTL, returns the code
3. Model runs CLI commands with the code: `skillport install foo --code ABC123`
4. CLI sends code to Worker REST API as Bearer token
5. Worker validates code against KV, resolves user identity, processes request

### Authorization

`.skillport/access.json` in the marketplace repo controls read/write permissions per user. Same as v1/v2. Editors listed by Google user ID. Per-skill overrides possible.

### GitHub Access

Single marketplace per deployment. Shared GitHub PATs (`GITHUB_SERVICE_TOKEN` for reads, `GITHUB_WRITE_TOKEN` for writes). Same as v1/v2.

---

## 2. CLI Command Surface

Every remote command takes `--code <CODE>`. Local-only commands don't.

### Get (fetch from marketplace)

Fetches plugin/skill from GitHub via Worker, writes locally. Two independent axes: **selection** (what to get) and **format** (how to deliver).

```
skillport get <plugin> --code <CODE>                                    # full plugin, unpacked
skillport get <plugin> --skill <skill> --code <CODE>                    # one skill, unpacked
skillport get <plugin> --skills-only --code <CODE>                      # all skills, unpacked standalone
skillport get <plugin> --format plugin --code <CODE>                    # full plugin as .plugin ZIP
skillport get <plugin> --skill <skill> --format skill --code <CODE>     # one skill as .skill ZIP
skillport get <plugin> --skills-only --format skill --code <CODE>       # all skills as individual .skill ZIPs
```

Note: `--format skill` without `--skill` or `--skills-only` is equivalent to `--skills-only --format skill` (all skills as individual .skill ZIPs). The CLI accepts both forms.

Invalid combinations (CLI rejects):
- `--skill <x> --format plugin` (a single skill isn't a plugin)
- `--skills-only --format plugin` (standalone skills aren't a plugin)

Output: writes to current directory.

### Save (push to marketplace)

Reads local files, bumps version, commits to GitHub, ensures marketplace.json entry. Always bumps — no partial saves.

```
skillport save <plugin> <patch|minor|major> --code <CODE>
skillport save <plugin> --skill <skill> <patch|minor|major> --code <CODE>
```

`save` only adds/updates files. It never deletes. If the version in a local `plugin.json` differs from the server-side version, `save` rejects with an error directing the user to let `save` handle versioning via the bump argument.

When saving a skill to a plugin that doesn't exist yet on GitHub, the Worker creates the plugin container (with a default plugin-level plugin.json) automatically.

### Browse/Read

```
skillport list [--surface <tag>] --code <CODE>
skillport info <plugin> --code <CODE>
skillport info <plugin> --skill <skill> --code <CODE>
skillport updates --installed <json> --code <CODE>
```

`updates` takes a JSON array of `{ name, version }` objects via `--installed`. The model constructs this from local `.claude-plugin/plugin.json` files. The CLI itself is stateless — it doesn't scan the filesystem for installed plugins.

### Lifecycle

```
skillport deactivate <plugin> --code <CODE>
skillport reactivate <plugin> --code <CODE>
skillport delete <plugin> --code <CODE>
skillport delete <plugin> --skill <skill> --code <CODE>
```

`deactivate` sets `"deactivated": true` in the plugin's plugin.json AND removes it from marketplace.json. This marker is load-bearing: `sync` checks it to exclude deactivated plugins when regenerating marketplace.json.

`reactivate` removes the `deactivated` flag and re-adds the plugin to marketplace.json.

`delete` (plugin-level) only works if the plugin is already deactivated. Removes files from GitHub.

`delete --skill` removes a skill folder from a plugin. No deactivation required (skills aren't in the marketplace index).

### Marketplace Management

```
skillport sync [--dry-run] --code <CODE>
```

Regenerates marketplace.json from all plugin.json files on GitHub. Skips plugins with `"deactivated": true`. `--dry-run` shows what would change without writing (the "validate" use case).

### Scaffold (local, no auth)

```
skillport create <name>
skillport create --skill <name>
```

`create <name>` scaffolds a new plugin directory in `./<name>/` with plugin.json, skills/, etc.

`create --skill <name>` scaffolds a skill directory in `./<name>/` with SKILL.md, .claude-plugin/plugin.json.

### Identity

```
skillport whoami --code <CODE>
```

### Help (no auth)

```
skillport --help
skillport <command> --help
skillport --version
```

### Total: 15 commands

get, save, list, info, updates, deactivate, reactivate, delete, sync, create, whoami, --help, --version.

---

## 3. Versioning Model

### Two levels of plugin.json

```
plugins/{plugin-name}/
├── .claude-plugin/
│   └── plugin.json              # plugin-level (required, has version)
├── skills/
│   ├── skill-a/
│   │   ├── .claude-plugin/
│   │   │   └── plugin.json      # skill-level (optional, own version)
│   │   └── SKILL.md
│   └── skill-b/
│       └── SKILL.md             # no skill-level plugin.json — inherits
```

### Rules

- Plugin-level plugin.json is always the version authority
- Skill-level plugin.json, when present, is kept in sync with the plugin-level version (same as v1/v2)
- `save` bumps both levels when the skill has its own plugin.json
- The skill-level plugin.json exists so that skills extracted for non-plugin surfaces (Claude.ai, Desktop Chat) carry their version with them. Without it, `updates` can't compare installed vs marketplace versions on those surfaces.
- Anthropic has no native skill versioning. This is Skillport's own mechanism.

---

## 4. MCP Layer (v3)

Two tools, gworkspace-mcp patterns. Single Durable Object binding.

### `execute` tool

Namespace-based dispatch (gworkspace-mcp pattern):

- `auth.get_code` — generate a long-lived code (several-hour TTL) tied to the authenticated MCP user, store in KV, return the code string
- `auth.whoami` — return user identity (email, name)

### `search` tool

Same architecture as gworkspace-mcp:
- Separate `search-chunks.ts` with all content
- `search-index.ts` with Porter stemmer, cached once per session
- Categories: `commands`, `workflows`, `format`, `best-practices`

Content covers:
- Getting started (install CLI, get code, first command)
- Every CLI command with usage, flags, examples (mirrors `--help`)
- Workflow guidance (common sequences: install, author and publish, update marketplace)
- Plugin structure reference
- Surface compatibility (which surfaces support plugins vs skills-only)

### Server instructions

Tells the model: call `search("getting started")` first, get a code via `execute({ method: "auth.get_code" })`, install the CLI, then use CLI for everything.

### What gets removed

- All 11 v2 execute dispatch methods (listSkills, installSkill, saveSkill, etc.)
- v1 MCP server class and endpoint
- v1 Durable Object binding
- `skillport-proxy.ts` (business logic stays in REST API handlers)

---

## 5. Worker REST API

The CLI talks to the Worker REST API for all remote operations. Existing endpoints are reused where possible, new ones added.

| CLI Command | REST Endpoint | Exists in v2? |
|-------------|--------------|---------------|
| `get` | `GET /api/plugins/:name` | Partially |
| `get --format` | `GET /api/plugins/:name/package` | Yes (PR #30) |
| `save` | `PUT /api/plugins/:name` | Yes |
| `list` | `GET /api/skills` | Yes |
| `info` | `GET /api/plugins/:name/info` | Partially |
| `updates` | `POST /api/updates` | Yes |
| `deactivate` | `POST /api/plugins/:name/deactivate` | No |
| `reactivate` | `POST /api/plugins/:name/reactivate` | No |
| `delete` plugin | `DELETE /api/plugins/:name` | Yes |
| `delete` skill | `DELETE /api/plugins/:name/skills/:skill` | No |
| `sync` | `POST /api/sync` | No |
| `whoami` | `GET /api/whoami` | Yes |

Auth: code sent as Bearer token in Authorization header. Worker validates against KV.

Existing endpoints need adjustments for plugin-level support and skill targeting but the bones are there.

---

## 6. Worker Refactoring

Refactor internals to gworkspace-mcp patterns.

### New structure

```
src/
├── index.ts                 # Entry point, OAuth provider, single v3 MCP route
├── mcp-server.ts            # McpAgent v3 (execute + search, 2 tools)
├── dispatch.ts              # Namespace dispatch (auth.*)
├── types.ts                 # Shared types (UserProps, MethodResult, etc.)
├── search-index.ts          # Porter stemmer (gworkspace-mcp pattern)
├── search-chunks.ts         # CLI documentation chunks (separate file)
├── auth.ts                  # auth.get_code, auth.whoami handlers
├── github-client.ts         # GitHub API client (refactored)
├── access-control.ts        # Keep as-is
├── rest-api.ts              # REST endpoints for CLI (extended)
├── skill-packager.ts        # ZIP packaging (keep)
├── google-handler.ts        # OAuth flow (keep)
cli/
├── src/
│   ├── index.ts             # Entry point, hand-rolled arg parsing
│   ├── commands/            # One file per command
│   │   ├── get.ts
│   │   ├── save.ts
│   │   ├── list.ts
│   │   ├── info.ts
│   │   ├── updates.ts
│   │   ├── deactivate.ts
│   │   ├── reactivate.ts
│   │   ├── delete.ts
│   │   ├── sync.ts
│   │   ├── create.ts
│   │   └── whoami.ts
│   ├── api-client.ts        # HTTP calls to Worker REST API
│   └── help.ts              # --help content (mirrors search chunks)
```

### Deleted

- `mcp-server-v2.ts` — replaced by new `mcp-server.ts`
- `mcp-server.ts` (old v1) — removed
- `skillport-proxy.ts` — business logic stays in `rest-api.ts`
- v1 Durable Object binding from wrangler config

### Refactored

- `rest-api.ts` — new endpoints, plugin-level support, gworkspace-style error helpers
- `github-client.ts` — `apiError()`/`apiSuccess()` helpers, standardized `MethodResult`
- `index.ts` — single v3 MCP endpoint, remove v1/v2 routes

---

## 7. CLI Distribution

### Build

- esbuild bundles `cli/src/index.ts` into a single `.js` file
- Target: Node (available in all tested sandboxes)
- No library dependencies — hand-rolled arg parsing, native fetch

### Serving

- Worker serves bundled JS at `GET /cli/skillport.js` (no auth)
- CLI bundle uploaded to KV during deploy, served from a Worker route
- Model instructs: `curl -sO https://<worker>/cli/skillport.js`
- Then: `node skillport.js install foo --code ABC123`
- Or with alias: `alias skillport='node skillport.js' && skillport install foo --code ABC123`

### Early Validation (critical)

First implementation task: build a hello-world CLI, bundle it, upload to KV, serve from Worker, download and run from a Claude.ai sandbox. Measure install time. This proves the distribution chain AND validates the speed advantage over `npm install`.

**If bundled JS download is not meaningfully faster than npm install, pivot to npm distribution.** The approach is only justified by speed.

### Versioning

- CLI version embedded at build time
- `skillport --version` prints it
- Future: pinned versions (`/cli/skillport@1.2.0.js`)

---

## 8. Testing Strategy

100% Red Green TDD. Every feature gets a failing test before implementation code.

### Test layers

| Layer | What | Framework | Mocking |
|-------|------|-----------|---------|
| CLI command parsing | Args → correct command + options | Vitest | None |
| CLI API client | HTTP request formation, response handling, errors | Vitest | Mock fetch |
| CLI file I/O | Writes correct directory structures, ZIPs | Vitest | Temp dirs |
| Worker dispatch | Namespace routing, error handling | Vitest | Mock KV |
| Worker REST API | Endpoint routing, auth validation, response format | Vitest | Mock GitHub client |
| Search index | Stemming, matching, ranking, caching | Vitest | None (pure logic) |
| Skill packager | ZIP creation, correct file structure | Vitest | Temp dirs |

### Not unit tested (manual/smoke)

- MCP auth flow (requires live Worker + Remote OAuth)
- End-to-end CLI → Worker → GitHub (requires deployed Worker)
- CLI distribution (curl from Worker, run in sandbox)
- Claude Code can smoke-test the live MCP once deployed

### Test organization

```
cli/src/__tests__/        # CLI unit tests
src/__tests__/            # Worker unit tests
```

### TDD cycle

1. Write failing test (Red)
2. Implement minimal code to pass (Green)
3. Refactor (clean up, no new behavior)
4. Repeat

---

## 9. Build & Deploy Pipeline

### Scripts

- `npm run test` — vitest (all tests)
- `npm run build:cli` — esbuild bundles CLI → `dist/skillport.js`
- `npm run deploy` — upload CLI to KV + deploy Worker

### Deploy sequence

1. `npm run test` — all tests pass
2. `npm run build:cli` — bundle the CLI
3. Upload CLI bundle to KV
4. `npm run deploy` — deploy Worker

---

## 10. Future Considerations (not built, not designed against)

1. **Plugin dependency placeholders** — Cowork's Knowledge Work pattern where a plugin declares a capability need (e.g., "mail") satisfied by different providers. v3's plugin.json handling won't break if new fields appear.

2. **Multi-marketplace support** — multiple GitHub repos per deployment. GitHub client accepts credentials as parameters, so per-marketplace credentials in KV is a future refactor.

3. **`account.*` MCP namespace** — multi-account multiplexing (gworkspace-mcp pattern). Namespace dispatch is additive.

4. **CLI auto-update** — pinned versions, update checks. For now, `/cli/skillport.js` is always latest.

---

## 11. CLAUDE.md Corrections

Fix the inaccurate statement in CLAUDE.md:
> "Claude Code cannot directly call MCP tools in this project because they require Google OAuth authentication."

Replace with: MCP Inspector + wrangler dev + Remote OAuth has been unreliable. Testing MCP tools against the live deployed Worker works. Claude Code can smoke-test the MCP once deployed.
