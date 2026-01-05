# Development Workflow for Open Source Repos

## Overview

Both `skillport-marketplace-template` and `skillport-connector` need to support:
1. Clean `main` branch for users/open source
2. Ongoing development with checkpoints, working docs, experiments

## Branch Strategy

### Main Branch (what users get)
- Clean, minimal, well-documented
- No dev artifacts (checkpoints, working docs)
- Ready to use as template or clone

### Development Branch (where we work)
- Full dev workflow with `docs/working/`, checkpoints
- Can have experiments, research notes
- Cherry-pick or clean merge to main when releasing

```
main          ─────●─────────────●─────────────●───────
                   │             │             │
                   │  release    │  release    │  release
                   │             │             │
development  ──●──●──●──●──●──●──●──●──●──●──●──●──●──●──
               │     │        │     │        │
               dev   dev      dev   dev      dev
```

## Workflow

### Day-to-Day Development (on `development` branch)
```bash
git checkout development
# Work normally, use checkpoints, docs/working/, etc.
git add -A && git commit -m "WIP: feature X"
git push
```

### Releasing to Main
When ready to release clean changes:

**Option A: Cherry-pick specific commits**
```bash
git checkout main
git cherry-pick <commit-sha>  # Pick only the clean commits
git push
```

**Option B: Squash merge (cleaner history)**
```bash
git checkout main
git merge --squash development
# Edit commit message to summarize changes
git commit -m "feat: add X, fix Y"
git push
```

**Option C: Create release PR**
```bash
git checkout -b release/v1.2.0 development
# Remove dev artifacts if any leaked in
rm -rf docs/working/checkpoints/*
git add -A && git commit -m "chore: prep release"
# PR from release/v1.2.0 → main
```

## What Goes Where

### In `main` (clean)
- `README.md` - User-facing docs
- `CLAUDE.md` - Project instructions
- `docs/reference/` - Permanent reference docs
- `plugins/example-skill/` - Minimal example
- `.claude/commands/` - Generic helper commands
- `.skillport/access.json` - With placeholder values

### In `development` (dev artifacts OK)
- Everything in main, plus:
- `docs/working/` - Checkpoints, plans, experiments
- `docs/research/` - Research notes
- Your production plugins (for testing)
- `.claude/skills/catchup/` - Dev-specific skills

## Initial Setup

### For skillport-marketplace-template
```bash
# Create development branch from current state (has all dev artifacts)
git checkout -b development
git push -u origin development

# Clean up main
git checkout main
# Remove dev artifacts, keep only template essentials
rm -rf docs/working docs/research
# Remove production plugins, keep example-skill
rm -rf plugins/data-analyzer plugins/soil-data-analyzer ...
git add -A && git commit -m "chore: clean main for open source"
git push
```

### For skillport-connector
```bash
# Same pattern
git checkout -b development
git push -u origin development

git checkout main
rm -rf docs/working docs/research
# Parameterize hardcoded values
git add -A && git commit -m "chore: clean main for open source"
git push
```

## Keeping Branches in Sync

### Syncing main → development (safe, do often)

Merge main into development to keep them aligned:
```bash
git checkout development
git merge main
git push
```

This is always safe because `main` is a subset of `development`.

**Important:** After the initial clean-up of main, merging main into development won't delete your dev artifacts. Here's why:

1. main deletes docs/working → commit A
2. development merges A → docs gone (one-time event)
3. development adds docs back → commit B ← **key commit**
4. main adds feature X → commit C
5. development merges C → docs stay (because B explicitly added them)

Git merge preserves both sides' intentional changes. Since development has a commit that explicitly adds the dev docs *after* the merge point where they were deleted, future merges from main won't remove them.

### Syncing development → main (selective)

When you develop something in `development` that should go to the clean template, use selective checkout:
```bash
git checkout main
git checkout development -- path/to/specific/file
git add -A && git commit -m "feat: add specific feature"
git push
```

Or use cherry-pick for specific commits (see "Releasing to Main" above).

**Never** do a full merge from development → main, as it would pull dev artifacts into the clean template.

## Questions to Resolve

1. **Default branch** - Should GitHub default to `main` or `development`?
   - Recommendation: Keep `main` as default (what users see first)

2. **Branch protection** - Should `main` require PRs?
   - Recommendation: Yes, for connector. Optional for template.

3. **Checkpoint location** - Should checkpoints go in repo or separate?
   - Recommendation: Keep in `development` branch, they're useful context
