#!/bin/bash
# Catchup: Gather full context for Claude after conversation reset
# Single execution = single tool call = minimal context usage

echo "=== CURRENT BRANCH ==="
git branch --show-current

echo ""
echo "=== GIT STATUS ==="
git status -s

echo ""
echo "=== RECENT COMMITS ON MAIN ==="
git log --oneline -10 main 2>/dev/null || git log --oneline -10 origin/main 2>/dev/null || echo "(no main branch)"

echo ""
echo "=== COMMITS SINCE MAIN ==="
if git rev-parse origin/main >/dev/null 2>&1; then
    git log --oneline origin/main..HEAD 2>/dev/null || echo "(on main or no commits ahead)"
else
    git log --oneline main..HEAD 2>/dev/null || echo "(on main or no commits ahead)"
fi

echo ""
echo "=== CHANGED FILES VS MAIN ==="
if git rev-parse origin/main >/dev/null 2>&1; then
    git diff --stat origin/main...HEAD 2>/dev/null || echo "(none)"
else
    git diff --stat main...HEAD 2>/dev/null || echo "(none)"
fi

echo ""
echo "=== UNCOMMITTED CHANGES ==="
git diff --stat HEAD 2>/dev/null
if [ -z "$(git diff --stat HEAD 2>/dev/null)" ]; then
    echo "(none)"
fi

echo ""
echo "=== OPEN PRs ==="
gh pr list --state open 2>/dev/null || echo "(gh cli not available or no PRs)"

echo ""
echo "=== RECENTLY MERGED PRs ==="
gh pr list --state merged --limit 5 2>/dev/null || echo "(none)"

echo ""
echo "=== CURRENT BRANCH PR ==="
gh pr view 2>/dev/null || echo "(no PR for current branch)"

echo ""
echo "=== RECENT BRANCHES (by activity) ==="
git for-each-ref --sort=-committerdate refs/heads/ --format='%(refname:short) (%(committerdate:relative))' | head -5

echo ""
echo "=== LATEST CHECKPOINT ==="
CHECKPOINT=$(ls -t docs/working/checkpoints/*.md 2>/dev/null | head -1)
if [ -n "$CHECKPOINT" ]; then
    echo "File: $CHECKPOINT"
    echo "---"
    cat "$CHECKPOINT"
else
    echo "(no checkpoints found in docs/working/checkpoints/)"
fi
