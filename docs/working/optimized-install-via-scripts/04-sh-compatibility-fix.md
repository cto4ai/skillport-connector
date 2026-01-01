# Fix: install.sh for Claude.ai's /bin/sh environment

**Status:** 🔄 IN PROGRESS

## Problem 1: Command Syntax Error

Claude.ai's sandbox uses `/bin/sh` (dash), not bash. The current install approach fails:

```
/bin/sh: 1: Syntax error: "(" unexpected
```

The invocation `bash <(curl -sf .../install.sh) <token>` uses process substitution `<(...)` which is bash-only. When `/bin/sh` tries to parse this, it fails.

### Solution

Change from process substitution to pipe:

**Before:**
```bash
bash <(curl -sf https://skillport-connector.jack-ivers.workers.dev/install.sh) <token> --package
```

**After:**
```bash
curl -sf https://skillport-connector.jack-ivers.workers.dev/install.sh | bash -s -- <token> --package
```

The pipe pattern works because:
- `curl` runs in `/bin/sh` (no bash features needed)
- Output pipes to `bash` explicitly (script runs in bash)
- `-s --` passes arguments to the script

---

## Problem 2: Double-Slash Path

Script outputs `//skillport-manager.skill` because:
1. Claude.ai's cwd is `/` (root)
2. Script checks `if [ -w "$(pwd)" ]` - root is writable
3. `PACKAGE_DIR="$(pwd)"` becomes `/`
4. `SKILL_FILE="$PACKAGE_DIR/$SKILL_NAME.skill"` → `//skillport-manager.skill`

### Solution

Always use `/tmp` for package mode output instead of checking cwd writability.

**Before:**
```bash
if [ -w "$(pwd)" ]; then
  PACKAGE_DIR="$(pwd)"
else
  PACKAGE_DIR="/tmp"
fi
```

**After:**
```bash
PACKAGE_DIR="/tmp"
```

---

## Test Results (Claude.ai Bootstrap)

| Step | Result |
|------|--------|
| 1. `bash <(curl ...)` | ❌ Syntax error |
| 2. Claude retried with `curl ... \| bash -s ...` | ✅ exit code 0 (no output?) |
| 3. Claude retried with `curl -o /tmp/install.sh && bash /tmp/install.sh` | ✅ Worked |
| 4. Script output path | ⚠️ `//skillport-manager.skill` |
| 5. Claude used `find` to locate file | ✅ Found `/skillport-manager.skill` |
| 6. Presented file | ✅ Success |

**End result:** Successful, but messy. Fixes will make it work on first try with clean output.

---

---

## Problem 3: Stale Tip in list_skills

The `list_skills` tool response includes a tip that references `fetch_skill`, which was **removed**:

```
"Use fetch_skill with the skill name to get its files for installation."
```

This should now reference `install_skill`.

### Solution

Update the tip to:
```
"Skills are the installable units. Use install_skill to install a skill efficiently, or use fetch_skill_details to learn more about a skill before installing."
```

---

## Files to Modify

| File | Change | Priority |
|------|--------|----------|
| `src/mcp-server.ts:265` | Update command to pipe syntax | **Must fix** |
| `src/mcp-server.ts` (list_skills tip) | Update stale `fetch_skill` reference | **Must fix** |
| `src/index.ts` (install.sh) | Always use `/tmp` for package output | **Should fix** |
| `skillport-manager/SKILL.md` | Update example command | Nice to have |
| `skillport-code-manager/SKILL.md` | Update example command | Nice to have |

## Implementation

### 1. Fix command syntax in `src/mcp-server.ts` (line ~265)

```typescript
command: `curl -sf ${connectorUrl}/install.sh | bash -s -- ${token} --package`,
```

### 2. Fix stale tip in `src/mcp-server.ts` (list_skills tool)

Change:
```typescript
tip: "Skills are the installable units. Each skill belongs to a plugin. " +
     "Use fetch_skill with the skill name to get its files for installation.",
```

To:
```typescript
tip: "Skills are the installable units. Use install_skill to install a skill efficiently, " +
     "or use fetch_skill_details to learn more about a skill before installing.",
```

### 3. Fix install.sh package dir in `src/index.ts`

Change:
```bash
if [ -w "$(pwd)" ]; then
  PACKAGE_DIR="$(pwd)"
else
  PACKAGE_DIR="/tmp"
fi
```

To:
```bash
PACKAGE_DIR="/tmp"
```

### 4. Deploy connector

```bash
npm run deploy
```

### 5. Update SKILL.md files (skillport-marketplace-template)

Update example commands from:
```bash
bash <(curl -sf .../install.sh) <token> --package
```

To:
```bash
curl -sf .../install.sh | bash -s -- <token> --package
```

### 6. Test on Claude.ai
