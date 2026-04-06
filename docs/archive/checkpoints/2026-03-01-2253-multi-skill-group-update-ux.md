# Checkpoint: Multi-skill Group Update UX Issue

**Date:** 2026-03-01 22:53
**Status:** PAUSED
**Branch:** fix/checking-updates-builtin-warning (PR #32)

## Objective

Document a latent UX issue: when a skill group name differs from the skill name, `checkUpdates` returns the group name in the response, but `installSkill` expects the skill name. The model gets confused trying to install with the wrong name.

## Context

The check-updates → install flow works correctly when skill name == group name (the convention for all real skills). The issue only surfaces with `validating-json-schemas` in group `v2-test-skills` — a test fixture we created with a deliberately mismatched name.

### How the flow works today

1. Model reads `~/.claude/skills/{name}/.claude-plugin/plugin.json` — `name` field is the **group name**
2. Model calls `checkUpdates({ installed: [{ name: "v2-test-skills", version: "1.0.1" }] })`
3. `checkUpdates` matches against `marketplace.plugins` using group names — works fine
4. Response: `{ name: "v2-test-skills", installedVersion: "1.0.1", availableVersion: "1.0.3" }`
5. Model calls `installSkill({ name: "v2-test-skills" })` — **fails** because `installSkill` looks up by skill name
6. Model recovers by calling `listSkills` to find the actual skill name

### Why this worked in v1

The original Skillport had a convention: one skill per group, same name. `plugin.json` has group name, skill has same name, everything matches. No real skill in the marketplace has a mismatched name.

### Approaches considered (and reverted)

1. **Add `skills` array to `checkUpdates` response** — lists actual skill names for `installSkill`. Rejected: adds complexity and requires the model to understand "use this field not that field."
2. **Make `installSkill` resolve group names** — breaks for multi-skill groups (which skill to install?).
3. **Return one entry per skill instead of per group** — accept group names in, return skill names out. Cleanest approach but not yet implemented.

## Key Decision

Multi-skill groups ARE fully supported (since PR #12). The 1:1 name convention is just a convention, not a constraint. This issue will surface for real when someone creates a multi-skill group.

## Next Steps

1. For now: the model recovers (it calls `listSkills` to resolve the name). Not broken, just clunky.
2. Future fix: have `checkUpdates` return skill-level entries instead of group-level entries. This makes the response directly actionable for `installSkill`.
3. Consider whether `plugin.json` should also list individual skill names, not just the group name.

## Notes

- No code changes needed now — this is a future improvement
- The `v2-test-skills` test fixture is the only case where this matters today
- All real marketplace skills follow the name==group convention
