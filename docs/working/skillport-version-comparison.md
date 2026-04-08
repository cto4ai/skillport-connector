# Skillport: Three Versions of Bridging Claude's Gaps

Skillport is a marketplace connector that lets organizations distribute Claude Code plugins and skills through private repositories. Over three architectural versions (Dec 2025 – Apr 2026), it evolved from a skill-dependent MCP server to a CLI-first tool — each version shaped by hard-won lessons about how Claude's surfaces actually work.

This document compares all three versions: what they did, how they did it, and which Claude limitations each one worked around.

---

## The Comparison at a Glance

| Dimension | V1 (Dec 2025) | V2 (Feb–Mar 2026) | V3 (Apr 2026) |
|-----------|---------------|---------------------|----------------|
| **Architecture** | MCP server (10 tools) + companion skill + REST API | MCP server (2 tools: execute + search) + REST API | CLI + thin MCP (auth + docs only) + REST API |
| **Requires a skill?** | Yes — a ~500-line Skillport skill must be installed | No — execute + search tools replace the skill | No — CLI replaces everything |
| **How the model works** | Reads skill instructions → constructs curl/Python calls → manages bearer tokens | Calls `execute({ method, args })` → server dispatches | Runs one CLI command → CLI handles everything |
| **File content through model** | Yes — model constructs curl commands with file payloads | Yes — MCP responses contain file contents as JSON | No — files flow disk → CLI → REST API → GitHub |
| **Token cost per interaction** | 3,000–5,000 tokens (10 tool defs) + skill load (~500 lines) | ~1,000 tokens (2 tool defs) + search results on demand | ~800 tokens (3 tool defs) + readme on first call |
| **Model turns per operation** | 6–10 (orchestrate curl, parse JSON, handle errors) | 2–3 (call execute, maybe search first) | 1 (run CLI command, read stdout) |
| **Auth model** | OAuth → short-lived bearer tokens (5-min TTL, 3 token types) | OAuth → automatic (server-side, transparent) | OAuth → pairing code (8-hour TTL, one code type) |
| **Unit of operation** | Skill-level (full skill folders, but one skill at a time) | Skill-level (full skill folders, but one skill at a time) | Skill-level + plugin-level (all V1/V2 skill capabilities, plus full plugin directories with multiple skills, commands, agents, hooks) |
| **Versioning** | Plugin-level version in plugin.json, uniform across all skills in a plugin (Anthropic marketplace format). Synthesized skill-level plugin.json included in downloads, enabling version upgrade detection on Claude.ai/Desktop. | Same | Same |
| **Claude.ai support** | Partial (connector works, but model must construct curl in sandbox) | Full (MCP dispatch works, but file content burns tokens) | Full (CLI with proxy-aware curl fallback) |
| **Claude Desktop support** | Partial (same limitations as Claude.ai) | Full (same as Claude.ai) | Full (MCP + CLI) |
| **Claude Code support** | Full (MCP + bash execution) | Full (MCP, fastest path) | Full (MCP + CLI, leanest path) |

---

## V1: The Skill-Dependent MCP Server

### Architecture

V1 was a Cloudflare Worker exposing **10 MCP tools** — `list_skills`, `fetch_skill`, `install_skill`, `save_skill`, `delete_skill`, `bump_version`, `publish_skill`, `check_updates`, `whoami`, and a bootstrap tool. These tools were always loaded into Claude's context regardless of whether the user invoked Skillport.

Because 10 tool definitions consumed 3,000–5,000 tokens on every message, V1 was quickly refactored to a **single-tool connector** (`skillport_auth`) paired with a **companion skill**. The MCP tool handled authentication only; the skill contained ~500 lines of instructions teaching Claude how to call the REST API via curl or Python.

### The Skill Dependency

The skill was V1's defining architectural choice — and its biggest constraint. It contained:

- **API usage instructions (~55%)**: curl templates, token handling, endpoint reference, error patterns
- **Domain knowledge (~45%)**: authoring best practices, SKILL.md format, naming conventions, surface tags

The model would read the skill on invocation, then orchestrate a multi-step workflow: get a bearer token, construct the right curl command, parse JSON responses, handle errors, manage token expiration. This worked, but it was fragile. The model would sometimes skip steps, hallucinate successful installations, or mangle bearer tokens across requests.

### The Bootstrap Problem

V1 had a chicken-and-egg problem: users needed the Skillport skill installed to use Skillport, but Skillport was how they installed skills. The solution was a `skillport_auth(operation="bootstrap")` call that returned instructions to download and install the skill — a workaround that added another failure mode to an already complex flow.

