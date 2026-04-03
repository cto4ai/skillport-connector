# Checkpoint: Skillport v3 Pivot Assessment

**Date:** 2026-04-03 18:56
**Status:** COMPLETED (assessment phase)
**Branch:** development

## Objective

Assess whether to retire or pivot Skillport given Anthropic's native plugin/skill
infrastructure. Arrived at a v3 proposal: CLI + thin MCP auth/knowledge layer.

## What We Did

1. **Research** — deep dive into native capabilities across all Claude surfaces
   (Claude Code, Cowork, Claude.ai, Desktop Chat, Mobile)
2. **Marketplace audit** — compared crafty-skillport-marketplace against native
   plugin marketplace spec, identified compliance issues
3. **Architecture exploration** — evolved from "retire" → "pivot" → CLI + MCP design
4. **Environment testing** — validated CLI installability on Claude.ai, Desktop, Cowork
   sandboxes (npm install, apt, curl to worker all work)
5. **v3 proposal** — documented in `docs/retirement-planning/pivot-v3.md`

## Key Decisions

- **Not retiring** — pivoting to v3
- **CLI as primary client** — direct file I/O, zero token overhead for file content
- **MCP shrinks to auth + knowledge** — OAuth front door, execute (4 auth methods),
  search (CLI documentation index)
- **Cloudflare Worker stays** — it's the auth provider, credential vault, GitHub proxy,
  package server, and CLI distributor
- **Full plugin support** — v3 manages complete plugins (skills + agents + hooks +
  commands + MCP/LSP configs), not just SKILL.md files
- **Self-syncing marketplace** — marketplace.json derived from plugin.json files

## Documents Created

- `docs/retirement-planning/assessment.md` — native vs Skillport capability comparison
- `docs/retirement-planning/migration-plan.md` — phased retirement plan (superseded by pivot)
- `docs/retirement-planning/marketplace-compliance.md` — crafty marketplace audit
- `docs/retirement-planning/self-syncing-marketplace.md` — marketplace.json as derived file
- `docs/retirement-planning/pivot-option.md` — initial pivot idea
- `docs/retirement-planning/pivot-v3.md` — **the v3 proposal** (CLI + MCP auth/knowledge)

## v3 Architecture Summary

```
Cloudflare Worker (backend)
├── OAuth provider (Google OAuth, MCP-standard)
├── Credential vault (KV) + account multiplexing
├── REST API (the real API, any client can call it)
├── Package server (.plugin/.skill ZIPs)
└── CLI distributor

MCP (thin layer)
├── execute: get_cli_token, account.connect/list/set_default
└── search: CLI docs, install instructions, workflow guidance

CLI (primary client)
├── All file I/O (install, package, scaffold, sync)
├── All remote operations (save, bump, publish) via REST API
└── Auth via MCP pairing code or direct OAuth
```

## Five Gaps v3 Fills

1. **Plugin marketplace management** — marketplace.json as derived file (novel)
2. **Direct remote repo operations** — auth + GitHub API without git
3. **Cross-surface packaging** — .plugin/.skill ZIPs programmatically
4. **Repo-based versioning outside CC** — git-backed versioning for all surfaces
5. **CLI support** — auth bootstrapping, distribution, pre-install documentation

## Next Steps

1. Design the CLI command set and REST API surface
2. Decide on CLI implementation language (TypeScript/Node for npm distribution?)
3. Slim down the MCP (remove v2's 11 execute methods, refocus search index)
4. Build the CLI
5. Test end-to-end on all surfaces

## Notes

- Forum discussion with Nik Patel validated the "one backend, multiple clients" pattern
  (FastAPI + CLI + MCP + UI all using same API)
- MCP OAuth bootstrapping CLI auth via pairing code is a novel pattern
- v1 had the right instinct (shell does file I/O) but wrong client (model-as-CLI)
- v2 made the API cleaner but broke file I/O by pulling everything through MCP
