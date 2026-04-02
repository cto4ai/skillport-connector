# Skillport Migration Plan

**Date:** 2026-04-01
**Context:** Max plan, multiple Macs, always-on Cowork setup planned

## Target Architecture

The marketplace repo becomes the single source of truth. Each surface pulls from it natively.

```
crafty-skillport-marketplace (GitHub repo)
  │
  ├── Claude Code (all Macs)
  │     └── /plugin marketplace add → auto-update at startup
  │
  ├── Cowork (all Macs)
  │     ├── Official marketplace at claude.com/plugins
  │     ├── Custom plugins via synced directory
  │     └── Plugin Create for ad-hoc plugins
  │
  └── Claude.ai / Desktop Chat
        └── Scheduled Cowork action → browser automation upload
```

### Cowork Plugin Access (Max Plan)

All paid Cowork users have full marketplace access:
- Browse and install from Anthropic's official plugin marketplace
- Upload custom plugin ZIPs
- Plugin Create tool for building plugins
- Same plugin format as Claude Code (cross-compatible)
- **Mount local directories** — Cowork can read/write to user-selected folders on the host

Only Team/Enterprise adds: private org marketplaces with admin controls.

Cowork can mount a selected local directory at session start, giving it read/write access
to the host filesystem. However, current limitations apply:
- **One directory per session** at creation time
- **Mid-session mounting removed** (~Feb 2026, [#25797](https://github.com/anthropics/claude-code/issues/25797))
- **Multiple directories** is an open feature request ([#25163](https://github.com/anthropics/claude-code/issues/25163))

For marketplace management, a dedicated Cowork session pointed at the marketplace repo
clone would have direct access. But this would be a single-purpose session.

### Sync Across Macs

| Surface | Sync mechanism | Frequency |
|---|---|---|
| Claude Code | GitHub marketplace + auto-update | Every startup |
| Cowork (official plugins) | Account-level marketplace | Automatic |
| Cowork (custom plugins) | Dedicated session mounting repo clone, or ZIP upload | On demand |
| Claude.ai / Desktop Chat | Account-level (automatic once uploaded) | On upload |

## Migration Steps

### Phase 1: Validate native marketplace (immediate)

1. Confirm marketplace repo works as Claude Code marketplace on all Macs
   - `/plugin marketplace add cto4ai/crafty-skillport-marketplace`
   - Verify auto-update pulls latest versions
2. Confirm all CC-tagged skills work without the connector

### Phase 2: Self-syncing marketplace

Convert the marketplace repo so `marketplace.json` is a derived file, not hand-edited.
See [self-syncing-marketplace.md](self-syncing-marketplace.md) for full design.

**Core change:** `plugin.json` becomes the single source of truth per plugin. Marketplace-specific
fields (`tags`, `category`, `keywords`) move into `plugin.json`. A sync script scans `plugins/*/`
and generates `marketplace.json`.

**Automation:** Pre-commit hook regenerates marketplace.json before every commit.

**What this replaces:** `skillport-repo-utils` version bumping and marketplace.json maintenance.
The existing `delete-skill.sh` and `copy-skill.sh` scripts may still be useful but become simpler
(delete the directory → pre-commit hook updates marketplace.json).

### Phase 3: Cross-surface upload automation (after Cowork always-on setup)

Build a scheduled Cowork action that:

1. Watches the marketplace repo (or synced copy) for version changes
2. Packages changed cross-surface skills as ZIPs
3. Uses browser automation (Playwright) to upload via Claude.ai Customize > Skills
4. Logs what was uploaded and when

This is the last piece — fully automated push to all surfaces from one source.

### Phase 4: Retire connector

1. Remove MCP connector from Claude.ai settings (all Macs)
2. Remove `skillport` bootstrap skill from marketplace repo
3. Consider removing `surface-detect` skill (evaluate if still useful)
4. Decommission Cloudflare Worker
5. Archive the `skillport-connector` repo (don't delete — it has useful history)

### Phase 5: Cowork custom plugin access

Official marketplace plugins are account-level and available on all Macs automatically.
This phase is for custom plugins from the marketplace repo.

**Current Cowork limitations (as of April 2026):**
- One local directory mounted per session, selected at creation time
- No mid-session mounting ([#25797](https://github.com/anthropics/claude-code/issues/25797))
- Multiple directories is an open feature request ([#25163](https://github.com/anthropics/claude-code/issues/25163))

**Options for custom plugin installation:**
1. **Dedicated Cowork session** — start a session pointed at the marketplace repo clone,
   install/update plugins from the local filesystem. Single-purpose session.
2. **ZIP upload** — package plugins as `.plugin` ZIPs, upload via Customize > Upload plugin.
   Works from any Cowork session regardless of mounted directory.
3. **Synced plugin storage** — if Cowork's local plugin storage directory can be identified
   and synced (iCloud Drive), installed plugins stay in sync across Macs automatically.

**Multi-Mac sync:** Each Mac clones the marketplace repo. Plugins installed via either
method are local per machine unless plugin storage is synced.

**Note:** These limitations are in flux. Anthropic is actively developing Cowork's
filesystem access model. Revisit when multi-directory support ships.

## Marketplace Repo Changes

### Skills to remove

| Skill | Reason |
|---|---|
| `skillport` | Bootstrap skill for the connector — no longer needed |
| `skillport-repo-utils` | Replaced by self-syncing marketplace (pre-commit hook + sync script) |
| `surface-detect` | Evaluate — may still be useful for adaptive skills |

### Skills unaffected

All other 20 skills continue working as-is. No changes needed.

## Current Skill Inventory

### CC-only (12 skills) — no migration needed

These already work natively as Claude Code marketplace plugins:

- acp, astro-scaffold, catchup, checkpoint, chat-transcript
- csv-analyzer, cto4ai-blog-tools, git-commit-generator
- linkedin-post-plain, named-entity-linking, skillport-repo-utils, twitter-thread

### Cross-surface (10 skills) — need upload to Claude.ai/Desktop

These need to be uploaded via native skill interface for non-Code surfaces:

- data-analyzer (CALL), soil-data-analyzer (CALL), word-pair-swap (CALL)
- json-formatter (CALL), proofread (CALL), obsidian (CALL)
- excalidraw (CALL), meeting-digest (CALL), surface-detect (CALL)
- day-prep (CDAI)

### Skillport infrastructure (2 skills) — retire

- skillport (CALL) — bootstrap skill for connector
- skillport-repo-utils (CC) — evolves, not retired

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Browser automation breaks on Claude.ai UI change | Medium | Low | Fix when it happens; manual upload as fallback |
| Cowork synced directory causes conflicts | Low | Medium | Test thoroughly; use file locking if needed |
| Missing a skill during migration | Low | Low | Inventory is documented above; verify post-migration |
| Losing connector history | None | N/A | Archive repo, don't delete |