### Claude Gaps Filled

| Gap | How V1 Addressed It |
|-----|---------------------|
| **Private repo access** | Claude Code's native `/plugin marketplace add` cannot authenticate to private GitHub repos. V1's Worker proxied GitHub API calls using a service token, so users never needed direct repo access. |
| **Cross-surface skill distribution** | Claude.ai, Desktop, and Code each had different (or no) plugin installation mechanisms. V1 provided a single REST API that worked from any surface. |
| **Skill discovery** | No built-in way to browse available skills. V1's `list_skills` scanned the marketplace repo and returned structured results. |
| **Version tracking** | No native mechanism to check if installed skills were outdated. V1's `check_updates` compared local versions against the marketplace. |

### What Went Wrong

- **Context overhead**: 3,000–5,000 tokens loaded on every message, even when unused
- **Model orchestration failures**: ~40% first-attempt failure rate on complex operations (token management, curl construction, JSON parsing)
- **Skill as single point of failure**: If the model misread or skipped the skill instructions, the entire workflow broke
- **Surface-specific installation UX**: Claude Code could run bash natively; Claude.ai/Desktop users had to copy-paste commands from chat into a terminal

---

## V2: Structured Dispatch (Execute + Search)

### Architecture

V2 replaced V1's 10 tools and companion skill with **two MCP tools**: `execute` and `search`. This followed the **gworkspace-mcp pattern** — a single dispatch tool that accepts `{ method, args }` and routes server-side, paired with a search tool for on-demand domain knowledge.

The `execute` tool exposed 11 methods: `listSkills`, `getSkill`, `installSkill`, `saveSkill`, `deleteSkill`, `bumpVersion`, `publishSkill`, `editSkill`, `checkUpdates`, `whoami`, and `debugPlugins`. Auth was fully transparent — the server resolved the user from the MCP session, so the model never touched tokens.

The `search` tool replaced the skill's domain knowledge. A **Porter stemmer search index** (steps 1a–5b of the classical 1980 algorithm) indexed 16 manually-curated chunks covering authoring best practices, SKILL.md format, naming conventions, surface tags, and publishing workflows. The model could query on demand instead of loading everything upfront.

### How It Eliminated the Skill

V1's ~500-line skill was cleanly split:

| Content | V1 Location | V2 Location |
|---------|-------------|-------------|
| API usage (curl templates, token handling, endpoint reference) | Skill (~275 lines, 55%) | **Eliminated.** Replaced by typed `execute({ method, args })` dispatch. |
| Domain knowledge (authoring practices, formats, conventions) | Skill (~225 lines, 45%) | **Moved to `search` index.** Queryable on demand. |

No companion skill required. The model called `execute` for operations and `search` for guidance. Context cost dropped from 3,000–5,000 tokens to ~1,000 tokens (two tool definitions).

### .skill Packaging

V2 introduced server-side `.skill` ZIP packaging for cross-surface installation. The server bundled skill files into a ZIP (using the `fflate` library), stored it in KV with a 15-minute TTL, and returned a download URL. The model could then `curl` the URL and present the file to the user via `present_files` on Claude.ai/Desktop.

This solved the base64 corruption problem that plagued early attempts — long base64 strings embedded in `python3 -c` commands would get truncated by the model, breaking the ZIP structure.

### Claude Gaps Filled

V2 filled the same gaps as V1, plus:

| Gap | How V2 Addressed It |
|-----|---------------------|
| **Token-efficient operations** | Structured dispatch eliminated model-side curl construction. One tool call per operation instead of multi-step orchestration. |
| **On-demand knowledge** | Search index provided skill authoring guidance without loading everything upfront. Model queried when needed. |
| **Cross-surface packaging** | `.skill` ZIP files worked on Claude.ai (via `present_files`), Desktop, and Code — one format, all surfaces. |
| **Reliable installation** | Download URL approach eliminated base64 corruption. Model just runs `curl -sO <url>` instead of constructing inline payloads. |

### What Went Wrong

Despite being a major improvement, V2 hit a fundamental constraint: **all file content still flowed through the model as tokens**.

- **Installing a skill**: MCP returned file contents as JSON → model called Write tool per file (Claude Code) or embedded in `present_files` (Claude.ai). Every byte of skill content consumed model context.
- **Saving a skill**: Model read files from disk, then passed entire file contents as MCP `execute` arguments. A modest skill with 5 files could burn thousands of tokens just on file transit.
- **Scalability ceiling**: As plugins grew larger (multiple skills, commands, agents, hooks), the token cost of moving file content through the model became prohibitive.

