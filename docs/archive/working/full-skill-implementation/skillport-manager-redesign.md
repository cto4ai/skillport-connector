# Skillport Manager Redesign

**Date:** 2025-12-26
**Status:** DRAFT

## Problem

Current skillport-manager is a single SKILL.md file with inline bash commands. This approach:
- Relies on Claude interpreting instructions correctly each time
- Duplicates deterministic logic that could be scripted
- Doesn't handle the new multi-file skill format from fetch_skill

## Goal

Redesign skillport-manager to use scripts for deterministic operations, following the pattern established by Anthropic's skill-creator.

## New Structure

```
plugins/skillport-manager/
├── plugin.json                 # Version info
└── skills/
    ├── SKILL.md                # Orchestration instructions
    └── scripts/
        ├── install_skill.py    # Write files to disk
        ├── package_skill.py    # Create .skill zip
        └── get_versions.py     # Extract versions from installed skills
```

## Scripts

### install_skill.py

**Purpose:** Write skill files to disk from JSON input

**Input:** JSON on stdin or as argument
```json
{
  "name": "pdf",
  "files": [
    {"path": "SKILL.md", "content": "..."},
    {"path": "scripts/analyze.py", "content": "..."},
    {"path": "assets/logo.png", "content": "...", "encoding": "base64"}
  ]
}
```

**Operations:**
1. Create skill directory: `/home/claude/{name}/`
2. For each file:
   - Create subdirectories as needed
   - If `encoding: "base64"`, decode before writing
   - Write content to file
3. Print summary of files written

**Output:**
```
Created /home/claude/pdf/
  - SKILL.md (2.3 KB)
  - scripts/analyze.py (1.1 KB)
  - assets/logo.png (4.2 KB, binary)
```

### package_skill.py

**Purpose:** Create .skill zip file from skill directory

**Input:** Skill directory path
```bash
python package_skill.py /home/claude/pdf
```

**Operations:**
1. Validate SKILL.md exists
2. Create zip with skill folder as root
3. Move to /mnt/user-data/outputs/
4. Return path to .skill file

**Output:**
```
/mnt/user-data/outputs/pdf.skill
```

### get_versions.py

**Purpose:** Extract versions from all installed skills

**Input:** None (reads from /mnt/skills/user/)

**Operations:**
1. List directories in /mnt/skills/user/
2. For each, try to read plugin.json
3. Extract name and version
4. Output as JSON array

**Output:**
```json
[
  {"name": "skillport-manager", "version": "1.0.0"},
  {"name": "pdf", "version": "2.1.0"}
]
```

## Updated SKILL.md

```markdown
---
name: skillport-manager
description: >
  Manages Skills from Skillport marketplaces — browse available skills, install them
  with one click, and check for updates. Activates when the user asks to list, browse,
  install, or update skills, or mentions "Skillport" in context of skills or plugins.
---

# Skillport Manager

## Prerequisites

The Skillport Connector must be enabled. Verify by checking if these tools exist:
- `Skillport Connector:list_plugins`
- `Skillport Connector:fetch_skill`

If unavailable, tell the user: "Please add the Skillport Connector in Settings > Connectors, then enable it via the 'Search and tools' menu."

## List Skills

Call `Skillport Connector:list_plugins` with optional `surface` and `category` filters.
Present results as a brief list.

## Get Skill Details

Call `Skillport Connector:get_plugin` with `name` parameter.
Present the description, version, and author.

## Install a Skill

1. **Fetch**: Call `Skillport Connector:fetch_skill` with skill name
   - Returns JSON with `plugin` info and `files` array

2. **Write files**: Pipe the response to install script
   ```bash
   echo '<FILES_JSON>' | python /mnt/skills/user/skillport-manager/scripts/install_skill.py
   ```
   Replace `<FILES_JSON>` with the JSON containing name and files array.

3. **Package**: Create the .skill file
   ```bash
   python /mnt/skills/user/skillport-manager/scripts/package_skill.py /home/claude/SKILLNAME
   ```

4. **Present**: Call `present_files` with the .skill path.
   Tell user: "Click 'Copy to your skills' to install. **Start a new conversation to use the newly installed skill.**"

## Check for Updates

1. **Get installed versions**:
   ```bash
   python /mnt/skills/user/skillport-manager/scripts/get_versions.py
   ```

2. **Check marketplace**: Call `Skillport Connector:check_updates` with the JSON output

3. **Report**: Show which skills have updates available, offer to install them
```

## Benefits

1. **Reliability** - Scripts do the same thing every time
2. **Error handling** - Scripts can validate inputs, catch errors
3. **Testability** - Scripts can be tested independently
4. **Maintainability** - Logic separated from instructions
5. **Complexity handling** - Base64 decoding, directory creation, etc. handled in code

## Implementation Order

1. Create scripts/ directory structure
2. Write install_skill.py
3. Write package_skill.py
4. Write get_versions.py
5. Update SKILL.md to use scripts
6. Update plugin.json version
7. Test end-to-end

## Testing

1. Install a simple skill (SKILL.md only)
2. Install a complex skill (with scripts, references)
3. Install a skill with binary assets
4. Check for updates flow
5. Verify version extraction works
