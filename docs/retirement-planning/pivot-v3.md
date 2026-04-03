# Skillport v3: CLI + Auth Backend

**Date:** 2026-04-02
**Status:** Proposed

---

## Section 1: Why v3 is better than v1 and v2

### The problem all three versions solve

A private plugin marketplace hosted on GitHub. Users need to browse, install, author,
version, and publish skills/plugins — across multiple Claude surfaces — with proper
authentication to a private repo.

A key constraint: Claude Code has git, but Claude.ai, Desktop Chat, and Cowork sandboxes
do not. Every version of Skillport bridges this gap by placing a server (Cloudflare Worker)
between the user and GitHub. The difference is how the client talks to that server — and
how file content moves between the server and the local filesystem.

### v1: MCP auth shim + Skill + curl

**Architecture:** One MCP tool (`skillport_auth`) issued a token. A large SKILL.md taught
the model how to curl the REST API. Shell scripts in the skill's `scripts/` directory
handled installation.

**What worked:**
- File I/O happened in the shell (curl → disk), not through MCP
- REST API was clean and any client could call it
- Auth was invisible to the user (MCP OAuth)

**What didn't:**
- The skill used progressive disclosure (description in context, full content on invocation),
  but once invoked, hundreds of lines of API usage instructions loaded — and in practice
  most operations required pulling in the full content because every endpoint had different
  auth handling, error patterns, and surface-specific logic.
- The model orchestrated every step: parse JSON, decide what to curl next, handle errors,
  write files, manage tokens. High token cost, high error surface.
- Model had to remember to store the token in a variable, use it correctly in headers,
  and re-auth when it expired
- Fragile: model could mangle curl commands, misparse responses, or write files to wrong paths

### v2: Structured MCP dispatch + Search index

**Architecture:** Two MCP tools: `execute` (typed method dispatch) and `search` (on-demand
knowledge index with Porter stemming). All operations went through MCP.

**What worked:**
- Clean typed API — `execute({ method: "installSkill", args: { name: "x" } })`
- Search index replaced the big skill — model pulled knowledge on demand
- Auth was completely invisible (OAuth at connection time, tokens managed server-side)
- Model never handled tokens

**What didn't:**
- **All file content flows through the model as tokens.** This is the fundamental problem.
  - `installSkill` (direct mode): MCP returns file contents as JSON text → model calls
    Write tool per file. Every byte of every file passes through context.
  - `saveSkill`: model passes entire file contents as string arguments in the MCP tool call.
  - `editSkill`: returns all file contents as text in the MCP response.
- PR #30 was a band-aid: server-side packaging with download URLs moved binary data out
  of MCP, but only for the package delivery case. Every other file operation still went
  through the model.
- The search index (22 chunks, Porter stemming) was solving a problem that `--help` solves
  natively for a CLI.
- Permission prompts for MCP tool calls added friction (even `mcp__*` wildcards don't
  fully suppress them).
- v2 was actually worse than v1 for file I/O: v1 used curl/shell (files flowed through
  the shell, not the model); v2 centralized everything into MCP and forced all file content
  through the model's context window.

### v3: CLI + MCP as auth + knowledge layer

**Architecture:** A CLI (`skillport`) that authenticates via the Cloudflare Worker and makes
REST API calls. The MCP layer provides: OAuth front door, credential multiplexing, token
handoff to CLI, and a search index that serves as the CLI's documentation layer.

**The plugin shift:** v1 and v2 managed skills — single SKILL.md files in "skill groups."
The Claude ecosystem has since standardized on plugins as the unit of distribution: a
directory tree containing skills, agents, hooks, commands, output styles, MCP server configs,
LSP configs, and scripts. v3 operates on full plugins:

```
plugin/
├── .claude-plugin/plugin.json    # manifest
├── skills/                       # SKILL.md files
├── agents/                       # subagent definitions
├── hooks/hooks.json              # lifecycle hooks
├── commands/                     # slash commands
├── output-styles/                # response customization
├── .mcp.json                     # MCP server configs
├── .lsp.json                     # LSP server configs
└── scripts/                      # utility scripts
```

This is also why the CLI matters more than it did for v1/v2. A skill was one markdown file —
MCP could transfer it (painfully, but it worked). A plugin is a directory tree with JSON
configs, markdown files, scripts, and hooks. Transferring that through MCP text responses
is untenable. A CLI writes the whole tree to disk in one command.

**The search index as skill-inside-MCP:**

v1 had a chicken-and-egg problem: you needed the Skillport skill installed to learn how to
use Skillport to install skills. v2 solved this with the search tool — knowledge available
the moment the MCP is connected, before anything is installed.