Other issues:

- **Model hallucinations on Claude.ai**: The model would sometimes claim files were written when they weren't, confusing MCP success (server received the call) with local filesystem success (files actually exist)
- **Surface detection unreliable**: `client_info` from the MCP handshake was identical across Claude.ai, Desktop, and Cowork — the model had to detect its own surface by probing for tool names, an error-prone heuristic
- **Search index didn't scale**: 16 manually-curated chunks worked for V2's scope, but wouldn't scale as the marketplace grew

---

## V3: CLI-First

### Architecture

V3 is a fundamental rethinking. Instead of the MCP server doing the work and the model orchestrating, V3 introduced a **CLI** as the primary client. The MCP layer shrank to three tools that handle only authentication and documentation:

| MCP Tool | Purpose |
|----------|---------|
| `readme` | Returns full CLI usage guide (all 15 commands, workflows, tips) |
| `execute` | Two methods only: `auth.get_code` (issue pairing code) and `auth.whoami` (user identity) |
| `search` | CLI documentation — same Porter stemmer index, but content now covers CLI commands instead of MCP methods |

The CLI is a single bundled JavaScript file (~100KB), served from the Worker at `/cli/skillport.js`. The model downloads it with `curl`, then runs commands like `node skillport.js list --code ABC123`. Every remote command passes the pairing code from `auth.get_code`.

### The Key Insight: Files Never Touch the Model

V3's architecture enforces a clean separation:

```
Model context:  CLI stdout (status messages, formatted output)
CLI ↔ REST API: file contents, directory trees, ZIP packages
REST API ↔ GitHub: git operations, file reads/writes
```

When a user runs `get surface-detect`, the flow is:
1. Model runs `node skillport.js get surface-detect --code ABC123`
2. CLI calls `GET /api/plugins/surface-detect`
3. REST API fetches files from GitHub via service token
4. REST API returns file tree as JSON to CLI
5. CLI writes files to disk
6. CLI prints "Downloaded 3 files to ./surface-detect/"
7. Model sees only the status message

Zero tokens spent on file content. Zero chance of base64 corruption. Zero model orchestration of file I/O.

### Pairing Code Auth

V3 introduced a novel auth pattern to bridge MCP OAuth with CLI usage:

1. User connects to MCP endpoint → Google OAuth flow completes automatically
2. Model calls `execute({ method: "auth.get_code" })` → server generates random code, stores in KV with 8-hour TTL tied to authenticated user
3. Model passes code to every CLI command: `--code ABC123`
4. CLI sends code as `Authorization: Bearer ABC123` to REST API
5. REST API validates code against KV, resolves user identity

This solves the problem that the CLI runs in a sandbox (Claude.ai) or ephemeral shell (Desktop) with no browser access for OAuth. The MCP handles the browser-based OAuth; the code is the bridge.

### Proxy-Aware HTTP

Claude.ai runs in a sandboxed environment that routes all egress through an HTTPS proxy. Node.js's native `fetch` ignores the `https_proxy` environment variable — a well-known Node limitation. V3's CLI detects proxy environment variables and falls back to `curl` via `execFileSync`, which respects proxy configuration. This was the single hardest bug to diagnose across all three versions.

### Plugin-First Design

V1 and V2 operated at the **skill level** — full skill folder structures (SKILL.md plus supporting files), but one skill at a time within a plugin. V3 operates at the **plugin level** — full plugin directory trees containing multiple skills, commands, agents, hooks, MCP configs, and a `plugin.json` manifest.

- `list` shows plugins, with skill counts per plugin
- `info` shows plugin-level details (components, file list)
- `save` pushes an entire plugin directory atomically
- `get` downloads a skill's files (skill-level) or a full plugin (with `--format plugin`)
- Version lives in the plugin-level `plugin.json` — skill-level manifests are synthesized at download

This aligns with how Claude Code actually manages installed plugins: a `.claude-plugin/` directory is the unit of installation, not an individual file.

### CLI Distribution and Self-Updating

The CLI is distributed via the Worker itself — no npm, no package manager, no git clone. The Worker serves it from KV at `/cli/skillport.js`. Download time is ~746ms vs. ~5s for `npm install`.

On every invocation, the CLI checks `/cli/version`. If the server has a newer version, the CLI downloads the new bundle, overwrites itself, and re-execs with the original arguments. The user (and the model) never need to think about CLI updates.

### All 15 Commands

