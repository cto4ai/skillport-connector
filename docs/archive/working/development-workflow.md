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

## Worktree Structure (Implemented January 2026)

### Motivation

With parallel Claude Code agents working on separate features, constantly switching branches becomes a bottleneck. Git worktrees allow multiple branches to be checked out simultaneously in separate directories, enabling:

- Multiple Claude Code instances working on different features in parallel
- No branch switching—each feature has its own isolated file state
- Cleaner mental model: branches as physical directories you can `cd` into

### Bare Repository + Grouped Worktrees Pattern

Instead of having one "main clone" on a particular branch, use a bare repository (git database only) with all branches as peer worktrees:

```
/Users/jackivers/Projects/skillport/skillport-connector/
├── .bare/                 # git database (no working files)
├── .git                   # file pointing to .bare
├── main/                  # worktree - clean public branch
├── development/           # worktree - ongoing dev work
├── feature-oauth/         # worktree - active feature (temporary)
└── feature-notifications/ # worktree - another active feature (temporary)

/Users/jackivers/Projects/skillport/skillport-marketplace/
├── .bare/
├── .git
├── main/
├── development/
├── feature-oauth/         # cross-repo feature, same branch name
└── feature-notifications/

/Users/jackivers/Projects/skillport/crafty-skillport-marketplace/
├── .bare/
├── .git
├── main/
├── development/
├── feature-oauth/
└── feature-notifications/
```

### Initial Setup

**For skillport-connector:**

```bash
# Backup and restructure
cd /Users/jackivers/Projects/skillport
mv skillport-connector skillport-connector-old

# Create new structure with bare repo
mkdir skillport-connector
cd skillport-connector
git clone --bare git@github.com:cto4ai/skillport-connector.git .bare

# Create .git file pointing to bare repo
echo "gitdir: $(pwd)/.bare" > .git

# Fix fetch config (bare clone defaults to fetching only HEAD)
git config remote.origin.fetch "+refs/heads/*:refs/remotes/origin/*"
git fetch origin

# Create worktrees for persistent branches
git worktree add main main
git worktree add development development

# Set upstream tracking
cd main && git branch -u origin/main && cd ..
cd development && git branch -u origin/development && cd ..

# Clean up old clone after verifying
rm -rf ../skillport-connector-old
```

**For skillport-marketplace:**

```bash
cd /Users/jackivers/Projects/skillport
mv skillport-marketplace skillport-marketplace-old

mkdir skillport-marketplace
cd skillport-marketplace
git clone --bare git@github.com:cto4ai/skillport-marketplace.git .bare
echo "gitdir: $(pwd)/.bare" > .git

# Fix fetch config and set upstream tracking
git config remote.origin.fetch "+refs/heads/*:refs/remotes/origin/*"
git fetch origin
git worktree add main main
git worktree add development development
cd main && git branch -u origin/main && cd ..
cd development && git branch -u origin/development && cd ..

rm -rf ../skillport-marketplace-old
```

**For crafty-skillport-marketplace (instance repo):**

```bash
cd /Users/jackivers/Projects/skillport
mv crafty-skillport-marketplace crafty-skillport-marketplace-old

mkdir crafty-skillport-marketplace
cd crafty-skillport-marketplace
git clone --bare git@github.com:cto4ai/crafty-skillport-marketplace.git .bare
echo "gitdir: $(pwd)/.bare" > .git

# Fix fetch config and set upstream tracking
git config remote.origin.fetch "+refs/heads/*:refs/remotes/origin/*"
git fetch origin
git worktree add main main  # crafty only has main branch
cd main && git branch -u origin/main && cd ..

rm -rf ../crafty-skillport-marketplace-old
```

### Feature Branch Workflow

**Starting a feature:**

```bash
cd /Users/jackivers/Projects/skillport/skillport-connector
git worktree add feature-oauth development -b feature-oauth

# If the feature spans both repos:
cd /Users/jackivers/Projects/skillport/skillport-marketplace
git worktree add feature-oauth development -b feature-oauth
```

**Working on the feature:**

```bash
cd /Users/jackivers/Projects/skillport/skillport-connector/feature-oauth
claude  # Claude Code works in isolated directory
```

**Creating a PR:**

```bash
cd /Users/jackivers/Projects/skillport/skillport-connector/feature-oauth
git push -u origin feature-oauth
gh pr create --base development  # Always target development, not main
```

**After merge, clean up:**

