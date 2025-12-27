# Checkpoint: Simplify skillport-manager Install Workflow

**Date:** 2025-12-26 23:00:00
**Status:** PAUSED
**Branch:** main

## Objective

Simplify skillport-manager to remove `install_skill.py` and have Claude write files directly, matching Anthropic's skill-creator pattern.

## Context

While testing the data-analyzer skill installation in Claude.ai, the model "bailed out" of using `install_skill.py` (which requires piping JSON to stdin) and wrote the files directly instead. This is actually the correct behavior.

## Key Findings

1. **Anthropic's skill-creator has no install script** - only `init_skill.py` (creates empty template), `package_skill.py`, and `quick_validate.py`

2. **skill-creator pattern**: Claude writes files directly rather than using scripts to install pre-existing content

3. **Our install_skill.py is awkward**:
   - Requires constructing large JSON payloads
   - Piping through stdin is unwieldy for multi-file skills
   - Claude.ai naturally bypassed it

## Recommended Changes

Update skillport-manager SKILL.md to instruct Claude to:

1. Call `fetch_skill` to get the file list from marketplace
2. **Write each file directly** to the skills directory (no script needed)
3. Optionally use `package_skill.py` if user wants a `.skill` zip

**Files to modify in skillport-template:**
- `plugins/skillport-manager/skills/SKILL.md` - Update install workflow
- `plugins/skillport-manager/skills/scripts/install_skill.py` - Delete or deprecate

## Testing Done

- data-analyzer `fetch_skill` returns all 5 files correctly
- Claude.ai successfully installed skill by writing files directly
- This validates the simpler approach works

## Next Steps

1. Update skillport-manager SKILL.md with direct file-writing instructions
2. Remove or deprecate install_skill.py
3. Test the simplified workflow in Claude.ai
4. PR and merge to skillport-template

## Notes

Research sources:
- [anthropics/skills repository](https://github.com/anthropics/skills)
- [skill-creator SKILL.md](https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md)

## Additional Research: Claude Code Plugin Installation

**Question:** Can we learn from how Claude Code handles marketplace plugin installation?

**Finding:** Claude Code's source is **not open source** - the npm package `@anthropic-ai/claude-code` is distributed as compiled binary. The [github.com/anthropics/claude-code](https://github.com/anthropics/claude-code) repo contains only documentation and example plugins.

**How Claude Code handles plugins:**
- Plugins are **copied to a cache directory** (not used in-place)
- Only files within the plugin directory are copied
- Uses `${CLAUDE_PLUGIN_ROOT}` variable for path resolution
- Symlinks are followed during copying

**Key difference:**
- **Claude Code**: Has automated file copying to a known cache location
- **Claude.ai/Desktop**: No automated installer - Claude writes files directly

**Conclusion:** Our `fetch_skill` returns data in a similar format to what Claude Code uses internally. The difference is Claude.ai/Desktop lacks an automated installer, so Claude just writes files directly - which is the correct pattern we should embrace.

Additional sources:
- [Claude Code Plugin Marketplaces Docs](https://code.claude.com/docs/en/plugin-marketplaces)
- [Claude Code Plugins Blog](https://claude.com/blog/claude-code-plugins)

---

**Last Updated:** 2025-12-26 23:15:00