| Category | Command | Purpose |
|----------|---------|---------|
| **Browse** | `list [--surface]` | List all plugins in marketplace |
| | `info <name> [--skill]` | Plugin or skill details |
| | `updates --installed <json>` | Check for version updates |
| | `whoami` | Authenticated user identity |
| **Get** | `get <name>` | Download skill files to disk |
| | `get <name> --skill <skill>` | Download specific skill from multi-skill plugin |
| | `get <name> --skills-only` | Download only skill files (skip commands, agents, etc.) |
| | `get <name> --format plugin` | Download as .plugin ZIP |
| **Author** | `create <name>` | Scaffold new plugin |
| | `create --skill <name>` | Scaffold standalone skill |
| | `save <name> <bump>` | Push local files + bump version |
| | `save --skill <name> <bump>` | Push standalone skill |
| **Lifecycle** | `deactivate <name>` | Remove from marketplace listing |
| | `reactivate <name>` | Restore to marketplace |
| | `delete <name> --confirm` | Permanent deletion |
| | `sync [--dry-run]` | Regenerate marketplace.json from plugin.json files |

### Claude Gaps Filled

| Gap | How V3 Addresses It |
|-----|---------------------|
| **Private repo access** | Same as V1/V2 — Worker proxies GitHub via service token. Users authenticate to the connector, not to GitHub. |
| **Cross-surface plugin management** | CLI works identically on Claude.ai, Desktop, Code, and Cowork. No surface-specific code paths in the model. |
| **Zero-token file operations** | File content never enters model context. CLI handles all file I/O directly. |
| **Plugin lifecycle management** | Full create → save → publish → deactivate → reactivate → delete lifecycle, accessible from any surface. |
| **Marketplace synchronization** | `sync` regenerates marketplace.json from plugin.json files — single source of truth, no manual maintenance. |
| **Version management without git** | `save` bumps versions and pushes to GitHub without requiring git on the client. Works from Claude.ai sandboxes. |
| **Self-maintaining CLI** | Auto-updates on every run. No user intervention needed for CLI upgrades. |

---

## Evolution of Claude Gap Coverage by Surface

### Claude.ai

| Capability | Native Claude.ai | V1 | V2 | V3 |
|-----------|-------------------|----|----|-----|
| Browse private marketplace | No | Yes (via skill + curl) | Yes (via execute tool) | Yes (via CLI) |
| Install skill from private repo | No | Partial (copy-paste curl to terminal) | Yes (download URL + present_files) | Yes (CLI writes to disk) |
| Save/edit skills to marketplace | No | Partial (model constructs curl with file payloads) | Yes (model passes file contents through MCP) | Yes (CLI reads local files, zero model tokens) |
| Version management | No | Yes (via skill + curl) | Yes (via execute tool) | Yes (via CLI) |
| Full plugin operations | No | No (skill-level operations only) | No (skill-level operations only) | Yes (plugin-level operations) |
| Works in sandbox (proxy) | N/A | Fragile (curl worked, but model orchestration was unreliable) | Fragile (MCP worked, but file content through model was expensive) | Reliable (proxy-aware CLI with curl fallback) |

### Claude Desktop

| Capability | Native Desktop | V1 | V2 | V3 |
|-----------|----------------|----|----|-----|
| Browse private marketplace | No | Yes (via skill) | Yes (via execute tool) | Yes (via CLI) |
| Install from private repo | No | Partial (manual copy-paste) | Yes (.skill ZIP + present_files) | Yes (CLI writes to disk) |
| Manage skills in marketplace | No | Partial | Yes (via execute tool) | Yes (via CLI) |
| Full plugin operations | No | No | No | Yes |

### Claude Code

| Capability | Native Claude Code | V1 | V2 | V3 |
|-----------|-------------------|----|----|-----|
| Browse public marketplace | Yes (native) | Yes | Yes | Yes |
| Browse private marketplace | No | Yes | Yes | Yes |
| Install from private repo | No | Yes (bash + MCP tools) | Yes (execute tool + Write) | Yes (CLI) |
| Manage skills in marketplace | No | Yes (via skill + bash) | Yes (via execute tool) | Yes (via CLI) |
| Full plugin operations | Partial (install only) | No | No | Yes |
| Self-updating tools | No (manual reinstall) | No | No | Yes |

---

## Architecture Decisions That Shaped Each Version

### V1 → V2: "Stop making the model orchestrate"

V1 asked the model to be an HTTP client — construct URLs, manage tokens, parse JSON, handle errors. Models are unreliable HTTP clients. V2's structured dispatch (`execute({ method, args })`) moved orchestration server-side. The model declares intent; the server executes.

