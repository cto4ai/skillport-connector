# Checkpoint: Plugin Marketplace Compliance & Deployment-Ready Docs

**Date:** 2026-01-16 16:00
**Status:** COMPLETED
**Branch:** development

## Objective

Make Skillport Connector deployment-ready for multiple organizations and fix Plugin Marketplace compliance issues across skill repos.

## Changes Made

### skillport-connector (development branch)

**Modified Files:**
- [README.md](../../../README.md) - Fixed clone vs fork guidance, Cloudflare $5/mo pricing
- [docs/reference/project-overview.md](../../reference/project-overview.md) - Updated clone URL, hosting description
- [docs/reference/architecture-decisions.md](../../reference/architecture-decisions.md) - $5/mo recommendation
- [docs/implementation/01-overview.md](../../implementation/01-overview.md) - Cloudflare pricing note

### skillport-connector (main branch - cherry-picked)

- Cherry-picked PR #25 (35c8e1d) - GOOGLE_ALLOWED_DOMAINS, dependency upgrades
- Cherry-picked docs fix (cba1fcf) - README and reference docs updates
- Both pushed to origin/main

### crafty-skillport-marketplace

**Skill Updates via Skillport API:**
- **skillport** 1.2.10 → 1.2.11: Fixed terminology in SKILL.md and authoring-skills.md
  - Clarified marketplace vs installed plugin.json paths
- **skillport-repo-utils** 1.1.0 → 1.1.2:
  - 1.1.1: copy-skill.sh filters out non-compliant .claude-plugin at skill level
  - 1.1.2: check-repo.sh detects non-compliant .claude-plugin folders

**Artifacts Removed:**
- `plugins/obsidian/skills/obsidian/.claude-plugin/` (non-compliant)
- `plugins/skillport/skills/skillport/.claude-plugin/` (non-compliant)

### skillport-marketplace (template)

- Copied updated skillport skill (1.2.11)
- Copied updated skillport-repo-utils skill (1.1.2)

### Local Skills (~/.claude/skills/)

- Reinstalled skillport-repo-utils (1.1.2)

## Key Decisions

1. **Clone vs Fork**: Clone directly for updates (`git pull`); fork only if customizing code
2. **Cloudflare Pricing**: $5/mo paid plan recommended; free tier has Durable Objects errors
3. **Plugin Marketplace Compliance**: `.claude-plugin/` belongs at plugin level only, not skill level
4. **Skill Updates via API**: All skill modifications done through Skillport API, not direct file edits

## Commits

### development branch
- cba1fcf: README and docs fixes (clone workflow, Cloudflare pricing)

### main branch
- Cherry-picked 35c8e1d (PR #25)
- Cherry-picked cba1fcf (docs fixes)

## Next Steps

1. Monitor for any additional deployment-ready issues
2. Consider adding GitHub Actions workflow for automated checks
3. Test full deployment flow with a new organization

## Notes

- Plugin Marketplace spec reference: claude-plugins-official repo
- Skill-level .claude-plugin folders were artifacts from copying installed skills back to marketplace
- skillport-repo-utils now prevents this issue (copy-skill.sh) and detects it (check-repo.sh)
