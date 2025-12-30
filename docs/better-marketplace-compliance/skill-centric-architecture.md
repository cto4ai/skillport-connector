# Skill-Centric Architecture Decision

**Date:** 2025-12-29
**Status:** Implemented (branch: `feat/official-structure`)

## Context

We needed to align Skillport with the official Claude Code plugin marketplace structure while making skills the primary installable unit for Claude.ai/Desktop users.

## Official Claude Code Plugin Structure

Per https://code.claude.com/docs/en/plugins-reference:

```
my-marketplace/
├── .claude-plugin/
│   └── marketplace.json        # Lists plugins
└── plugins/
    └── enterprise-plugin/
        ├── .claude-plugin/
        │   └── plugin.json     # Plugin manifest with version
        ├── commands/           # Optional
        ├── agents/             # Optional
        ├── hooks/              # Optional
        └── skills/
            ├── code-reviewer/
            │   └── SKILL.md
            └── pdf-processor/
                ├── SKILL.md
                └── scripts/
```

Key insight: **A plugin can contain multiple skills, commands, agents, and hooks.**

## Decision: Expose Skills, Not Plugins

For Claude.ai/Desktop users installing via Skillport:

1. **Skills are the installable unit** - Users install individual skills, not entire plugins
2. **marketplace.json still lists plugins** - We stay compliant with official spec
3. **Connector discovers skills dynamically** - Scans `plugins/*/skills/*/SKILL.md`
4. **Skills inherit version from parent plugin** - No separate skill versioning

## API Changes

### New: `list_skills` MCP Tool
Returns all discovered skills across all plugins:
```json
{
  "count": 4,
  "skills": [
    {
      "name": "skillport-manager",
      "plugin": "skillport-manager",
      "description": "Manages Skills from Skillport marketplaces...",
      "version": "2.0.3",
      "author": { "name": "Crafty CTO" }
    },
    {
      "name": "soil-data-analyzer",
      "plugin": "soil-data-analyzer",
      "description": "Analyzes soil test data...",
      "version": "1.0.2"
    }
  ]
}
```

### Updated: `fetch_skill(skillName)`
Now looks up skill to find parent plugin, then fetches from correct path:
```json
{
  "skill": {
    "name": "soil-data-analyzer",
    "plugin": "soil-data-analyzer",
    "version": "1.0.2"
  },
  "plugin": {
    "name": "soil-data-analyzer",
    "version": "1.0.2"
  },
  "files": [...]
}
```

### Retained: `list_plugins`
Still available for backward compatibility and for cases where you want plugin-level info.

## Implementation Details

### Skill Discovery (`listSkills()`)
1. Fetch marketplace.json to get plugin list
2. For each plugin, list `plugins/{name}/skills/` directory
3. For each subdirectory, fetch and parse `SKILL.md` frontmatter
4. Return flattened list of all skills with parent plugin info

### Skill Lookup (`getSkill(name)`)
- Searches across all discovered skills by name
- Returns skill entry with parent plugin reference

### Skill Fetching (`fetchSkill(skillName)`)
1. Look up skill to find parent plugin
2. Fetch from `plugins/{plugin}/skills/{skill}/`
3. Include `.claude-plugin/plugin.json` for version tracking

## Current Constraint

For V1, each plugin contains exactly one skill with the same name:
- `plugins/soil-data-analyzer/skills/soil-data-analyzer/SKILL.md`

This is a **convention**, not enforced. The structure supports multi-skill plugins:
- `plugins/enterprise-tools/skills/code-reviewer/SKILL.md`
- `plugins/enterprise-tools/skills/pdf-processor/SKILL.md`

## What We Removed from marketplace.json

Non-standard fields that were Skillport extensions:
- `skillPath` - Now using convention `skills/{skill-name}/`
- `permissions` - Not used
- `_skillport` - Internal metadata

Fields retained as Skillport extensions (in PluginEntry interface):
- `category` - For filtering
- `tags` - For search
- `surfaces` - For platform filtering (claude-code, claude-desktop, claude-ai)

## Why Not Expose "Install All Skills from Plugin X"?

1. **User clarity** - Skills are what users actually use
2. **Granularity** - Users may only want one skill from a multi-skill plugin
3. **Simplicity** - One concept (skill) instead of two (plugin + skill)
4. **Future-proof** - When plugins have multiple skills, listing stays intuitive

## Files Changed

### Template (`feat/official-structure` branch)
- `plugins/*/skills/SKILL.md` → `plugins/*/skills/{name}/SKILL.md`
- `.claude-plugin/marketplace.json` - Removed skillPath, permissions, _skillport
- `plugins/*/.claude-plugin/plugin.json` - Version bumps

### Connector (`feat/official-structure` branch)
- `src/github-client.ts`:
  - Added `SkillEntry` interface
  - Added `parseSkillFrontmatter()` function
  - Added `listSkills()` method
  - Added `getSkill()` method
  - Updated `fetchSkill()` to use skill lookup
  - Removed `skillPath`, `permissions` from `PluginEntry`
- `src/mcp-server.ts`:
  - Added `list_skills` tool
  - Updated `fetch_skill` response format
  - Updated `update_skill` to use skill lookup