```bash
cd /Users/jackivers/Projects/skillport/skillport-connector
git worktree remove feature-oauth
git branch -d feature-oauth

# Update development worktree
cd development
git pull
```

### Cross-Repo Features

For features touching both connector and marketplace, use the same branch name in both repos:

```bash
# Setup
cd /Users/jackivers/Projects/skillport/skillport-connector
git worktree add feature-oauth development -b feature-oauth

cd /Users/jackivers/Projects/skillport/skillport-marketplace  
git worktree add feature-oauth development -b feature-oauth

# Work with parallel Claude Code instances
# Terminal 1: claude in skillport-connector/feature-oauth/
# Terminal 2: claude in skillport-marketplace/feature-oauth/

# Create PRs in both repos
cd /Users/jackivers/Projects/skillport/skillport-connector/feature-oauth
gh pr create --base development

cd /Users/jackivers/Projects/skillport/skillport-marketplace/feature-oauth
gh pr create --base development
```

### Directory Structure Comparison

**Before (basic branching):**
```
/Users/jackivers/Projects/skillport/
├── skillport-connector/          # single clone, switch branches
├── skillport-marketplace/        # single clone, switch branches
└── crafty-skillport-marketplace/ # single clone, switch branches
```

**After (worktrees):**
```
/Users/jackivers/Projects/skillport/
├── skillport-connector/
│   ├── .bare/
│   ├── main/
│   ├── development/
│   └── feature-*/              # as needed
├── skillport-marketplace/
│   ├── .bare/
│   ├── main/
│   ├── development/
│   └── feature-*/              # as needed
└── crafty-skillport-marketplace/
    ├── .bare/
    ├── main/
    ├── development/
    └── feature-*/              # as needed
```

### IDE/Workspace Considerations

Each worktree is a full directory that can be opened independently:

- **Cursor/VS Code**: Open the specific worktree directory (e.g., `skillport-connector/feature-oauth/`)
- **Cross-repo workspace**: Create a workspace containing both repos' worktrees for the same feature
- **AeroSpace**: Dedicate a workspace to a feature, with terminal panes for each repo's worktree

### Key Differences from Basic Branching

| Aspect | Basic Branching | Worktrees |
|--------|-----------------|------------|
| Switching context | `git checkout branch` | `cd ../branch-dir` |
| Parallel features | Not possible | Multiple directories |
| Uncommitted changes | Must stash or commit | Isolated per worktree |
| Claude Code parallelism | One at a time | Multiple simultaneous |
| Disk space | Single copy | Multiple copies (shallow) |

### Deployment Workflow

With worktrees, deployment happens from a specific worktree directory, not the repo root.

**For skillport-connector:**

```bash
# Deploy from development worktree (typical)
cd /Users/jackivers/Projects/skillport/skillport-connector/development
npx wrangler deploy

# Deploy from main worktree (production release)
cd /Users/jackivers/Projects/skillport/skillport-connector/main
npx wrangler deploy
```

**Important:** Each worktree has its own `wrangler.toml`. Keep deployment config (secrets, KV bindings) consistent across worktrees, or designate one worktree as the canonical deploy source.

**Recommendation:** Use `development/` as the primary deploy source for ongoing work. Only deploy from `main/` for tagged releases.

### Workspace File Updates

The VS Code workspace file needs updated paths after migration:

**Before (basic branching):**
```json
{
  "folders": [
    { "path": "." },
    { "path": "../skillport-marketplace" },
    { "path": "../crafty-skillport-marketplace" }
  ]
}
```

**After (worktrees):**
```json
{
  "folders": [
    { "path": "development" },
    { "path": "../skillport-marketplace/development" },
    { "path": "../crafty-skillport-marketplace/development" }
  ]
}
```

The workspace file should live at the repo root level (alongside `.bare/`), not inside a worktree.

**Feature-specific workspaces:** For cross-repo features, create temporary workspace files:

```json
// skillport-oauth-feature.code-workspace
{
  "folders": [
    { "path": "skillport-connector/feature-oauth" },
    { "path": "skillport-marketplace/feature-oauth" }
  ]
}
```

### Per-Worktree Dependencies

Each worktree needs its own `node_modules`:

```bash
cd /Users/jackivers/Projects/skillport/skillport-connector/development
npm install

cd /Users/jackivers/Projects/skillport/skillport-connector/feature-oauth
npm install
```

This is correct behavior—each worktree may have different dependencies if branches diverge. The disk space overhead is minimal for these projects.
