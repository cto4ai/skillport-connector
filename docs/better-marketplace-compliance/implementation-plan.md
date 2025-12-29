# Implementation Plan: Official Marketplace Compliance

## Overview

Align Skillport Connector with the official Anthropic Plugin Marketplace format. Version tracking becomes additive (marketplace.json), not divergent (plugin.json required).

---

## Phase 1: Remove Bare Path Guard

**Status:** Ready to implement

**Changes:**
- Remove the `bareSkillPaths` validation from `save_skill`
- Allow any valid relative path (SKILL.md at root is valid)

**Files:**
- `src/mcp-server.ts` - Remove lines 624-642

**Risk:** Low - this is a revert of recently added code

---

## Phase 2: Remove plugin.json Requirement

**Status:** Planning

### 2.1 Update bump_version

**Current behavior:**
1. Read `plugins/{name}/plugin.json`
2. Increment version
3. Write plugin.json
4. Update marketplace.json

**New behavior:**
1. Read marketplace.json
2. Find plugin entry by name
3. Increment version in entry
4. Write marketplace.json

**Files:**
- `src/mcp-server.ts` - `bump_version` tool (~line 688)

### 2.2 Update create_plugin

**Current behavior:**
- Creates `plugin.json` + `skills/SKILL.md`

**New behavior:**
- Creates `SKILL.md` at plugin root
- No plugin.json (version tracked in marketplace.json)

**Files:**
- `src/mcp-server.ts` - `create_plugin` tool (~line 788)

### 2.3 Update publish_plugin

**Current behavior:**
- Adds entry to marketplace.json
- Validates plugin files exist

**New behavior:**
- Same, but ensure `version: "1.0.0"` in entry
- Don't require plugin.json

**Files:**
- `src/mcp-server.ts` - `publish_plugin` tool (~line 913)

---

## Phase 3: Support skills Array

**Status:** Future consideration

Add support for official `skills` array format in marketplace.json:

```json
{
  "plugins": [{
    "name": "my-skills",
    "source": "./",
    "skills": ["./skills/foo", "./skills/bar"]
  }]
}
```

This allows multiple skills per plugin entry (official pattern).

**Files:**
- `src/github-client.ts` - `listPlugins`, `getPlugin`
- `src/mcp-server.ts` - `fetch_skill`

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
