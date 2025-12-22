---
description: "Add all changes, commit with descriptive message, and push to remote"
allowed-tools: ["Bash(git:*)"]
---

# ACP Command (Add, Commit, Push)

Automated workflow to add all uncommitted changes, create a commit with an appropriate medium-detailed message, and push to the remote branch.

## Instructions

### 1. Review Current Changes

Run in parallel:

```bash
git status
git diff --stat
```

**If there are no changes:**

- Inform the user that working tree is clean
- Exit without doing anything

### 2. Analyze Changes

Quickly determine change type from file patterns:

- `.md` in `docs/checkpoints/` → checkpoint
- `.md` in `docs/` → docs
- `prompts/*.md` → prompt
- `schemas/*.py` → schema
- `.env.sample` or config files → chore
- Code files with tests → test or feature
- Code files only → fix, feature, or refactor

**Common change types:**

- `feature` - New functionality
- `fix` - Bug fixes
- `docs` - Documentation updates
- `refactor` - Code restructuring without behavior change
- `test` - Adding or updating tests
- `chore` - Maintenance tasks (dependencies, config, tooling)
- `checkpoint` - Work in progress documentation
- `prompt` - AI prompt modifications
- `schema` - Data model changes

### 3. Generate Commit Message

**Create a medium-detailed commit message following this format:**

```
[type]: Brief one-line summary (50-72 chars)

- Detail about change 1
- Detail about change 2
- Detail about change 3
(if needed)

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

**Guidelines:**

- **First line:** Imperative mood, capitalize first word, no period at end
- **Details:** Use bullet points for multiple changes, be specific but concise
- **Scope:** If changes affect specific component, mention it
- **Context:** Add brief context if helpful but don't be overly verbose

**Examples:**

Single file documentation:

```
docs: Add test output tracking section to CLAUDE.md

- Document why output/ directory is tracked in git
- Explain purpose of .json, .md, and .meta.json files
- Clarify cleanup strategy for old test outputs

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

Multiple related files:

```
chore: Add checkpoint command and document current work status

- Create /checkpoint slash command for work in progress documentation
- Add comprehensive checkpoint for Nov 4 work (field omission fix)
- Update CLAUDE.md with minor formatting improvements

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

Bug fix with evidence:

```
fix: Remove conflicting field omission instruction from prompt

- Delete line 6 that instructed model to omit fields
- Fixes 68.75% failure rate on standalone sample bags
- Validated with full test run (16/16 success)

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

### 4. Execute Git Workflow

Run sequentially:

```bash
git add -A && git commit -m "$(cat <<'EOF'
[Your commit message here]
EOF
)" && git push
```

**Safety check before commit:**

- Warn if .env files or credentials detected
- Confirm not on main branch (warn if true)

### 5. Report Results

Report commit hash and push status only. Skip detailed file listing.

## Important Notes

### Safety Checks

1. **Never commit sensitive files:**
   - .env files
   - API keys
   - Credentials
   - Private configuration
     Warn user and ask for confirmation if such files are detected

2. **Verify branch:**
   - Confirm not on `main` branch (should work from feature branch)
   - If on main, warn user and ask for confirmation

3. **Check for conflicts:**
   - If push fails due to conflicts, inform user
   - Provide clear next steps

### When NOT to Use This Command

- When you need to review changes carefully before committing
- When you want to commit only specific files (use manual git workflow)
- When writing a more detailed or complex commit message
- When changes span multiple logical commits that should be separate

### Message Quality Guidelines

**Good commit messages:**

- `docs: Add checkpoint command for work in progress documentation`
- `fix: Resolve field omission bug in sample bag prompt`
- `chore: Update dependencies and merge main branch`
- `refactor: Simplify prompt by removing JSON format examples`

**Avoid:**

- `wip` or `temp` (not descriptive)
- `fixes stuff` (too vague)
- `update files` (doesn't explain what or why)
- `changes` (meaningless)

## Example Usage

```
/acp
```

This will:

1. Check git status
2. Analyze all uncommitted changes
3. Generate appropriate commit message
4. Stage all changes with `git add -A`
5. Commit with generated message
6. Push to current branch
7. Report results

## Following CLAUDE.md Git Workflow

This command follows the project's git workflow:

- Always work on feature branches (never commit directly to main)
- Use descriptive commit messages
- Include Claude Code attribution
- Push changes to remote for team visibility

The command is a convenience for routine commits during active development.
