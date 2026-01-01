# Phase 3: Update skillport-manager Skill

## Overview

Update the `skillport-manager` skill to use the new PTC-based installation flow while keeping backwards compatibility.

---

## Current SKILL.md

```markdown
## Install a Skill

1. **Fetch**: Call `Skillport Connector:fetch_skill` with the skill name.
2. **Write files directly**: Create the skill directory and write each file...
3. **Package**: Create the .skill zip file...
4. **Present**: Call `present_files` with the .skill path.
```

---

## Updated SKILL.md

```markdown
---
name: skillport-manager
description: >
  Manages Skills from Skillport marketplaces — browse available skills, install them
  efficiently, and check for updates. Activates when the user asks to list, browse,
  install, or update skills, or mentions "Skillport" in context of skills or plugins.
---

# Skillport Manager

## Prerequisites

The Skillport Connector must be enabled. Verify by checking if these tools exist:
- `Skillport Connector:list_skills`
- `Skillport Connector:fetch_skill`
- `Skillport Connector:get_install_token`

If unavailable, tell the user: "Please add the Skillport Connector in Settings > Connectors, then enable it via the 'Search and tools' menu."

## List Skills

Call `Skillport Connector:list_skills`. Present results as a brief list showing name, description, and version.

## Get Skill Details

Call `Skillport Connector:fetch_skill` with `name` parameter. Present the description, version, and author from the response.

## Install a Skill (Optimized)

This uses Programmatic Tool Calling for efficient installation.

### Step 1: Get Install Token

Call `Skillport Connector:get_install_token` with the skill name.

Response includes:
- `install_token`: Short-lived token for installation
- `skill`: Skill name
- `version`: Skill version  
- `command`: The install command to run

### Step 2: Run Install Script

**For Claude.ai / Claude Desktop:**
```bash
bash <(curl -sf https://skillport-connector.jack-ivers.workers.dev/install.sh) <token> --package
```

The script outputs a `SKILL_FILE=<path>` line. Extract that path.

**For Claude Code:**
```bash
bash <(curl -sf https://skillport-connector.jack-ivers.workers.dev/install.sh) <token>
```

### Step 3: Present Result

**For Claude.ai / Desktop:**
1. Call `present_files` with the .skill file path from the script output
2. Tell user: "Click 'Copy to your skills' to install. **Start a new conversation to use the skill.**"

**For Claude Code:**
Tell user: "Installed <skill> v<version>. **Start a new conversation to use the skill.**"

### Fallback: Traditional Install

If `get_install_token` fails or is unavailable, fall back to the traditional method:

1. Call `Skillport Connector:fetch_skill` with the skill name
2. Write each file to `<output-directory>/<skill-name>/`
3. Run `python scripts/package_skill.py <skill-directory>`
4. Call `present_files` with the .skill path

## Check for Updates

1. **Get installed versions**:
   ```bash
   python scripts/get_versions.py
   ```
   Run from this skill's directory. Returns JSON array of `{name, version}` objects.

2. **Check marketplace**: Call `Skillport Connector:check_updates` with the JSON output.

3. **Report**: Show which skills have updates available. Offer to install updates using the Install workflow above.

## Surface Detection

To determine which surface you're running on:

- **Claude Code**: The bash environment has `~/.claude/skills/` directory and no GUI for "Copy to your skills"
- **Claude.ai / Desktop**: Has GUI button for skill installation, needs `.skill` package

When in doubt, use `--package` flag to create the zip file.
```

---

## Changes Summary

| Section | Before | After |
|---------|--------|-------|
| Prerequisites | 2 tools | 3 tools (added `get_install_token`) |
| Install flow | fetch_skill → write files → package | get_install_token → bash script |
| Fallback | N/A | Falls back to original flow |
| Surface detection | Not mentioned | Explicit guidance |

---

## Version Bump

Update `plugin.json`:

```json
{
  "name": "skillport-manager",
  "version": "1.1.0",  // was 1.0.x
  "description": "Manages Skills from Skillport marketplaces with optimized PTC-based installation"
}
```

Also update `marketplace.json` in skillport-marketplace-template.

---

## Backwards Compatibility

The skill maintains backwards compatibility:

1. **Old connector without `get_install_token`**: Falls back to `fetch_skill` method
2. **Users with old skill version**: Still works, just slower
3. **No breaking changes**: All existing functionality preserved

---

## Testing Matrix

| Surface | Token Available | Expected Behavior |
|---------|-----------------|-------------------|
| Claude.ai | Yes | PTC install → .skill file |
| Claude.ai | No | Fallback to fetch_skill |
| Claude Desktop | Yes | PTC install → .skill file |
| Claude Desktop | No | Fallback to fetch_skill |
| Claude Code | Yes | PTC install → ~/.claude/skills/ |
| Claude Code | No | Fallback to fetch_skill |

---

## Files to Update

| File | Change |
|------|--------|
| `plugins/skillport-manager/skills/skillport-manager/SKILL.md` | New install flow |
| `plugins/skillport-manager/.claude-plugin/plugin.json` | Version bump to 1.1.0 |
| `.claude-plugin/marketplace.json` | Version bump |

---

## Publish Steps

1. Update files in skillport-marketplace-template repo
2. Commit with message: `feat(skillport-manager): add PTC-based installation for 99% token reduction`
3. Push to main
4. Bump version via Skillport Connector: `bump_version("skillport-manager", "minor")`
5. Publish: `publish_skill("skillport-manager", ...)`

---

## User Communication

### Changelog

```markdown
## skillport-manager v1.1.0

### New: Optimized Installation

Skill installation is now **10x faster** using Programmatic Tool Calling:
- Token usage reduced from ~11,000 to ~100 (99% reduction)
- Install time reduced from 2-5 minutes to 5-10 seconds

### How It Works

Instead of transferring all file contents through the conversation, the new flow:
1. Gets a short-lived install token
2. Runs a script that fetches files directly
3. Writes files at native speed

### Backwards Compatible

If your Skillport Connector hasn't been updated yet, installation automatically falls back to the previous method.
```

---

## Rollout Plan

1. **Deploy connector changes first** (Phase 1)
   - `get_install_token` tool available
   - `/api/install/:token` endpoint live
   - `/install.sh` served

2. **Test end-to-end** before updating skill
   - Manually run install flow on each surface
   - Verify token generation, redemption, file writing

3. **Update skillport-manager skill** (Phase 3)
   - Push to marketplace repo
   - Bump version
   - Publish

4. **Monitor**
   - Watch for fallback usage (indicates connector issues)
   - Track install success rate
   - Gather timing metrics if possible
