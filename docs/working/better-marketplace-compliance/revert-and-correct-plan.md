# Plan: Revert Incorrect Changes and Align with ACTUAL Official Structure

**Date:** 2025-12-29
**Status:** Planning
**Problem:** Previous "marketplace compliance" work was based on incorrect research. The changes moved away from the correct structure, not toward it.

---

## Official Claude Code Plugin Structure (VERIFIED)

Source: https://code.claude.com/docs/en/plugins-reference

```
enterprise-plugin/
├── .claude-plugin/
│   └── plugin.json          # REQUIRED: plugin manifest
├── commands/                 # Default command location
├── agents/                   # Default agent location
├── skills/                   # Agent Skills
│   ├── code-reviewer/
│   │   └── SKILL.md
│   └── pdf-processor/
│       ├── SKILL.md
│       └── scripts/
└── hooks/
```

**Key facts:**
1. `plugin.json` in `.claude-plugin/` is REQUIRED
2. Skills go in `skills/<skill-name>/SKILL.md` (NOT at plugin root)
3. `version` field in marketplace.json plugin entries is OFFICIAL and SUPPORTED
4. `skills` array in marketplace.json is official (e.g., `["./skills/pdf", "./skills/xlsx"]`)

---

## What We Got Wrong

| Assumption | Reality |
|------------|---------|
| SKILL.md at plugin root | SKILL.md in `skills/<name>/SKILL.md` |
| plugin.json not required | plugin.json IS required (in `.claude-plugin/`) |
| Anthropic skills repo = standard | Anthropic skills repo is for standalone skills, not plugins |

---

## Current State

### Connector (skillport-connector)
- **Main branch:** Has PR #10 merged (expand save_skill scope) - needs evaluation
- **feat/marketplace-compliance branch:** 6 commits with wrong changes - selective salvage