v3 keeps the search index but repurposes it: instead of teaching the model how to call MCP
methods, it teaches the model how to use the CLI. The search index replicates `--help`
content, install instructions, auth flow, and workflow guidance — all queryable before the
CLI is even installed.

| | Skill (v1) | Search index in MCP (v2, v3) |
|---|---|---|
| Where it lives | Filesystem (`.claude/skills/`) | Server-side, in the MCP |
| How model accesses it | Full content loaded on invocation | Queried on demand, only relevant chunks returned |
| Requires installation | Yes — skill must exist on the surface | No — available as soon as MCP is connected |
| Bootstrap problem | Need skill to learn how to install skills | No bootstrap — knowledge is already there |
| Cross-surface | Must be installed per surface | Available everywhere the MCP is connected |

The MCP's two tools in v3:

- **`execute`** — small set of auth methods: `get_cli_token`, `account.connect`,
  `account.list`, `account.set_default`. Extensible without adding tool definitions.
- **`search`** — CLI documentation, install instructions, auth flow, workflow guidance.
  The model's first call on encountering Skillport. Replaces both the v1 skill and
  the CLI's `--help` for surfaces where the CLI isn't installed yet.

**What's better than v1:**

| Problem in v1 | How v3 solves it |
|---|---|
| Skill loaded dense instructions on invocation | `skillport --help` — zero context cost, model reads on demand |
| Model orchestrates curl commands | CLI handles all HTTP calls internally |
| Model parses JSON responses | CLI parses and acts on responses |
| Model manages token lifecycle | CLI stores session token, re-auths automatically |
| Model writes files from curl output | CLI writes files directly to disk |
| Fragile: model can mangle commands | CLI is deterministic — same command, same result |
| Scripts in skill directory | Logic compiled into the CLI binary |

**What's better than v2:**

| Problem in v2 | How v3 solves it |
|---|---|
| File content flows through model as tokens | CLI writes directly to disk — zero tokens for file I/O |
| MCP permission prompts | Bash tool is already allowed — no extra prompts |
| Search index for model guidance | `--help` subcommands |
| Download URL band-aid for packages | CLI writes packages directly to filesystem |
| `saveSkill` passes file content as MCP args | CLI reads files from disk, POSTs to API |
| `editSkill` returns file content in MCP response | CLI fetches files, writes to disk, model edits locally |

**What's new in v3 (not in v1 or v2):**
- Operates on full plugins (skills + agents + hooks + commands + MCP/LSP configs), not just
  single SKILL.md files
- Brings repo-based version control to every surface — even sandboxes without git. The CLI
  talks to the worker, the worker talks to GitHub. `skillport bump`, `skillport log`,
  `skillport tag` work from Claude.ai, Desktop, Cowork — not just Claude Code.
- MCP search index serves as pre-install documentation for the CLI (skill-inside-MCP pattern)

**What's the same as v1 and v2:**
- Cloudflare Worker as backend (already deployed)
- Google OAuth as identity provider
- GitHub API for marketplace repo operations
- Credential multiplexing for multiple accounts (from gworkspace-mcp pattern)
- REST API endpoints (v1 already had these)

### Model interaction comparison

**v1 — installing a skill:**
```
Model: calls skillport_auth MCP tool → gets token
Model: constructs curl command with token in header
Model: runs curl to list skills → parses JSON output
Model: constructs another curl to get install info
Model: runs install script, handles errors
Model: writes files one by one
~6-10 model turns, hundreds of tokens on orchestration
```

**v2 — installing a skill:**
```
Model: calls execute({ method: "installSkill", args: { name: "x" } })
MCP: returns file contents as JSON (or download URL)
Model: writes files via Write tool (direct mode) or curls download URL (package mode)
~2-3 model turns, but file content burns tokens in MCP responses
```

**v3 — installing a plugin:**
```
Model: runs `skillport install my-plugin`
CLI: authenticates, calls API, writes full plugin directory to disk
stdout: "Installed my-plugin v1.2.0 to ~/.claude/skills/my-plugin/
         skills/2  agents/1  hooks/1  commands/0  mcp/0"
~1 model turn, zero tokens on file content, full plugin tree on disk
```

---

## Section 2: What gaps are we filling?

Anthropic's native plugin/skill infrastructure has matured dramatically. Claude Code has
plugin marketplaces with auto-update. Cowork has a full plugin mechanism. Claude.ai and
Desktop have skill upload/sharing. The original Skillport value — cross-surface distribution
where no native infrastructure existed — is largely subsumed.

