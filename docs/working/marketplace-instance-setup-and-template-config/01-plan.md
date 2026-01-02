# Marketplace Instance Setup & Template Configuration Plan

## Overview

We need to:
1. Create Jack's "real" marketplace instance (craftycto-skillport or similar)
2. Clean up skillport-marketplace-template for open source release
3. Clean up skillport-connector for open source release

## Current State

### skillport-marketplace-template
- Contains 12+ production-ready plugins (should be minimal examples)
- Has Jack's Google ID in access.json
- Has "Crafty CTO" author references
- Has development commands in .claude/commands/
- Full git history of plugin testing/development

### skillport-connector
- Has hardcoded `MARKETPLACE_REPO = "cto4ai/skillport-marketplace-template"`
- Has extensive /docs/working/ development history (20+ subdirectories)
- Has /docs/research/ with development research notes
- Has Jack's catchup skill in .claude/skills/
- Production URL hardcoded in CLAUDE.md

---

## Decision: GitHub Template (Simple Approach)

Use GitHub's "Use this template" feature with a **clean main branch**.

**Approach:**
- `main` branch is clean template (what users get)
- `development` branch has dev artifacts, checkpoints, experiments
- No init workflow needed - template is ready to use as-is
- Users manually configure `access.json` and `marketplace.json` per README

**Why not init workflow (like ai-first-docs)?**
- Skillport requires connector setup anyway (manual steps unavoidable)
- Keeping template clean from start is simpler to maintain
- Rich examples can live in `development` branch for reference

See [02-development-workflow.md](./02-development-workflow.md) for branch strategy details.

---

## Phase 1: Create Jack's Production Marketplace ✅ COMPLETE

### 1.1 Create New Repo ✅
- Name: `crafty-skillport-marketplace`
- Private repo under cto4ai org
- Created with clean structure

### 1.2 Migrate Production Plugins ✅
Migrated all plugins (16 total):
- [x] skillport-manager
- [x] skillport-code-manager
- [x] data-analyzer
- [x] soil-data-analyzer
- [x] csv-analyzer
- [x] meeting-digest
- [x] git-commit-generator
- [x] catchup
- [x] word-pair-swap
- [x] json-formatter
- [x] astro-scaffold (new)
- [x] twitter-thread (new)
- [x] proofread (new)
- [x] chat-transcript (new)
- [x] named-entity-linking (new)
- [x] linkedin-post-plain (new)

### 1.3 Configure Access ✅
- Set up access.json with Jack's Google ID (`google:114339316701728183084`)
- Fixed UserRef format: `{id: "provider:uid", label: "..."}`

### 1.4 Update Connector ✅
- Changed `MARKETPLACE_REPO` to `cto4ai/crafty-skillport-marketplace`
- Fixed `fetchAccessConfig` to merge partial configs with defaults
- Deployed and tested successfully

---

## Phase 2: Clean Template for Open Source

**Target repo:** `skillport-marketplace-template` → rename to `skillport-marketplace`

### 2.1 Create Development Branch (preserve dev artifacts)
```bash
cd skillport-marketplace-template
git checkout -b development
git push -u origin development
```

### 2.2 Clean Main Branch
```bash
git checkout main

# Remove production plugins (keep example-skill, data-analyzer, meeting-digest, skillport-manager, skillport-code-manager)
rm -rf plugins/soil-data-analyzer plugins/csv-analyzer
rm -rf plugins/git-commit-generator plugins/catchup
rm -rf plugins/word-pair-swap
rm -rf plugins/json-formatter

# Remove dev artifacts
rm -rf docs/working docs/research

# Clean marketplace.json - keep example-skill, data-analyzer, meeting-digest, skillport-manager, skillport-code-manager
# Clean access.json - replace with placeholder

git add -A && git commit -m "chore: clean main for open source template"
git push
```

