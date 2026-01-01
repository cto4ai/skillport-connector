# Phase 2: Skills Update

## Overview

Two skills, one per surface type:

| Skill | Surface | Output |
|-------|---------|--------|
| `skillport-manager` | Claude.ai / Claude Desktop | `.skill` zip file |
| `skillport-code-manager` | Claude Code | Files in `~/.claude/skills/` |

Both use the same connector tools and install script, just with different flags.

---

## 1. skillport-manager (Claude.ai / Desktop)

### Updated SKILL.md

```markdown
---
name: skillport-manager
description: >
  Manages Skills from Skillport marketplaces — browse available skills, install them
  efficiently, and check for updates. For Claude.ai and Claude Desktop.
---

# Skillport Manager

## Prerequisites

The Skillport Connector must be enabled. Verify by checking if these tools exist:
- `Skillport Connector:list_skills`
- `Skillport Connector:install_skill`

If unavailable, tell the user: "Please add the Skillport Connector in Settings > Connectors, then enable it via the 'Search and tools' menu."

## List Skills

Call `Skillport Connector:list_skills`. Present results as a brief list showing name, description, and version.

## Get Skill Details

Call `Skillport Connector:fetch_skill_details` with `name` parameter. This returns the SKILL.md content which describes capabilities, usage, and examples.

## Install a Skill

### Step 1: Get Install Token

Call `Skillport Connector:install_skill` with the skill name.

Response:
- `install_token`: Short-lived token
- `skill`: Skill name
- `version`: Skill version
- `command`: Base command (ignore this, use step 2)

### Step 2: Run Install Script

```bash
bash <(curl -sf https://skillport-connector.jack-ivers.workers.dev/install.sh) <token> --package
```

The `--package` flag creates a `.skill` zip file.

### Step 3: Present Result

The script outputs `SKILL_FILE=<path>` on the last line. Extract that path.

Call `present_files` with the .skill file path.

Tell user: "Click 'Copy to your skills' to install. **Start a new conversation to use the skill.**"

## Check for Updates

1. **Get installed versions**:
   ```bash
   python scripts/get_versions.py
   ```
   Returns JSON array of `{name, version}` objects.

2. **Check marketplace**: Call `Skillport Connector:check_updates` with the JSON output.

3. **Report**: Show which skills have updates. Offer to install updates.
```

### Directory Structure

```
plugins/skillport-manager/
├── .claude-plugin/
│   └── plugin.json
└── skills/
    └── skillport-manager/
        ├── SKILL.md
        └── scripts/
            └── get_versions.py
```

Note: `package_skill.py` removed - install script handles packaging now.

### plugin.json

```json
{
  "name": "skillport-manager",
  "version": "2.0.0",
  "description": "Manages Skills from Skillport marketplaces for Claude.ai and Claude Desktop"
}
```

---

## 2. skillport-code-manager (Claude Code) - NEW

### SKILL.md

```markdown
---
name: skillport-code-manager
description: >
  Manages Skills from Skillport marketplaces — browse available skills, install them
  efficiently, and check for updates. For Claude Code.
---

# Skillport Code Manager

## Prerequisites

The Skillport Connector must be added as a remote MCP server:

```bash
claude mcp add --transport http skillport https://skillport-connector.jack-ivers.workers.dev/sse --scope user
```

Verify by checking if these tools exist:
- `skillport:list_skills`
- `skillport:install_skill`

## List Skills

Call `skillport:list_skills`. Present results as a brief list showing name, description, and version.

## Get Skill Details

Call `skillport:fetch_skill_details` with `name` parameter. This returns the SKILL.md content which describes capabilities, usage, and examples.

## Install a Skill

### Step 1: Get Install Token

Call `skillport:install_skill` with the skill name.

Response:
- `install_token`: Short-lived token
- `skill`: Skill name  
- `version`: Skill version
- `command`: Base command (ignore this, use step 2)

### Step 2: Run Install Script

```bash
bash <(curl -sf https://skillport-connector.jack-ivers.workers.dev/install.sh) <token>
```

No `--package` flag - writes directly to `~/.claude/skills/`.

### Step 3: Report Success

Tell user: "Installed <skill> v<version> to ~/.claude/skills/. **Start a new Claude Code conversation to use this skill.**"

## Check for Updates

1. **List installed skills**:
   ```bash
   ls ~/.claude/skills/
   ```

2. **Get versions** from each skill's plugin.json or SKILL.md frontmatter.

3. **Check marketplace**: Call `skillport:check_updates` with installed versions.

4. **Report**: Show which skills have updates. Offer to install updates.
```

### Directory Structure

```
plugins/skillport-code-manager/
├── .claude-plugin/
│   └── plugin.json
└── skills/
    └── skillport-code-manager/
        └── SKILL.md
```

### plugin.json

```json
{
  "name": "skillport-code-manager",
  "version": "1.0.0",
  "description": "Manages Skills from Skillport marketplaces for Claude Code"
}
```

---

## 3. Key Differences

| Aspect | skillport-manager | skillport-code-manager |
|--------|-------------------|------------------------|
| Surface | Claude.ai / Desktop | Claude Code |
| Install flag | `--package` | (none) |
| Output | `.skill` zip file | `~/.claude/skills/<name>/` |
| Final step | `present_files` + user clicks | User restarts Claude Code |
| Tool prefix | `Skillport Connector:` | `skillport:` |
| Scripts included | `get_versions.py` | None |

---

## 4. Marketplace Entry

Update `.claude-plugin/marketplace.json`:

```json
{
  "name": "skillport-marketplace",
  "plugins": [
    {
      "name": "skillport-manager",
      "source": "./plugins/skillport-manager",
      "version": "2.0.0",
      "category": "productivity",
      "description": "Skill management for Claude.ai and Claude Desktop"
    },
    {
      "name": "skillport-code-manager", 
      "source": "./plugins/skillport-code-manager",
      "version": "1.0.0",
      "category": "productivity",
      "description": "Skill management for Claude Code"
    }
  ]
}
```

---

## 5. Bootstrap Flow

Both skills can bootstrap themselves:

**Claude.ai / Desktop:**
```
User: "install skillport-manager from skillport"
Claude: [calls install_skill("skillport-manager")]
Claude: [runs bash script with --package]
Claude: [presents .skill file]
User: clicks "Copy to your skills"
```

**Claude Code:**
```
User: "install skillport-code-manager from skillport"
Claude: [calls install_skill("skillport-code-manager")]
Claude: [runs bash script without flag]
Claude: "Installed. Restart Claude Code."
```

No chicken-and-egg problem - the connector tools work without any skill installed.

---

## 6. Migration from v1

For users with skillport-manager v1.x:

1. Old skill still works (connector still has tools)
2. New install is faster
3. No action required - they can update when convenient

Changelog message:
```
## skillport-manager v2.0.0

### Breaking: Optimized Installation

Installation now uses Programmatic Tool Calling:
- 99% fewer tokens (~11k → ~100)
- 10x faster (2-5 min → 5-10 sec)

### New: Separate skill for Claude Code

Claude Code users should install `skillport-code-manager` instead.
```

---

## 7. Testing Matrix

| Test | Surface | Expected |
|------|---------|----------|
| Bootstrap skillport-manager | Claude.ai | .skill file presented |
| Bootstrap skillport-manager | Desktop | .skill file presented |
| Bootstrap skillport-code-manager | Claude Code | Files in ~/.claude/skills/ |
| Install another skill via manager | Claude.ai | .skill file presented |
| Install another skill via manager | Desktop | .skill file presented |
| Install another skill via code-manager | Claude Code | Files in ~/.claude/skills/ |
| list_skills | All | Returns skill list |
| fetch_skill | All | Returns SKILL.md only |
| check_updates | All | Compares versions |

---

## 8. Publish Steps

1. Create `skillport-code-manager` plugin directory
2. Update `skillport-manager` SKILL.md and version
3. Update `marketplace.json`
4. Commit: `feat: v2.0 with PTC installation + separate Claude Code skill`
5. Push to main
6. Publish both skills via connector
