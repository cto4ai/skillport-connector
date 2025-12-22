---
description: "Analyze all changes in current git branch"
allowed-tools:
  [
    "Bash(git for-each-ref:*)",
    "Bash(git ls-tree:*)",
    "Bash(git show:*)",
    "Bash(git branch:*)",
    "Bash(git log:*)",
    "Bash(git diff:*)",
    "Bash(git fetch:*)",
    "Bash(gh pr list:*)",
    "Bash(gh pr view:*)",
    "Read",
  ]
---

# Catchup Command

Quick summary of changes in current branch compared to main.

## Instructions

1. **Discover recent work across all branches:**
   - Fetch latest from remote first: `git fetch origin`
   - Get all local and remote branches sorted by recent activity: `git for-each-ref --sort=-committerdate refs/heads/ refs/remotes/origin/ --format='%(refname:short)' | head -10`
   - For each branch, find most recent checkpoint (if any):
     - `git ls-tree -r --name-only <branch> docs/checkpoints/ 2>/dev/null | grep '.md$' | sort -r | head -1`
   - Display as table showing:
     - Branch name (strip 'origin/' prefix for remote branches to avoid duplication)
     - Latest checkpoint timestamp and brief description (extracted from filename)
   - Read the most recent checkpoint file (across all branches) and show key details:
     - Branch, Status, Objective, Key findings
   - Skip this section if no checkpoints found

2. **Check for open PRs:**
   - Run: `gh pr list --state open` to see all open PRs
   - If current branch has an open PR, run: `gh pr view` to get PR details (title, URL, status)
   - Show PR URL and review status if available

3. **Get current branch overview:**
   - Run: `git branch --show-current`
   - Run: `git log --oneline origin/main..HEAD` (or `main..HEAD` if origin/main doesn't exist)

4. **Review current branch changes:**
   - Run: `git diff --stat origin/main...HEAD` for file-level summary
   - Run: `git diff origin/main...HEAD` for full changes (only if less than 5 files changed)

5. **Provide concise summary:**
   - Current branch name
   - Number of commits since main
   - Key files changed and brief description of changes
   - Main theme/objective of the work

Keep it brief - focus on helping understand what's in progress, not exhaustive detail.
