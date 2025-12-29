# Architecture: Official Plugin Marketplace Compliance

## Goal

Make Skillport repos fully compatible with the official Anthropic Plugin Marketplace format while adding version tracking as an additive capability.

**Principle:** A Skillport-managed repo should work as a standard Claude Code Plugin Marketplace without modification.

---

## Current State vs Official

### Official Anthropic Structure

```
marketplace-repo/
├── .claude-plugin/
│   └── marketplace.json
└── skills/
    ├── pdf/
    │   ├── SKILL.md         ← At skill root
    │   ├── scripts/
    │   └── reference.md
    └── xlsx/
        └── SKILL.md
```

**marketplace.json:**
```json
{
  "name": "anthropic-agent-skills",
  "owner": { "name": "...", "email": "..." },
  "metadata": { "version": "1.0.0" },
  "plugins": [{
    "name": "example-skills",
    "source": "./",
    "strict": false,
    "skills": ["./skills/pdf", "./skills/xlsx"]
  }]
}
```

### Our Current Structure (Divergent)

```
skillport-template/
├── .claude-plugin/
│   └── marketplace.json
└── plugins/
    └── data-analyzer/
        ├── plugin.json      ← NOT in official
        └── skills/
            └── SKILL.md     ← In subdirectory (official is at root)
```

**Our marketplace.json:**
```json
{
  "plugins": [{
    "name": "data-analyzer",
    "source": "./plugins/data-analyzer",
    "skillPath": "skills/SKILL.md",  ← NOT in official schema
    "version": "1.1.0"
  }]
}
```

---

## Target State (Compliant)

### Structure Options

**Option 1: Flat skills (like official)**
```
skillport-template/
├── .claude-plugin/
│   └── marketplace.json
└── skills/
    ├── data-analyzer/
    │   ├── SKILL.md
    │   └── scripts/
    └── soil-data-analyzer/
        ├── SKILL.md
        └── scripts/
```

**Option 2: Plugins directory (our current, but simplified)**
```
skillport-template/
├── .claude-plugin/
│   └── marketplace.json
└── plugins/
    ├── data-analyzer/
    │   ├── SKILL.md         ← At plugin root, not in skills/
    │   └── scripts/
    └── soil-data-analyzer/
        ├── SKILL.md
        └── scripts/
```

Both are valid - the key is:
1. **SKILL.md at skill/plugin root** (not in `skills/` subdirectory)
2. **No required plugin.json**
3. **Version in marketplace.json**

---

## Version Handling

### Source of Truth: marketplace.json

The `version` field in plugin entries is part of the official schema:

```json
{
  "plugins": [{
    "name": "data-analyzer",
    "source": "./plugins/data-analyzer",
    "version": "1.1.0",        ← Official schema supports this
    "description": "..."
  }]
}
```

### bump_version Behavior

**Current:** Updates both `plugin.json` and `marketplace.json`

**New:** Updates `marketplace.json` only (plugin.json optional)

```typescript
// Read marketplace.json
// Find plugin entry by name
// Increment version
// Write marketplace.json
// Optionally update plugin.json if it exists
```

### check_updates Behavior

**Current:** Reads version from `plugin.json`

**New:** Reads version from `marketplace.json` plugin entry

---

## Tool Changes Summary

| Tool | Current Behavior | New Behavior |
|------|------------------|--------------|
| `save_skill` | Writes to `plugins/{name}/skills/` | Writes to plugin source path (flexible) |
| `save_skill` | Rejects bare SKILL.md | Allows any valid path |
| `bump_version` | Requires plugin.json | Uses marketplace.json (plugin.json optional) |
| `publish_plugin` | Adds to marketplace.json | Same, but ensure version field |
| `create_plugin` | Creates plugin.json + skills/SKILL.md | Creates SKILL.md at root (no plugin.json) |
| `fetch_skill` | Uses skillPath field | Uses skills array or infer from source |

---

## Migration

Existing skills in skillport-template will be updated to use official structure:
1. Move SKILL.md from `skills/SKILL.md` to skill root
2. Remove plugin.json files
3. Update marketplace.json to use official schema

---

## Compatibility Matrix

| Feature | Official | Skillport Current | Skillport New |
|---------|----------|-------------------|---------------|
| SKILL.md at root | ✅ | ❌ (in skills/) | ✅ |
| plugin.json | ❌ | Required | Optional |
| Version in marketplace.json | ✅ | ✅ | ✅ |
| skillPath field | ❌ | ✅ | Optional |
| skills array | ✅ | ❌ | ✅ |
| Works as standard marketplace | ✅ | ❌ | ✅ |