**Skills to retain as examples:**
- `example-skill` - Basic skill structure demo
- `data-analyzer` - Shows data processing patterns
- `meeting-digest` - Shows integration with external services (Fireflies)
- `skillport-manager` - Core skill for browsing/installing from marketplace (Claude.ai)
- `skillport-code-manager` - Core skill for browsing/installing from marketplace (Claude Code)

### 2.6 Rename Repo
- Rename `skillport-marketplace-template` → `skillport-marketplace`
- Update any references in connector docs

### 2.3 Update Config Files with Placeholders

**marketplace.json:**
```json
{
  "name": "your-marketplace",
  "owner": {
    "name": "Your Organization",
    "email": "plugins@example.com"
  },
  "plugins": [
    {
      "name": "example-skill",
      "source": "./plugins/example-skill",
      "description": "Example skill demonstrating the format",
      "version": "1.0.0"
    }
  ]
}
```

**access.json:**
```json
{
  "editors": [
    {
      "id": "google:YOUR_GOOGLE_ID_HERE",
      "label": "Your Name - your@email.com (get ID using whoami MCP tool)"
    }
  ]
}
```

### 2.4 Update README
- Clear setup instructions
- How to configure connector
- How to get Google ID
- How to add plugins
- Link to development branch for rich examples

### 2.5 Enable GitHub Template
In repo settings, check "Template repository"

### 2.7 Add License
- Add MIT LICENSE file to repo root

---

## Phase 3: Clean Connector for Open Source

### 3.1 Create Development Branch (same pattern as template)
```bash
cd skillport-connector
git checkout -b development
git push -u origin development
```

### 3.2 Clean Main Branch
```bash
git checkout main

# Remove dev artifacts
rm -rf docs/working docs/research

git add -A && git commit -m "chore: clean main for open source"
git push
```

### 3.3 Parameterize Configuration
In wrangler.toml:
```toml
[vars]
# MARKETPLACE_REPO = "your-org/your-marketplace"  # Uncomment and configure
```

### 3.3 Clean CLAUDE.md
- Remove hardcoded production URLs
- Make generic for any deployment

### 3.4 Keep Reference Docs
Keep in main:
- /docs/reference/project-overview.md
- /docs/reference/architecture-decisions.md
- /docs/reference/implementation-guide.md
- /docs/reference/access-control.md

### 3.5 Remove Development Files
- /docs/working/ (after archiving)
- /docs/research/ (after archiving)
- .claude/skills/catchup/ (move to marketplace template)

### 3.6 Add License
- Add MIT LICENSE file to repo root

---

## Phase 4: Deployment Model Decision

### Current Model
- Single connector deployment (Jack's)
- Points to single marketplace repo
- Users must deploy their own connector

### Alternative: Multi-tenant Connector
- One connector serves multiple marketplaces
- Marketplace repo passed as parameter
- More complex but more accessible

**Recommendation:** Start with current model, document "deploy your own connector" path clearly.

---

## Execution Order

1. **Create craftycto-skillport repo** (Jack's production instance)
2. **Migrate plugins** from template to new instance
3. **Update connector** to point to new instance
4. **Test** everything works with new instance
5. **Archive connector dev history** to branch
6. **Clean connector** main branch
7. **Archive template examples** to branch
8. **Clean template** main branch
9. **Update documentation** in both repos
10. **Publish** open source

---

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Production instance** | `crafty-skillport-marketplace` | ✅ Created and working |
| **Template repo name** | `skillport-marketplace` (drop "-template") | Cleaner name, GitHub marks it as template anyway |
| **Organization** | cto4ai | Keep existing org, no need for dedicated one |
| **License** | MIT | Most permissive, minimal restrictions |
| **Connector hosting** | Self-deploy only (for now) | No shared hosting planned; may revisit if demand |
| **Default branch** | `main` | Standard convention; `development` branch for dev artifacts |

## Open Questions

1. **Plugin marketplace:**
   - Should there be a central "community" marketplace?
   - Or only private org marketplaces?
