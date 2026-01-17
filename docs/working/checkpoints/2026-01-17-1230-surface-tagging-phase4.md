# Checkpoint: Surface Tagging - Phase 4 Blocked on Deploy

**Date:** 2026-01-17 12:30
**Status:** BLOCKED
**Branch:** development (+ feature/surface-tagging worktree)

## Objective

Implement surface tagging for skills so users can discover skills appropriate for their Claude surface (CC, CD, CAI), with filtering in list_skills API.

## Progress

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1 | Complete | Documentation in docs/working/skill-surface-tagging/ |
| Phase 2 | Complete | API changes in feature/surface-tagging branch |
| Phase 3 | Complete | Skillport skill updated to v1.3.0 with surface tag docs |
| Phase 4 | Blocked | Can't deploy - wrangler account ID caching issue |

## Changes Made

**development branch:**
- [docs/reference/anthropic-skill-formats.md](../../reference/anthropic-skill-formats.md) - Updated with complete official spec (plugin.json vs marketplace.json fields)

**feature/surface-tagging branch:**
- `src/github-client.ts` - Added `surface_tags` field, `extractSurfaceTags()`, `skillMatchesSurface()`, surface filter to `listSkills()`, changed `addToMarketplace()` to `upsertMarketplaceEntry()`
- `src/rest-api.ts` - Added `?surface=` query param, return `surface_tags`, updated `handlePublishSkill()` to use upsert

**crafty-skillport-marketplace (via API):**
- skillport skill v1.3.0 - Added surface tags section, detection guidance, filtering docs
- skillport authoring docs - Added surface tags (required) section for publish_skill

## Key Decisions

1. **Tags in marketplace.json only** - `tags` and `category` are marketplace-only fields per official spec, not plugin.json
2. **publish_skill upsert** - Changed to update existing entries instead of erroring, enables updating tags after initial publish
3. **Surface detection** - Tool availability is most reliable (Bash = CC, local MCPs = CD)

## Blocker

Wrangler caches account ID somewhere. When deploying from feature/surface-tagging worktree, it tries to hit TSIP account (48f68d729ce905...) even when logged into gmail account (4af1c4653be7ce...).

**Attempted fixes:**
- Logout/login multiple times
- Verified no account_id in wrangler.toml

**Potential solutions:**
- Clear node_modules/.cache in feature branch
- Deploy from development branch by copying changed files
- Check for .wrangler directory with cached state

## Skills to Tag (once deploy works)

| Skill | Surface |
|-------|---------|
| astro-scaffold, catchup, chat-transcript, checkpoint, csv-analyzer, git-commit-generator, linkedin-post-plain, named-entity-linking, skillport-repo-utils, twitter-thread | CC |
| data-analyzer, json-formatter, meeting-digest, obsidian, proofread, skillport, soil-data-analyzer, word-pair-swap | CALL |

## Next Steps

1. Fix wrangler account caching issue
2. Deploy feature/surface-tagging to Cloudflare
3. Test publish_skill upsert with one skill
4. Tag all 18 skills via API
5. Commit changes to development branch

## Files Reference

- Plan: `/Users/jackivers/.claude/plans/zany-sleeping-swing.md`
- Feature branch: `/Users/jackivers/Projects/skillport/skillport-connector/feature/surface-tagging/`