### Template (skillport-marketplace-template)
- **Main branch:** Still correct (PR #7 not merged)
- **PR #7:** Open, contains wrong migration - CLOSE without merging
- **feat/official-marketplace-compliance branch:** Wrong changes - ABANDON

---

## Commits on feat/marketplace-compliance Branch

| # | Commit | Description | Verdict |
|---|--------|-------------|---------|
| 1 | `6974056` | docs: Add architecture and implementation plan | ❌ Based on wrong research |
| 2 | `85ef00b` | docs: Remove backward compat, plugin.json support | ❌ Wrong direction |
| 3 | `b293350` | feat: Phase 1+2 (mcp-server.ts, github-client.ts) | ❌ Removes plugin.json requirement |
| 4 | `d29f9f4` | feat: Phase 3 - skills array support | ⚠️ **PARTIALLY VALID** |
| 5 | `795d57f` | docs: Add checkpoint | ❌ Documents wrong approach |
| 6 | `1dd8e61` | docs: Update checkpoint | ❌ Documents wrong approach |

### Commit 4 Analysis (`d29f9f4`)

**What it adds (VALID - keep):**
- `skills?: string[]` field in PluginEntry interface
- `_expandedFrom?: { pluginName, skillPath }` for internal tracking
- `getSkillNameFromPath()` helper function
- `listPlugins` expansion of skills arrays to `plugin:skill` entries
- `getPlugin` parsing of `plugin:skill` format
- `fetchSkill` handling of `_expandedFrom.skillPath`

**What it removes (PROBLEMATIC - must restore):**
- Removes plugin.json manifest lookup in `getPlugin`
- Removes plugin.json inclusion in `fetchSkill` output

---

## Revert Plan

### Step 1: Close Template PR #7
```bash
cd /Users/jackivers/Projects/skillport/skillport-marketplace-template
gh pr close 7 --comment "Closing: Based on incorrect research. Official plugin structure has skills in skills/ subdirectory, not at plugin root."
```

### Step 2: Switch Connector to Main
```bash
cd /Users/jackivers/Projects/skillport/skillport-connector
git checkout main
```

### Step 3: Cherry-pick Skills Array Support with Fixes
Instead of merging the whole branch, selectively add skills array support:

**Option A: Cherry-pick and fix**
```bash
git cherry-pick d29f9f4
# Then manually restore plugin.json handling
```

**Option B: Re-implement cleanly**
- Add `skills?: string[]` to PluginEntry
- Add `_expandedFrom` tracking
- Add expansion logic to listPlugins
- Add plugin:skill parsing to getPlugin
- Keep existing plugin.json handling intact

**Recommendation:** Option B - cleaner, avoids bringing in unwanted changes

### Step 4: Evaluate PR #10 (save_skill scope expansion)
PR #10 expanded `save_skill` to write to plugin root (not just skills/).

**Decision:** KEEP PR #10 - it's useful for writing plugin.json at plugin root

### Step 5: Update Documentation
- Archive/update the incorrect docs in `docs/better-marketplace-compliance/`
- Create correct documentation based on official structure

---

## Template Changes Required

### Current Structure (on main)
```
skillport-marketplace-template/
├── .claude-plugin/
│   └── marketplace.json
└── plugins/
    └── data-analyzer/
        ├── plugin.json           # ❌ Wrong location
        └── skills/
            └── SKILL.md          # ✅ Correct
```

### Target Structure (official)
```
skillport-marketplace-template/
├── .claude-plugin/
│   └── marketplace.json
└── plugins/
    └── data-analyzer/
        ├── .claude-plugin/
        │   └── plugin.json       # ✅ Correct location
        └── skills/
            └── SKILL.md
```

### Migration Steps for Template

1. **For each plugin**, create `.claude-plugin/` directory and move `plugin.json` into it:
   ```bash
   cd plugins/data-analyzer
   mkdir -p .claude-plugin
   mv plugin.json .claude-plugin/
   ```

2. **Update connector** to look for `.claude-plugin/plugin.json` instead of `plugin.json`

3. **Update get_versions.py** path (if it runs locally on installed skills)

### Plugins to Migrate
- `data-analyzer`
- `example-skill`
- `skillport-manager`
- `soil-data-analyzer` (needs plugin.json created first - was missing)

---

## What Still Needs Fixing

### 1. get_versions.py
The original issue from Codex review - `get_versions.py` looks for `plugin.json` to get versions. This is CORRECT behavior, but path may need updating to `.claude-plugin/plugin.json`.

### 2. soil-data-analyzer
Missing `plugin.json` entirely - needs to be created.

### 3. Skills Array Support
The `skills` array in marketplace.json IS official. Need to re-implement cleanly without removing plugin.json support.

### 4. Connector plugin.json lookup
Update `github-client.ts` to look for `.claude-plugin/plugin.json` instead of `plugin.json`.

---

## Summary

| Item | Action |
|------|--------|
| Template PR #7 | Close without merging |
| Template branch | Abandon |
| Template plugin.json location | Move to `.claude-plugin/plugin.json` per plugin |
| Template soil-data-analyzer | Create missing plugin.json |
| Connector commits 1-3, 5-6 | Don't merge |
| Connector commit 4 (skills array) | Re-implement cleanly (Option B) |
| Connector PR #10 | Keep (already merged, still useful) |
| Connector plugin.json path | Update to `.claude-plugin/plugin.json` |
| get_versions.py | Update path to `.claude-plugin/plugin.json` |

---

## Lessons Learned

1. **Verify sources**: The Anthropic `skills` repo is for STANDALONE skills, not plugin marketplace skills
2. **Read official docs first**: https://code.claude.com/docs/en/plugins-reference is the authoritative source
3. **Don't trust AI summaries**: My web fetch summaries were incomplete/misleading
4. **Check before migrating**: Should have verified structure before moving files

---

## Execution Steps

### Phase A: Cleanup (close bad PRs/branches)
1. Close template PR #7
2. Switch connector to main branch

### Phase B: Template Migration
3. Create `.claude-plugin/` directories in each plugin
4. Move `plugin.json` files to `.claude-plugin/plugin.json`
5. Create `plugin.json` for soil-data-analyzer
6. Update `get_versions.py` to look in `.claude-plugin/`
7. Commit and push template changes

### Phase C: Connector Updates
8. Update `github-client.ts` to look for `.claude-plugin/plugin.json`
9. Re-implement skills array support (preserving plugin.json handling)
10. Test against updated template
11. Commit and push connector changes

### Phase D: Deployment
12. Deploy connector
13. End-to-end testing
