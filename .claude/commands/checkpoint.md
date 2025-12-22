---
description: "Create a checkpoint document capturing current work in progress"
allowed-tools: ["Bash(git:*)", "Read", "Glob", "Write"]
---

# Checkpoint Command

Create a focused checkpoint document capturing current work state in `docs/checkpoints/`.

## Instructions

### 1. Quick Context Gathering

- Summarize recent conversation and activity in this session
- Run `git branch --show-current` and `git status`
- Run `git log --oneline -5` for recent commits
- List `docs/checkpoints/` to see most recent checkpoint (optional: read it briefly)

### 2. Create Checkpoint File

**Filename:** `docs/checkpoints/YYYY-MM-DD-HHMM-brief-description.md`

**Simplified Structure:**

```markdown
# Checkpoint: [Brief Title]

**Date:** [Current Date and Time (YYYY-MM-DD HH:MM:SS)]
**Status:** IN PROGRESS | PAUSED | COMPLETED | BLOCKED
**Branch:** [Branch Name]

## Objective

[1-2 sentences: what this work aims to accomplish]

## Changes Made

**Modified Files:**

- [file/path.ext](file/path.ext) - Brief description
- [file/path.ext](file/path.ext) - Brief description

**Commits:**

- Brief summary of commits since last checkpoint or main

## Key Issues/Findings (if any)

- Issue 1: Brief description
- Issue 2: Brief description

## Testing

- What was tested
- Key results or metrics (if applicable)

## Next Steps

1. [Next immediate task]
2. [Following task]
3. [Any open questions or decisions needed]

## Notes

[Any other relevant context, insights, or decisions made]

---

**Last Updated:** [YYYY-MM-DD HH:MM:SS]
```

### 3. Save

- Write to `docs/checkpoints/`
- Tell user where it was saved and what was captured

## Guidelines

- **Be concise** - focus on essential info only
- **Skip empty sections** - if no issues, don't include that section
- **Use relative links** for files
- **Keep it fast** - this should take 1-2 minutes, not 10
