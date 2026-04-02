# Crafty Marketplace: Native Compliance Analysis

**Date:** 2026-04-01
**Repo:** `crafty-skillport-marketplace`
**Spec source:** [Claude Code plugin marketplace docs](https://code.claude.com/docs/en/plugin-marketplaces), [plugins reference](https://code.claude.com/docs/en/plugins-reference)

## Overall Verdict

The marketplace is **95% compliant** with the native Claude Code plugin marketplace spec. The structure is sound — it was built on the same foundation. A few Skillport-specific artifacts need cleanup and there are two structural anomalies, but no blockers.

## Compliance Checklist

### Structure

| Requirement | Status | Notes |
|---|---|---|
| `.claude-plugin/marketplace.json` at repo root | PASS | Present and valid |
| Plugin dirs under `plugins/` | PASS | All 23 plugins |
| Each plugin has `.claude-plugin/plugin.json` | PASS | All 23 present |
| Each plugin has `skills/{name}/SKILL.md` | PASS | All 23 present |
| Plugin names are kebab-case | PASS | All names valid |
| Source paths use `./` prefix | PASS | All relative paths |
| No `../` in source paths | PASS | Clean |

### marketplace.json

| Requirement | Status | Notes |
|---|---|---|
| `name` field (kebab-case) | PASS | `crafty-skillport-marketplace` |
| `owner.name` field | PASS | `Crafty CTO` |
| `plugins` array | PASS | 23 entries |
| Each plugin has `name` | PASS | All 23 |
| Each plugin has `source` | PASS | All relative paths |
| Versions match plugin.json | PASS | All 23 match exactly |

### plugin.json files

| Requirement | Status | Notes |
|---|---|---|
| `name` field present | PASS | All 23 |
| `version` field present | PASS | All 23 |
| Valid semver format | PASS | All versions |

## Issues to Fix

### 1. Nested plugin.json files inside skill directories (CLEANUP)

Two plugins have `.claude-plugin/plugin.json` at the **skill level** in addition to the plugin level:

```
plugins/obsidian/skills/obsidian/.claude-plugin/plugin.json     (version 1.7.1)
plugins/surface-detect/skills/surface-detect/.claude-plugin/plugin.json  (version 1.2.1)
```

These are Skillport artifacts from when skills were individually versioned. The native spec expects `.claude-plugin/` only at the plugin root. These nested files:
- Could confuse the plugin loader
- Have stale version numbers (obsidian 1.7.1 vs plugin-level 2.3.2)
- Serve no purpose in the native system

**Fix:** Delete both nested `.claude-plugin/` directories.

### 2. Skillport-specific artifacts (CLEANUP)

| Artifact | Location | Action |
|---|---|---|
| `.skillport/access.json` | Repo root | Remove — editor permissions were for the connector |
| `surface:*` tags | marketplace.json plugin entries | Keep or remove — harmless (spec allows arbitrary tags) but meaningless to native system |
| README reference to connector URL | `README.md` | Update — remove connector reference |

### 3. Version dual-write (RECOMMENDATION)

Currently, versions are maintained in **both** `marketplace.json` and each `plugin.json`. They all match today, which is correct.

The spec says: **plugin.json version takes priority** over marketplace.json. For relative-path plugins (which all of these are), the spec recommends setting version in the marketplace entry.

**Options:**
- **A) Keep both in sync** (current approach) — works, but requires updating two files on every version bump. Risk of drift.
- **B) Version in marketplace.json only** — remove `version` from plugin.json files. Simpler, single source of truth. Spec-recommended for relative-path plugins.
- **C) Version in plugin.json only** — remove from marketplace.json. Also valid since plugin.json wins anyway.

**Recommendation:** Option A (keep both) is safest for now. The `skillport-repo-utils` bump script already maintains both. If/when you simplify, Option B aligns with the spec recommendation.

### 4. Author inconsistency (COSMETIC)

| Author name | Used by |
|---|---|
| "Jack Ivers" (jack@craftycto.com) | Most plugins |
| "Crafty CTO" (jack@craftycto.com) | data-analyzer, soil-data-analyzer |
| "Skillport" (no email) | skillport-repo-utils |
| "Jack Ivers" (jack@anthropic.com) | skillport |

**Fix:** Standardize to "Jack Ivers" / jack@craftycto.com across all. The skillport plugin's @anthropic.com email is incorrect.

### 5. Generic plugin.json descriptions (COSMETIC)

Several plugin.json files have auto-generated descriptions:
- "Skill: {name}" — csv-analyzer, git-commit-generator, json-formatter, word-pair-swap
- "Skill group: {name}" — astro-scaffold, chat-transcript, linkedin-post-plain, meeting-digest, named-entity-linking, obsidian, proofread, twitter-thread

The marketplace.json has good descriptions for all of these. Since marketplace.json descriptions are what users see when browsing, this is low priority. But if plugin.json descriptions surface anywhere in the native system, they'd look rough.

## Things That Are Fine

### `surface:*` tags

The spec allows arbitrary `tags` arrays on plugin entries. The `surface:CC`, `surface:CALL`, etc. tags are harmless in the native system — they just won't be used for filtering. Could be useful as metadata if you build tooling that reads marketplace.json.

### `category` field

Used on some plugins, not others. Optional in the spec. No compliance issue.

### `keywords` field

Used on some plugins, not others. Optional in the spec. No compliance issue.

### `metadata.pluginRoot` not used

Each plugin source is `./plugins/{name}` — could be simplified with `"pluginRoot": "./plugins"` and then `"source": "{name}"`. Optional optimization, not a compliance issue.

## Optimization: `metadata.pluginRoot`

If you add `"pluginRoot": "./plugins"` to the metadata, source paths simplify:

```json
// Before
{ "name": "acp", "source": "./plugins/acp", ... }

// After (with pluginRoot)
{ "name": "acp", "source": "acp", ... }
```

Not required, but reduces repetition across 23 entries.

## Summary of Required Actions

| Priority | Action | Effort |
|---|---|---|
| High | Delete nested `.claude-plugin/` in obsidian and surface-detect skills | 2 min |
| Medium | Remove `.skillport/access.json` | 1 min |
| Medium | Update README.md to remove connector reference | 5 min |
| Low | Standardize author fields | 5 min |
| Low | Improve generic plugin.json descriptions | 15 min |
| Optional | Add `metadata.pluginRoot` | 2 min |
| Optional | Remove `surface:*` tags (or keep as metadata) | 5 min |

## Validation

After cleanup, run the native validator:
```bash
claude plugin validate /path/to/crafty-skillport-marketplace
```

This checks marketplace.json, plugin.json, SKILL.md frontmatter, and hooks.json for all plugins.
