# Checkpoint: Skill-Centric Architecture Implementation

**Date:** 2025-12-29 19:45:00
**Status:** IN PROGRESS
**Branch:** feat/official-structure

## Objective

Align Skillport with official Claude Code plugin marketplace structure while making skills (not plugins) the primary installable unit for end users.

## Changes Made

**Modified Files:**

- [src/github-client.ts](src/github-client.ts) - Added skill discovery (`listSkills`, `getSkill`, `parseSkillFrontmatter`), updated `fetchSkill` to lookup by skill name
- [src/mcp-server.ts](src/mcp-server.ts) - Added `list_skills` MCP tool, updated `fetch_skill` and `update_skill` to use skill lookup
- [docs/better-marketplace-compliance/skill-centric-architecture.md](docs/better-marketplace-compliance/skill-centric-architecture.md) - Design decisions doc
- [docs/better-marketplace-compliance/revert-and-correct-plan.md](docs/better-marketplace-compliance/revert-and-correct-plan.md) - Original planning doc

**Template repo changes (merged to main):**
- Moved skills from `skills/SKILL.md` to `skills/<skill-name>/SKILL.md`
- Cleaned up marketplace.json (removed `skillPath`, `permissions`, `_skillport`)

**Commits:**
- `e9032d8` docs: Add revert-and-correct plan for marketplace compliance
- `40c0443` feat: Implement skill-centric architecture
- `c561165` fix: Update plugin.json path to .claude-plugin/ per official structure

## Key Decisions

1. **Skills are the user-facing unit** - Users install individual skills, plugins are just containers
2. **Connector discovers skills dynamically** - Scans `plugins/*/skills/*/SKILL.md` pattern
3. **Skills inherit version from parent plugin** - No separate skill versioning
4. **Plugin tools retained** - `list_plugins`, `get_plugin`, `create_plugin` kept for skill editors/admins

## Open Issues

### Two User Personas, Different Needs

| Persona | Tools Used | Need |
|---------|-----------|------|
| **Skill Users** | `list_skills`, `fetch_skill` via skillport-manager | Find and install skills |
| **Skill Editors** | `create_plugin`, `save_skill`, `update_skill`, `bump_version` | Create and edit skills |

**Problem:** Creating a new skill requires awareness of the parent plugin (which might itself be new). Current tools assume plugin already exists.

**Questions to resolve:**
1. Should `create_skill` auto-create a plugin if needed?
2. Or require explicit `create_plugin` first, then `create_skill`?
3. How does this affect the skill-centric mental model?

### Commands/Agents/Hooks

Official plugin structure supports `commands/`, `agents/`, `hooks/` directories alongside `skills/`. Currently we only expose skills. Decision: Keep skill-only for V1, revisit later.

## Testing

- Connector deployed to production
- Template PR merged to main
- Awaiting MCP Inspector testing

## Next Steps

1. Test `list_skills` and `fetch_skill` in MCP Inspector
2. Create connector PR after testing
3. Resolve skill creation workflow for editors
4. Update skillport-manager skill for new directory structure

---

**Last Updated:** 2025-12-29 19:45:00
