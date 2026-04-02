# Alternative: Skillport Pivot (not retirement)

**Date:** 2026-04-01
**Status:** Under consideration

## The Pivot

Instead of retiring Skillport, evolve its purpose:

| | Old Skillport | New Skillport |
|---|---|---|
| **Purpose** | Bridge the gap where Anthropic had no native infrastructure | Management layer + packaging service the native system doesn't provide |
| **Core problem** | Cross-surface distribution | Marketplace maintenance + ready-to-install packaging |
| **Value** | Unique when built, now subsumed | Fills gaps nobody else has addressed |

## Why This Might Make Sense

### 1. Nobody has built marketplace management tooling

Every plugin marketplace in the ecosystem manually edits `marketplace.json`. The self-syncing
marketplace idea (plugin.json as source of truth, marketplace.json derived) is a genuine gap.
An MCP server that understands the marketplace structure and keeps it in sync is novel.

### 2. Package serving is already built

PR #30 added download URL delivery for `.skill` packages. This infrastructure exists and works.
Extending it to serve `.plugin` ZIPs is straightforward. This is exactly what Cowork and
Claude.ai need for installing custom plugins from a private repo.

### 3. The connector is already deployed

The Cloudflare Worker, OAuth, and GitHub integration are live. The question isn't "build vs not
build" — it's "retool what exists vs tear it down."

## What the New Skillport Would Do

### MCP Tools (lean set)

| Tool | Purpose |
|---|---|
| `sync_marketplace` | Regenerate marketplace.json from plugin.json files |
| `create_plugin` | Scaffold new plugin directory with plugin.json and SKILL.md |
| `bump_version` | Increment version in plugin.json (marketplace.json auto-syncs) |
| `package` | Generate .skill or .plugin ZIP, return download URL |
| `list_plugins` | List all plugins with versions, surface tags, change status |
| `validate` | Run consistency checks on marketplace structure |
| `install_guide` | Surface-specific installation instructions for a given plugin |

### Paired Skill

A skill that teaches Claude the marketplace structure and editing workflows:
- When to call which MCP tool
- How to create, edit, version, and publish plugins
- Surface-specific installation guidance (Claude Code vs Cowork vs Claude.ai)
- Version conventions and changelog practices

### What Gets Cut

| Current feature | Disposition |
|---|---|
| `list_skills` / `fetch_skill` | Simplified into `list_plugins` |
| `check_updates` / `install_skill` | Replaced by native marketplace auto-update (Claude Code) |
| `save_skill` / `publish_skill` | Replaced by `create_plugin` + `sync_marketplace` |
| `bump_version` | Kept, simplified |
| v2 `execute` dispatch layer | Simplified — fewer methods needed |
| v2 `search` index | Evaluate — may still be useful for skill discovery from non-Code surfaces |
| OAuth / user auth | Keep for multi-user scenarios, simplify for single-user |
| Surface detection | Remove — less relevant with native surface support |
| REST API endpoints | Evaluate — MCP tools may be sufficient |

## Per-Surface Value

| Surface | What Skillport provides | Native alternative |
|---|---|---|
| Claude Code | Marketplace sync, plugin scaffolding | Manual JSON editing, `claude plugin validate` |
| Cowork | Ready-to-install .plugin ZIPs, install guidance | Manual ZIP creation + upload |
| Claude.ai / Desktop Chat | Ready-to-install .skill ZIPs, install guidance | Manual ZIP creation + upload |
| All surfaces | Unified editing workflow via MCP | Nothing — each surface is independent |

## Architecture

```
Marketplace Repo (GitHub)
  ├── plugin.json files (source of truth)
  ├── marketplace.json (derived, kept in sync by Skillport)
  └── SKILL.md files

Skillport Connector (Cloudflare Worker)
  ├── MCP server with lean tool set
  ├── Package builder (.skill / .plugin ZIPs)
  ├── GitHub integration (read/write marketplace repo)
  └── OAuth (for multi-user / editor access)

Claude Code ──── native marketplace (auto-update from repo)
               └── Skillport MCP (for editing/management workflows)

Cowork ──────── official marketplace (account-level)
               └── Skillport MCP (for .plugin ZIPs + install guidance)

Claude.ai ───── native skill upload
               └── Skillport MCP (for .skill ZIPs + install guidance)
```

## What This Means for the Marketplace Repo

The self-syncing marketplace idea still applies, but the sync mechanism is Skillport's
`sync_marketplace` tool rather than a pre-commit hook. Both could coexist:

- **Pre-commit hook** — local safety net, ensures marketplace.json is always valid at commit time
- **Skillport MCP** — the interactive management layer, used during editing workflows

The repo structure stays the same. plugin.json remains the source of truth.

## Open Questions

1. **Is the Cloudflare Worker overhead justified?** The management tooling could be a local
   MCP server or even just scripts. The remote server is only needed for package serving
   (download URLs) and GitHub API access from non-Code surfaces.

2. **Does this need OAuth?** For a single-user personal marketplace, OAuth adds complexity.
   A simpler auth mechanism (API key, or even public read-only) might suffice.

3. **How lean can this get?** The current connector has significant code for the v1 API,
   v2 dispatch layer, search index, skill packager, etc. A clean rewrite focused on the
   new tool set might be simpler than refactoring.

4. **Is the paired skill enough without MCP?** Could a well-written skill + local scripts
   handle everything, with the Cloudflare Worker only serving packages? This would be the
   leanest option — skill for management, worker for distribution.

5. **Extend .skill packaging to .plugin ZIPs?** PR #30 already built server-side `.skill`
   packaging with download URL delivery (KV storage, 15-min TTL, UUID-gated). The
   `/v2/download/:id/:filename` endpoint serves packages without OAuth. Extending this to
   serve `.plugin` ZIPs (full plugin directories, not just skills) is straightforward and
   would cover Cowork's ZIP upload requirement.

## Comparison: Retire vs Pivot

| Factor | Retire | Pivot |
|---|---|---|
| Maintenance burden | Zero | Low (lean tool set, existing infra) |
| Marketplace management | Manual JSON + pre-commit hook | MCP-guided, automated |
| Cross-surface packaging | Manual ZIP creation per surface | Automated, download URL |
| Installation orchestration | Per-surface, manual | Guided, with surface-specific instructions |
| Novelty | None — just using native features | Self-syncing marketplace is genuinely new |
| Risk | None | Maintaining a niche tool that Anthropic could build natively |

## Existing v2 Infrastructure to Build On

PR #30 already implemented server-side package serving:
- `installSkill` builds `.skill` ZIP on the Cloudflare Worker
- Stores in KV (`skill-pkg:{uuid}`, 15-minute TTL)
- Returns `download_url` — client runs `curl` to fetch
- `/v2/download/:id/:filename` endpoint serves packages (no OAuth, UUID-gated)
- Tested end-to-end: Claude.ai sandbox downloads → `present_files` → user installs

This is the distribution mechanism. Extending to `.plugin` ZIPs (full plugin directories
with plugin.json, skills/, agents/, hooks/) is the natural next step.

## Decision Criteria

Pivot makes sense if:
- You actively manage the marketplace (frequent edits, version bumps)
- You want cross-surface packaging without manual steps
- The self-syncing marketplace has broader value (template, blog post, community tool)

Retire makes sense if:
- The marketplace is stable (infrequent changes)
- Manual ZIP creation is tolerable for the ~10 cross-surface plugins
- You'd rather invest time elsewhere
