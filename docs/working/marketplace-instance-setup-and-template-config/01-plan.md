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

## Phase 1: Create Jack's Production Marketplace

### 1.1 Create New Repo
- Name: `craftycto-skillport` (or `craftycto-marketplace`)
- Private repo under cto4ai org
- Initialize from clean template structure (not from current template)

### 1.2 Migrate Production Plugins
Move these from template to new instance:
- [ ] skillport-manager
- [ ] skillport-code-manager
- [ ] data-analyzer
- [ ] soil-data-analyzer
- [ ] csv-analyzer
- [ ] meeting-digest
- [ ] git-commit-generator
- [ ] catchup
- [ ] word-pair-swap

### 1.3 Configure Access
- Set up access.json with Jack's Google ID
- Configure any team members

### 1.4 Update Connector
- Change `MARKETPLACE_REPO` to point to new instance
- Deploy updated connector

---

## Phase 2: Clean Template for Open Source

### 2.1 Create Development Branch (preserve dev artifacts)
```bash
cd skillport-marketplace-template
git checkout -b development
git push -u origin development
```

### 2.2 Clean Main Branch
```bash
git checkout main

# Remove production plugins (keep only example-skill)
rm -rf plugins/data-analyzer plugins/soil-data-analyzer plugins/csv-analyzer
rm -rf plugins/meeting-digest plugins/git-commit-generator plugins/catchup
rm -rf plugins/word-pair-swap plugins/skillport-manager plugins/skillport-code-manager

# Remove dev artifacts
rm -rf docs/working docs/research

# Clean marketplace.json - remove all plugins except example-skill
# Clean access.json - replace with placeholder

git add -A && git commit -m "chore: clean main for open source template"
git push
```

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
      "provider": "google",
      "id": "YOUR_GOOGLE_ID_HERE",
      "comment": "Get your ID using the whoami MCP tool"
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

## Open Questions

1. **Repo naming:**
   - `skillport-marketplace-template` vs `skillport-template` vs `skillport-marketplace`
   - `skillport-connector` vs `skillport-bridge` vs `skillport-mcp`

2. **Organization:**
   - Keep under cto4ai or move to dedicated org?
   - License choice (MIT?)

3. **Connector hosting:**
   - Will we offer a public hosted connector?
   - Or require users to deploy their own?

4. **Plugin marketplace:**
   - Should there be a central "community" marketplace?
   - Or only private org marketplaces?
