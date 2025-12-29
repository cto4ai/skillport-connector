# Implementation Plan: Official Marketplace Compliance

## Overview

Align Skillport Connector with the official Anthropic Plugin Marketplace format. Version tracking becomes additive (marketplace.json), not divergent (plugin.json required).

---

## Phase 1: Remove Bare Path Guard

**Status:** ✅ Complete

**Changes:**
- Removed the `bareSkillPaths` validation from `save_skill`
- Now allows any valid relative path (SKILL.md at root is valid)

**Files:**
- `src/mcp-server.ts` - Removed bare path guard validation

**Risk:** Low - this was a revert of recently added code

---

## Phase 2: Remove plugin.json Requirement

**Status:** ✅ Complete

### 2.1 Update bump_version

**Changes:**
- Now reads version from marketplace.json entry only
- Removed plugin.json update logic
- Updated tool description

**Files:**
- `src/mcp-server.ts` - `bump_version` tool

### 2.2 Update create_plugin

**Changes:**
- Creates `SKILL.md` at plugin root (not `skills/SKILL.md`)
- No longer creates `plugin.json`
- Updated next steps guidance

**Files:**
- `src/mcp-server.ts` - `create_plugin` tool

### 2.3 Update publish_plugin

**Changes:**
- Checks for `SKILL.md` at plugin root (official structure)
- Simplified version handling (always starts at 1.0.0)
- Removed plugin.json lookup

**Files:**
- `src/mcp-server.ts` - `publish_plugin` tool
- `src/github-client.ts` - `addToMarketplace` function

---

## Phase 3: Support skills Array

**Status:** ✅ Complete

Added support for official `skills` array format in marketplace.json:

```json
{
  "plugins": [{
    "name": "example-skills",
    "source": "./",
    "skills": ["./skills/pdf", "./skills/xlsx", "./skills/docx"]
  }]
}
```

### UX Design: Expand to Individual Entries

When a plugin has a `skills` array, each skill is expanded as a separate entry using `plugin:skill` naming:

```
list_plugins returns:
- example-skills:pdf
- example-skills:xlsx
- example-skills:docx

fetch_skill("example-skills:pdf") → fetches ./skills/pdf/SKILL.md
```

### Changes Made

**3.1 Updated PluginEntry interface**
- Added `skills?: string[]` field
- Added `_expandedFrom?: { pluginName, skillPath }` for internal tracking

**3.2 Updated listPlugins**
- Detects plugins with `skills` array
- Expands into individual entries with `pluginName:skillName` naming
- Added `getSkillNameFromPath()` helper

**3.3 Updated getPlugin**
- Parses `plugin:skill` format
- Looks up parent plugin, then finds skill path in array

**3.4 Updated fetchSkill**
- Uses `_expandedFrom.skillPath` for expanded skills
- Falls back to `skillPath` field (legacy) or plugin root (official)

**Files:**
- `src/github-client.ts` - All changes in github-client

---

## Phase 4: Update skillport-template

**Status:** After connector changes

Migrate the template repo to official-compatible structure:

1. Move `plugins/*/skills/SKILL.md` to `plugins/*/SKILL.md`
2. Remove `plugin.json` files (keep version in marketplace.json)
3. Remove `skillPath` field from marketplace.json
4. Optionally add `skills` array format

---

## Implementation Order

```
Phase 1: Remove bare path guard
    ↓
Phase 2.1: Update bump_version (marketplace.json primary)
    ↓
Phase 2.2: Update create_plugin (no plugin.json)
    ↓
Phase 2.3: Update publish_plugin (ensure version)
    ↓
Phase 3: Support skills array (optional)
    ↓
Phase 4: Migrate skillport-template
```

---

## Testing Checklist

### Phase 1
- [ ] `save_skill` accepts `SKILL.md` at root
- [ ] `save_skill` accepts `skills/SKILL.md` (backward compat)
- [ ] `save_skill` still rejects `../` paths

### Phase 2
- [ ] `bump_version` works without plugin.json
- [ ] `bump_version` updates marketplace.json version
- [ ] `bump_version` updates plugin.json if present
- [ ] `create_plugin` creates SKILL.md at root
- [ ] `publish_plugin` sets version in marketplace entry

### Phase 3
- [ ] `list_plugins` handles skills array
- [ ] `fetch_skill` handles skills array
- [ ] Multiple skills per plugin work

### Phase 4
- [ ] skillport-template works as standard marketplace
- [ ] Existing skills still accessible
- [ ] Version tracking still works

---

## Rollback Plan

Each phase is independent. If issues arise:
- Phase 1: Re-add bare path guard
- Phase 2: Restore plugin.json requirement
- Phase 3: Skip (additive feature)
- Phase 4: Keep old structure in template

---

## Success Criteria

1. A Skillport-managed repo can be added as a standard Plugin Marketplace in Claude Code
2. No plugin.json required for basic functionality
3. Version tracking works via marketplace.json
4. Existing repos continue to work (backward compatible)