So why build v3? Because native tooling has specific gaps that v3 fills. And critically,
v3 operates on **full plugins** — not just skills. v1 and v2 managed single SKILL.md files.
The ecosystem has moved to plugins (skills + agents + hooks + commands + MCP/LSP configs +
scripts), which are richer and harder to manage manually. Every gap below is amplified by
the complexity of managing multi-component plugins versus single-file skills.

### Gap 1: Private marketplace management

**The problem:** Every plugin marketplace in the Claude ecosystem maintains
`.claude-plugin/marketplace.json` by hand. Anthropic provides `claude plugin validate`
but no tooling to create, sync, or manage marketplace entries. Adding a plugin means
manually editing JSON in two files (plugin.json and marketplace.json), keeping versions
in sync, and hoping you don't drift.

**Existing solutions:** None that auto-generate marketplace.json.
[ivan-magda/claude-code-plugin-template](https://github.com/ivan-magda/claude-code-plugin-template)
has scaffolding + CI validation but marketplace.json is still manual.
[just-be.dev](https://just-be.dev/blog/why-i-built-a-claude-code-plugin-marketplace/)
built TypeScript validation/bump scripts but marketplace.json is still the source of truth.

**What v3 provides:**
- `skillport sync` — generate marketplace.json from plugin.json files (plugin.json is
  the single source of truth)
- `skillport create my-plugin` — scaffold the correct directory structure, create
  plugin.json, update marketplace.json
- `skillport bump my-plugin patch` — increment version in plugin.json (marketplace.json
  auto-syncs on next `skillport sync` or pre-commit hook)
- `skillport validate` — check consistency beyond what `claude plugin validate` covers

This is genuinely novel. Nobody has built the "marketplace.json as derived file" pattern.

### Gap 2: Authenticated remote repo operations without git

**The problem:** Native Claude Code marketplace support works great for consuming plugins
(auto-update, install, browse). But authoring — creating skills, editing files, bumping
versions, publishing — requires direct git operations: clone, edit, commit, push. On
surfaces without git (Claude.ai, Desktop Chat, Cowork sandboxes), authoring is impossible.

**What v3 provides:**
- `skillport save my-skill` — reads local files, commits to GitHub via API (no git needed)
- `skillport bump` — updates version on GitHub directly
- `skillport publish` — adds/updates marketplace.json entry on GitHub
- All authenticated through the Cloudflare Worker, which holds GitHub credentials

The model can author skills from any surface with a shell — even ephemeral sandboxes that
don't have git installed or configured.

### Gap 3: Cross-surface packaging

**The problem:** Native plugin distribution works within Claude Code (marketplace auto-update)
but not across surfaces. Installing a custom plugin in Cowork requires manually creating a
ZIP, navigating to the Customize UI, and uploading it. Installing a custom skill in Claude.ai
or Desktop Chat requires uploading via the Customize > Skills interface. There's no
programmatic path for either.

**What v3 provides:**
- `skillport package my-plugin` — builds a `.plugin` ZIP for Cowork upload
- `skillport package my-skill --format skill` — builds a `.skill` ZIP for Claude.ai / Desktop Chat
- The Cloudflare Worker can also serve packages via download URL (PR #30 infrastructure),
  for surfaces where local packaging isn't convenient

### Gap 4: No repo-based version control outside Claude Code

**The problem:** Claude Code has git, so plugins in a marketplace repo get versioning for
free — history, diffs, tags, rollback. Every other surface lacks this:

| Surface | Has git? | Version management |
|---|---|---|
| Claude Code | Yes | Git-based (if using a repo) |
| Claude.ai / Desktop Chat | No (ephemeral sandbox) | Upload overwrites, no version numbers, no history |
| Cowork | No (ephemeral VM) | Upload overwrites, no rollback |

This means:
- Skills on Claude.ai/Desktop have no version tracking at all — overwrite-only
- No changelog, no diff, no way to see what changed between updates
- No rollback on any non-CC surface
- Shared skills auto-update with no visibility into what changed

Even on Claude Code, version management is manual:
- Bump requires hand-editing JSON (plugin.json and marketplace.json, kept in sync)
- If you forget to bump, users silently miss the update (caching)
- No tooling to tag, changelog, or rollback

**What v3 provides:**

The Cloudflare Worker IS the git interface. The CLI talks to the worker, the worker talks
to GitHub. Every surface with a shell gets repo-based version control — even ephemeral
sandboxes that have never seen git.

- `skillport bump my-plugin patch|minor|major` — one command, plugin.json updated,
  marketplace.json auto-syncs via worker → GitHub API
- `skillport tag my-plugin` — create a git tag for the current version, enabling rollback
- `skillport log my-plugin` — version history from git, available from any surface
- Changelog generation from commit history between version tags
- Version is authoritative in plugin.json (single source of truth), flows to marketplace.json
  automatically, and is stamped into `.skill`/`.plugin` packages for Claude.ai/Desktop/Cowork

### Gap 5: Auth + knowledge bridge between MCP and CLI

**The problem:** MCP connectors provide seamless OAuth on Claude surfaces. CLIs need their
own auth flow. Running an OAuth flow from an ephemeral sandbox is awkward — there's no
browser to redirect to. And the model needs to know how to use the CLI before it's installed.

**What v3's MCP provides:**
- **OAuth front door** — Google OAuth handled natively by the MCP protocol. User connects
  once, auth is automatic thereafter.
- **`execute` tool** — small set of auth methods: `get_cli_token` (issues pairing code for
  CLI auth), `account.connect` / `account.list` / `account.set_default` (credential
  multiplexing for multiple GitHub accounts / marketplaces).
- **`search` tool** — CLI documentation as a queryable knowledge index. The model's first
  call on encountering Skillport. Returns CLI install instructions, command usage (mirrors
  `--help` content), auth flow walkthrough, and workflow guidance. Available before the CLI
  is installed — solves the v1 chicken-and-egg problem.
- **Pairing code flow** — MCP issues a short-lived code via `execute({ method: "get_cli_token" })`.
  Model runs `skillport auth --code ABC123` in the sandbox. No browser needed. Auth bootstraps
  from the MCP session to the CLI.

### Gap 6: CLI distribution from the same infrastructure

**The problem:** Ephemeral sandboxes (Claude.ai, Desktop Chat, Cowork) need to install the
CLI each session. This needs to be fast and the download source needs to be reachable.

**What v3 provides (proven by testing on 2026-04-02):**
- The Cloudflare Worker serves the CLI binary/package (same domain, already allowlisted)
- `npm install -g` works in all tested sandboxes (Claude.ai, Desktop Chat, Cowork)
- Worker domain (`skillport-connector.*.workers.dev`) is already in the user's domain
  allowlist for code execution sandboxes
- Install time: a lean CLI with minimal dependencies takes 2-5 seconds

**Test results from Claude.ai sandbox:**
- `npm install -g tldr` — 91 packages in 14 seconds (bloated package; lean CLI would be faster)
- `apt-get install jq` — works, Ubuntu repos accessible
- `curl https://skillport-connector.jack-48f.workers.dev/api/skills` — worker is reachable,
  returns proper 401 (auth required, not network blocked)

### What v3 does NOT try to do

- **Replace native marketplace auto-update** — Claude Code's built-in marketplace support
  is better for plugin consumption. v3 doesn't compete with that.
- **Replace native skill upload on Claude.ai/Desktop** — for one-off uploads, the native
  Customize UI is fine. v3 is for programmatic/automated workflows.
- **Be a cross-surface distribution bridge** — that was v1/v2's purpose and Anthropic has
  largely solved it. v3 fills management and authoring gaps instead.
- **Require the MCP for marketplace operations** — MCP handles auth, token handoff, and
  CLI documentation (via search). All actual marketplace operations (install, save, bump,
  package) go through the CLI. If a surface already has credentials (e.g., Claude Code
  with the CLI permanently installed and previously authenticated), the MCP is optional.

### Summary: is it worth the effort?

| Gap | How painful without v3 | How many people have this problem |
|---|---|---|
| Marketplace management | Manual JSON editing, dual-write, easy to drift | Everyone running a custom marketplace |
| Remote repo authoring | Impossible without git on the surface | Anyone authoring from Claude.ai/Cowork |
| Cross-surface packaging | Manual ZIP creation per surface per plugin | Anyone with cross-surface plugins |
| No repo-based versioning outside CC | Upload-and-overwrite, no history/rollback | Everyone shipping skills to non-CC surfaces |
| Auth + knowledge bridge (MCP → CLI) | No clean path for auth or pre-install docs | Novel |
| CLI distribution from worker | N/A (enables everything above) | N/A |

The marketplace management gap alone affects the entire Claude Code plugin ecosystem.
The auth bridge pattern (MCP OAuth bootstrapping CLI auth in ephemeral sandboxes) is novel
and potentially reusable beyond Skillport. The remote authoring gap is unique to private
marketplaces but real.

The effort is justified if v3 is built lean: a CLI (~500 lines), a thin MCP layer with
`execute` (auth methods) + `search` (CLI documentation index), and the existing Cloudflare
Worker REST API (already deployed). Most of the infrastructure exists. The new work is
the CLI and a slimmed-down MCP (replacing v2's 11 execute methods with ~4 auth methods,
and refocusing the search index from API usage to CLI usage).
