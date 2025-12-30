# Skill-Centric Editor Tools

**Date:** 2025-12-29
**Status:** Planned

## Problem Summary

Two issues with current editor tools:

1. **Path bugs**: Tools create wrong directory structure, breaking skill discovery
2. **Wrong abstraction**: Tools expose "plugins" but models/users think in "skills"

## Design Decision

Rename tools to be **skill-centric**:
- Users and models only think about **skills**
- **Skill groups** (plugins) are an optional concept for bundling related skills
- Hide internal plugin machinery from the model

## New Tool Structure

### Key Insight: Skill Group Only Needed for Creation

- **Creating** a skill needs to know WHERE → requires `skill_group` param
- **Editing** a skill just needs skill name → look up its location automatically
- **Publishing** a skill → look up its group automatically
- **Versioning** is per-group → stays at group level

### Tool Mapping

| Old Name | New Name | Key Param | Notes |
|----------|----------|-----------|-------|
| `create_plugin` | `create_skill` | `skill_group` (optional) | If omitted, creates new group with same name |
| `save_skill` | `save_skill` | `skill` (renamed from `name`) | Looks up skill to find group |
| `update_skill` | *(remove)* | - | Redundant with save_skill |
| `publish_plugin` | `publish_skill` | `skill` | Looks up skill to find/publish its group |
| `bump_version` | `bump_version` | `skill_group` (renamed from `name`) | Versions are per-group |

### Examples

```typescript
// CREATE: Need to specify where (or default to new group)
create_skill(name: "my-skill", description: "...")
// → Creates group "my-skill" with skill "my-skill"

create_skill(name: "pdf-export", skill_group: "document-tools", description: "...")
// → Adds skill to existing group

// EDIT: Just need skill name (location looked up)
save_skill(skill: "my-skill", files: [...])
// → Finds skill, writes to its group

// PUBLISH: Just need skill name
publish_skill(skill: "my-skill")
// → Finds skill's group, publishes it

// VERSION: Operates on group level
bump_version(skill_group: "document-tools", type: "minor")
// → Bumps version for entire group
```

## Implementation Plan

### 1. Rename `create_plugin` → `create_skill`

**Parameters:**
- `name` - Skill name (required)
- `description` - Skill description (required)
- `skill_group` - Which group to add to (optional, defaults to `name`)
- `category` - For marketplace filtering (optional)

**Logic changes:**
- If `skill_group` provided and exists → add skill to existing group
- If `skill_group` provided but doesn't exist → create new group with that name
- If `skill_group` omitted → create new group with same name as skill

**Path fixes:**
- `.claude-plugin/plugin.json` (not `plugin.json`)
- `skills/{name}/SKILL.md` (not `skills/SKILL.md`)

### 2. Update `save_skill`

**Parameter rename:** `name` → `skill`

**Logic change:**
- Look up skill by name to find its group
- Use `skill.plugin` (group name) and `skill.dirName` for paths

**Description update:**
```
"Update files for a skill. Paths are relative to the skill's group root.
Example paths: 'skills/{skill}/SKILL.md', 'skills/{skill}/templates/example.md'"
```

### 3. Rename `publish_plugin` → `publish_skill`

**Parameter rename:** `name` → `skill`

**Logic change:**
- Look up skill by name to find its group
- Publish the group (add to marketplace.json)
- Verify skill exists at `skills/{skill}/SKILL.md`

### 4. Update `bump_version`

**Parameter rename:** `name` → `skill_group`

**Description update:**
```
"Bump version for a skill group. All skills in the group share the same version."
```

### 5. Remove `update_skill`

- Delete the tool registration entirely
- `save_skill` covers all use cases

## Files to Modify

1. `src/mcp-server.ts` - All tool changes

## Expected Workflow (Model Perspective)

**User:** "Create a skill that analyzes CSV files"

**Model:**
1. `create_skill(name: "csv-analyzer", description: "Analyzes CSV files")`
2. `save_skill(skill: "csv-analyzer", files: [{ path: "skills/csv-analyzer/SKILL.md", content: "..." }])`
3. `publish_skill(skill: "csv-analyzer")`

**User:** "Add a JSON export skill to my csv-analyzer"

**Model:**
1. `create_skill(name: "json-export", description: "Export to JSON", skill_group: "csv-analyzer")`
2. `save_skill(skill: "json-export", files: [...])`
3. `bump_version(skill_group: "csv-analyzer", type: "minor")`

No "plugins" in the model's reasoning - only skills and skill groups.

## Testing Plan

1. **Create standalone skill:**
   ```
   create_skill(name: "test-skill", description: "Test")
   ```
   - Creates `plugins/test-skill/.claude-plugin/plugin.json`
   - Creates `plugins/test-skill/skills/test-skill/SKILL.md`

2. **Discover skill:**
   ```
   list_skills()
   ```
   - Returns skill with `name: "test-skill"`, `plugin: "test-skill"`

3. **Update skill:**
   ```
   save_skill(skill: "test-skill", files: [...])
   ```
   - Looks up skill, writes to correct group

4. **Publish skill:**
   ```
   publish_skill(skill: "test-skill")
   ```
   - Adds group to marketplace.json

5. **Add skill to existing group:**
   ```
   create_skill(name: "second-skill", description: "...", skill_group: "test-skill")
   ```
   - Creates `plugins/test-skill/skills/second-skill/SKILL.md`
   - Does NOT create new plugin.json (group already exists)
