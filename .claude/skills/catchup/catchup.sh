#!/bin/bash
# Catchup: Gather full context for Claude after conversation reset
# Single execution = single tool call = minimal context usage

echo "=== CURRENT BRANCH ==="
git branch --show-current

echo ""
echo "=== GIT STATUS ==="
git status -s

echo ""
echo "=== RECENT COMMITS ON MAIN (last 3 with details) ==="
git log -3 --format="--- %h %s ---%n%b" main 2>/dev/null || git log -3 --format="--- %h %s ---%n%b" origin/main 2>/dev/null || echo "(no main branch)"

echo ""
echo "=== OLDER COMMITS ON MAIN (4-10) ==="
git log --oneline --skip=3 -7 main 2>/dev/null || git log --oneline --skip=3 -7 origin/main 2>/dev/null || echo "(none)"

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
echo "=== RECENTLY MODIFIED WORKING DOCS (last 7 days) ==="
# Find docs modified in last 7 days, show most recent first
find docs/working -type f -name "*.md" -mtime -7 2>/dev/null | while read -r f; do
    echo "$(stat -f '%m' "$f") $f"
done | sort -rn | head -10 | while read -r ts path; do
    mod_date=$(stat -f '%Sm' -t '%Y-%m-%d %H:%M' "$path")
    echo "$mod_date  $path"
done
if [ -z "$(find docs/working -type f -name "*.md" -mtime -7 2>/dev/null)" ]; then
    echo "(no docs modified in last 7 days)"
fi

echo ""
echo "=== ACTIVE WORKING DIRECTORY (most recent) ==="
# Find most recently modified working subdirectory (excluding checkpoints)
ACTIVE_DIR=$(find docs/working -mindepth 1 -maxdepth 1 -type d ! -name checkpoints -exec stat -f '%m %N' {} \; 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-)
if [ -n "$ACTIVE_DIR" ]; then
    echo "Directory: $ACTIVE_DIR"
    echo "Contents:"
    ls -la "$ACTIVE_DIR" 2>/dev/null
    echo ""
    echo "--- Files in directory ---"
    for f in "$ACTIVE_DIR"/*.md; do
        if [ -f "$f" ]; then
            echo ""
            echo "=== $(basename "$f") ==="
            cat "$f"
        fi
    done
else
    echo "(no active working directories)"
fi

echo ""
echo "=== LATEST CHECKPOINT ==="
CHECKPOINT=$(ls -t docs/working/checkpoints/*.md 2>/dev/null | head -1)
if [ -n "$CHECKPOINT" ]; then
    CHECKPOINT_DATE=$(stat -f '%Sm' -t '%Y-%m-%d' "$CHECKPOINT")
    echo "File: $CHECKPOINT (dated: $CHECKPOINT_DATE)"
    echo "---"
    cat "$CHECKPOINT"
else
    echo "(no checkpoints found in docs/working/checkpoints/)"
fi
