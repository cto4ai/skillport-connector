# Idea: Self-Syncing Plugin Marketplace

**Date:** 2026-04-01
**Status:** Captured, not yet built

## The Problem

Every Claude Code plugin marketplace today manually maintains `.claude-plugin/marketplace.json`. This means:

- Dual-write: version in `plugin.json` AND `marketplace.json`
- Easy to drift: update one, forget the other
- No tooling from Anthropic to auto-generate or sync
- Community solutions (validate, bump, detect-changed) bolt validation onto a manual process

Existing approaches:
- [ivan-magda/claude-code-plugin-template](https://github.com/ivan-magda/claude-code-plugin-template) — scaffolding + CI validation, marketplace.json still manual
- [just-be.dev](https://just-be.dev/blog/why-i-built-a-claude-code-plugin-marketplace/) — TypeScript scripts for validation/bumping, marketplace.json still manual
- [claude-code-plugin-marketplaces](https://github.com/claude-code-plugin-marketplaces) — visual builder (WIP), not directory-scanning
- Anthropic's own repos — hand-edited

## The Idea

**`marketplace.json` is a derived file, not a source of truth.**

`plugin.json` is the single source of truth for each plugin. A sync mechanism walks `plugins/*/`, reads each `.claude-plugin/plugin.json`, and generates `marketplace.json`. The `source` path is derived from the directory name.

### What lives where

**In `plugin.json` (source of truth):**
```json
{
  "name": "my-skill",
  "version": "1.2.0",
  "description": "What this plugin does",
  "author": { "name": "Jack Ivers", "email": "jack@craftycto.com" },
  "license": "MIT",
  "keywords": ["data", "analysis"],
  "category": "productivity",
  "tags": ["surface:CALL"]
}
```

The spec allows arbitrary fields in plugin.json, so `category`, `tags`, and `keywords` are valid there.

**In `marketplace.json` (generated):**
- `name`, `owner`, `metadata` — marketplace-level config (static, rarely changes)
- `plugins` array — auto-generated from scanning plugin directories

**Derived at generation time:**
- `source`: `"./plugins/{directory-name}"`

### Marketplace-level config

The static marketplace metadata (name, owner, description) needs to live somewhere that isn't generated. Options:
- A separate `marketplace-config.json` that the generator reads as the template
- Hardcoded in the generation script
- A YAML file at repo root

### Sync trigger options

| Trigger | Mechanism | Pros | Cons |
|---|---|---|---|
| Pre-commit hook | Git hook runs sync script | Automatic, never forget | Slower commits |
| Claude Code hook | PostToolUse on Write/Edit in plugins/ | Real-time during editing | CC-specific |
| GitHub Action | CI generates and commits | Works for all contributors | Async, delayed |
| CLAUDE.md instruction | Tell Claude to run sync after changes | Zero infrastructure | Relies on Claude remembering |
| Manual script | `./scripts/sync-marketplace.sh` | Simple, explicit | Can forget |

**Recommended:** Pre-commit hook + manual script as fallback. The hook ensures marketplace.json is always in sync at commit time. The script lets you check things ad-hoc.

### Version bumping

With plugin.json as the source of truth, version bumping is a single-file edit. The sync script picks it up automatically. No dual-write.

For auto-bumping on content changes, the pre-commit hook could:
1. Detect which plugins have changed files
2. Auto-increment patch version in their plugin.json
3. Regenerate marketplace.json

This is optional — explicit version bumps are also fine.

## Scope

This could be:
1. **Just for crafty-skillport-marketplace** — a script and hook in the repo
2. **A reusable GitHub template** — like ivan-magda's but with auto-sync baked in
3. **A Claude Code plugin** — a marketplace management plugin that any marketplace can install

Option 1 first. If it works well, extract to a template.

## Implementation Sketch

### `scripts/sync-marketplace.sh`

```bash
#!/bin/bash
# Scan plugins/*/.claude-plugin/plugin.json
# Read marketplace config (name, owner, metadata)
# Generate .claude-plugin/marketplace.json
```

Core logic:
1. Read static marketplace config
2. For each `plugins/*/` directory:
   a. Read `.claude-plugin/plugin.json`
   b. Extract: name, version, description, author, license, keywords, category, tags
   c. Set source to `./plugins/{dir-name}`
3. Assemble `marketplace.json` with sorted plugins array
4. Write atomically (to temp file, then move)

### `.githooks/pre-commit`

```bash
#!/bin/bash
./scripts/sync-marketplace.sh
git add .claude-plugin/marketplace.json
```

### Validation

After generation, optionally run `claude plugin validate .` to catch structural issues.

## Open Questions

1. Should `marketplace.json` be gitignored (truly derived) or committed (for non-CC consumers)?
   - **Lean toward committed** — Claude Code reads it from Git, so it needs to be there
2. Should the generator sort plugins alphabetically for deterministic output?
   - **Yes** — avoids noisy diffs from ordering changes
3. What about plugins with external sources (not relative paths)?
   - Out of scope for now — all crafty plugins are relative-path
4. Should this handle the cross-surface export (ZIP packaging for Claude.ai upload)?
   - Separate concern — keep the sync script focused

## Prior Art in This Repo

`skillport-repo-utils` already has:
- `check-repo.sh` — validates marketplace consistency (can be replaced by native `claude plugin validate .`)
- `delete-skill.sh` — removes skill + updates marketplace.json (still useful, but simpler with derived marketplace.json — just delete the directory)
- `copy-skill.sh` — copies skill from another repo (still useful)

With a self-syncing marketplace, delete becomes "remove the directory, commit" and the pre-commit hook handles marketplace.json.