**The lesson**: Give models structured tools, not general-purpose instructions. A model calling `execute({ method: "listSkills" })` succeeds far more reliably than a model constructing `curl -H "Authorization: Bearer sk_api_..." https://...`.

### V2 → V3: "Stop pushing file content through the model"

V2 fixed orchestration but introduced a new problem: every file byte was a model token. Installing a 5-file skill meant the model received all file contents in the MCP response, then re-emitted them via Write tool calls. The model was a pass-through — adding no value, burning tokens, and introducing corruption risk.

**The lesson**: If the model doesn't need to reason about data, don't put it in the model's context. V3's CLI handles file I/O on a direct path (disk ↔ CLI ↔ REST API ↔ GitHub). The model only sees status messages.

### V1 → V3: "Stop depending on a skill to use the skill system"

V1's skill dependency created a bootstrap problem and a maintenance burden. Every change to the API required updating the skill's instructions. The skill was documentation masquerading as code.

**The lesson**: Skills should extend Claude's capabilities with domain expertise and specialized workflows. Using a skill as an API client wrapper is a misuse of the format. V3 moved the API client to a CLI and the domain knowledge to a search index.

### Across all versions: "Claude.ai is the hard surface"

Every version's hardest bugs were on Claude.ai:
- V1: Model would hallucinate successful file writes in the sandbox
- V2: Base64 corruption in `python3 -c` commands; `present_files` path confusion
- V3: Node.js `fetch` ignoring proxy environment variables

Claude.ai's sandboxed execution environment, proxy requirements, and limited filesystem access make it the most constrained surface. If it works on Claude.ai, it works everywhere.

---

## Token Economics

A concrete comparison of token cost for a common operation — "list all skills in the marketplace":

| Step | V1 Tokens | V2 Tokens | V3 Tokens |
|------|-----------|-----------|-----------|
| Tool definitions loaded | 3,000–5,000 (10 tools) | ~1,000 (2 tools) | ~800 (3 tools) |
| Skill/readme loaded | ~2,000 (full skill on invocation) | 0 (no skill) | ~1,500 (readme, first call only) |
| Auth step | ~200 (call skillport_auth, parse token) | 0 (automatic) | ~150 (call auth.get_code) |
| Operation | ~500 (construct curl, parse JSON) | ~300 (call execute) | ~100 (run CLI, read stdout) |
| Response processing | ~300 (model parses curl output) | ~200 (model reads MCP response) | ~100 (model reads CLI stdout) |
| **Total (first call)** | **~6,000–8,000** | **~1,500** | **~2,650** |
| **Total (subsequent)** | **~4,000–6,000** | **~1,500** | **~1,000** |

V3's first call is higher than V2 because of the readme load, but subsequent calls are cheaper because the CLI handles formatting and the model only sees concise stdout.

---

## The Constant: Private Repo Access

Across all three versions, the core gap that Skillport fills remains the same: **Claude cannot authenticate to private GitHub repositories for plugin/skill distribution.**

Claude Code's native marketplace (`/plugin marketplace add`) works only with public repos or repos the user has already cloned. There is no mechanism for organizational marketplace distribution where users don't need (or shouldn't have) direct GitHub access.

Skillport solves this with a server-side GitHub proxy pattern: the Worker holds service tokens, authenticates users via Google OAuth, and proxies GitHub API calls. Users interact with the marketplace through a familiar auth flow (Google sign-in) without ever touching GitHub credentials or repo URLs.

This gap has persisted from V1 through V3 and remains the primary reason Skillport exists.

---

## Summary

| | V1 | V2 | V3 |
|-|----|----|-----|
| **One-line summary** | MCP server + skill teaches model to be an HTTP client | MCP server with structured dispatch replaces skill | CLI does the work; MCP just authenticates |
| **Model's role** | Orchestrator (reads instructions, constructs requests, manages tokens) | Caller (declares intent via execute, server dispatches) | Launcher (runs CLI commands, reads stdout) |
| **File handling** | Through model (curl payloads) | Through model (MCP responses) | Never through model (disk ↔ CLI ↔ API) |
| **Skill dependency** | Required | None | None |
| **Unit of operation** | Skill-level | Skill-level | Skill-level + plugin-level |
| **First-attempt success rate** | ~60% | ~85% | ~95%+ |
| **Primary insight** | Models can call APIs if you teach them | Models work better with structured tools than instructions | Models work best when they don't do the work at all |
