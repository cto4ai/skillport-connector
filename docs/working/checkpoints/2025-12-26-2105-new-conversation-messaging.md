# Checkpoint: New Conversation Requirement Messaging

**Date:** 2025-12-26 21:05:27
**Status:** COMPLETED
**Branch:** main

## Objective

Add messaging to inform users they must start a new conversation after installing a skill.

## Changes Made

**skillport-connector:**

- [src/mcp-server.ts](../../src/mcp-server.ts) - Added IMPORTANT message to `fetch_skill` instructions about conversation-scoped skills

**skillport-template:**

- `plugins/skillport-manager/skills/SKILL.md` - Updated Present step with "Start a new conversation" reminder

**PRs Merged:**

- skillport-connector PR #5: New conversation requirement messaging
- skillport-template PR #3: New conversation requirement in install message

**Commits:**

- `6230981` - Merge PR #5
- `fe5cc3a` - Merge PR #3 (skillport-template)

## Testing

- Connector deployed with `wrangler deploy`
- Version: `ba33e37b-8b54-4e4f-9d68-b42918270dd5`

## Open Issue: Skill Versioning

**Problem:** The `check_updates` tool compares versions, but SKILL.md files don't have a `version` field in their frontmatter.

Currently:
- `plugin.json` has version
- `marketplace.json` has version
- SKILL.md frontmatter only has `name` and `description`

When skills are installed on Claude.ai/Desktop, only SKILL.md is copied. Without version in SKILL.md, the skillport-manager can't extract installed versions to compare against marketplace versions.

**Fix needed:** Add `version` field to SKILL.md frontmatter in skillport-template:
```yaml
---
name: skillport-manager
version: 1.0.0
description: >
  ...
---
```

## Next Steps

1. Add version to SKILL.md frontmatter for all skills in skillport-template
2. Update skillport-manager instructions to parse version from frontmatter
3. Test check_updates flow end-to-end

---

**Last Updated:** 2025-12-26 21:05:27
