# Checkpoint: Plugin Metadata and Published Flag

**Date:** 2026-01-11 22:02:07
**Status:** COMPLETED
**Branch:** development

## Objective

Add plugin_metadata support to save_skill API, improve install script error handling, and add published flag to skill entries so unpublished skills can be retrieved/published.

## Changes Made

**Modified Files:**

- [src/rest-api.ts](../../src/rest-api.ts) - Added plugin_metadata handling, published field in responses, improved error handling
- [src/github-client.ts](../../src/github-client.ts) - Added published field to SkillEntry, removed filter for unpublished skills
- [src/index.ts](../../src/index.ts) - Added retry logic with exponential backoff, improved error extraction in install/edit scripts
- [CLAUDE.md](../../CLAUDE.md) - Clarified branching model (development is base, PRs target development)

**Commits:**

- `54115a3` feat: plugin_metadata support, error handling, and published flag (#24)
- Cherry-picked to main: `65aa4dc`, `d18b052`, `75ff2e0`

## Key Fixes

1. **Plugin Metadata**: `save_skill` now accepts `plugin_metadata.description` (required for new plugins)
2. **Error Handling**: Install scripts retry 3x with exponential backoff, extract both error+message fields
3. **Published Flag**: Skills now include `published: boolean` instead of filtering - fixes getSkill/publish_skill for unpublished skills
4. **PR Review Fixes**: Separated JSON parse from file fetch, added logging, specific Python exceptions

## Testing

- Created/deleted test skills (test2-new-skill, test2-new-skill-2)
- Verified publish_skill works for unpublished skills
- Tested from Claude Desktop and Claude.ai
- Ran PR reviewer, addressed all critical/important issues

## Related Updates

**skillport-connector:**
- PR #24 merged to development
- Cherry-picked to main (3 commits)

**skillport skill (v1.2.9):**
- Fixed install instructions (--skill flag for Claude Code)
- Clarified save vs publish workflow
- Updated in crafty-skillport-marketplace via API

**skillport-marketplace:**
- main: Updated skillport to v1.2.9
- development: Updated skillport v1.2.9, skillport-repo-utils v1.1.0, removed obsolete skillport-manager and skillport-code-manager

**crafty-skillport-marketplace:**
- Deleted test skills and skillport-code-manager

## Notes

- skillport-marketplace branches intentionally diverged: main is clean template, development has more plugins
- READMEs are identical across branches, no merge needed

---

**Last Updated:** 2026-01-11 22:02:07
