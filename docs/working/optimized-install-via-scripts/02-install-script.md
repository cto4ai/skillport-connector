# Phase 2: Install Script

## Overview

A bash script that:
1. Takes an install token as argument
2. Redeems token via REST API
3. Writes skill files to appropriate location
4. Optionally packages as `.skill` zip (for Claude.ai/Desktop)

The script is served directly from the connector at `/install.sh`.

---

## Usage

```bash
# Claude Code - writes to ~/.claude/skills/
bash <(curl -sf https://connector/install.sh) sk_install_xxx

# Claude.ai/Desktop - creates .skill zip file  
bash <(curl -sf https://connector/install.sh) sk_install_xxx --package
```

---

## Full Script

```bash
#!/bin/bash
set -e

# ============================================================================
# Skillport Installer
# Efficient skill installation using Programmatic Tool Calling (PTC)
# ============================================================================

TOKEN="$1"
PACKAGE_FLAG="$2"
CONNECTOR_URL="${SKILLPORT_CONNECTOR_URL:-https://skillport-connector.jack-ivers.workers.dev}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ----------------------------------------------------------------------------
# Validation
# ----------------------------------------------------------------------------

if [ -z "$TOKEN" ]; then
  echo -e "${RED}Error: No install token provided${NC}"
  echo ""
  echo "Usage: install.sh <token> [--package]"
  echo ""
  echo "Get a token by asking Claude: 'get an install token for <skill-name> from skillport'"
  exit 1
fi

if [[ ! "$TOKEN" =~ ^sk_install_ ]]; then
  echo -e "${RED}Error: Invalid token format${NC}"
  echo "Token should start with 'sk_install_'"
  exit 1
fi

# ----------------------------------------------------------------------------
# Determine output location
# ----------------------------------------------------------------------------

if [ "$PACKAGE_FLAG" = "--package" ]; then
  # Claude.ai/Desktop mode: write to temp dir, then package
  OUTPUT_DIR=$(mktemp -d)
  PACKAGE_MODE=true
  echo -e "${YELLOW}Package mode: will create .skill file${NC}"
else
  # Claude Code mode: write directly to skills directory
  OUTPUT_DIR="$HOME/.claude/skills"
  PACKAGE_MODE=false
  mkdir -p "$OUTPUT_DIR"
fi

# ----------------------------------------------------------------------------
# Fetch skill via token
# ----------------------------------------------------------------------------

echo "Fetching skill..."

RESPONSE=$(curl -sf "$CONNECTOR_URL/api/install/$TOKEN" 2>&1) || {
  HTTP_CODE=$?
  echo -e "${RED}Error: Failed to fetch skill${NC}"
  
  # Try to parse error message
  if echo "$RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('error','Unknown error'))" 2>/dev/null; then
    :
  else
    echo "HTTP error code: $HTTP_CODE"
  fi
  exit 1
}

# ----------------------------------------------------------------------------
# Parse and write files
# ----------------------------------------------------------------------------

echo "$RESPONSE" | python3 << 'PYTHON_SCRIPT'
import json
import sys
import os

data = json.load(sys.stdin)

if 'error' in data:
    print(f"\033[0;31mError: {data['error']}\033[0m", file=sys.stderr)
    sys.exit(1)

skill_name = data['skill']['name']
skill_version = data['skill']['version']
output_base = os.environ.get('OUTPUT_DIR', os.path.expanduser('~/.claude/skills'))
skill_dir = os.path.join(output_base, skill_name)

print(f"Installing {skill_name} v{skill_version}...")

# Track files written
files_written = 0

for f in data.get('files', []):
    rel_path = f['path']
    content = f['content']
    
    # Handle base64-encoded files
    if f.get('encoding') == 'base64':
        import base64
        content = base64.b64decode(content).decode('utf-8')
    
    file_path = os.path.join(skill_dir, rel_path)
    dir_path = os.path.dirname(file_path)
    
    # Create directory if needed
    os.makedirs(dir_path, exist_ok=True)
    
    # Write file
    with open(file_path, 'w') as out:
        out.write(content)
    
    # Make scripts executable
    if rel_path.endswith('.py') or rel_path.endswith('.sh'):
        os.chmod(file_path, 0o755)
    
    files_written += 1
    print(f"  ✓ {rel_path}")

# Write metadata for package mode
if os.environ.get('PACKAGE_MODE') == 'true':
    # Store skill name for packaging step
    with open(os.path.join(output_base, '.skill_name'), 'w') as f:
        f.write(skill_name)
    with open(os.path.join(output_base, '.skill_version'), 'w') as f:
        f.write(skill_version)

print(f"\n\033[0;32m✓ Wrote {files_written} files to {skill_dir}\033[0m")
PYTHON_SCRIPT

# Export for Python script
export OUTPUT_DIR
export PACKAGE_MODE

# ----------------------------------------------------------------------------
# Package mode: create .skill zip
# ----------------------------------------------------------------------------

if [ "$PACKAGE_MODE" = true ]; then
  SKILL_NAME=$(cat "$OUTPUT_DIR/.skill_name")
  SKILL_VERSION=$(cat "$OUTPUT_DIR/.skill_version")
  SKILL_DIR="$OUTPUT_DIR/$SKILL_NAME"
  
  # Determine where to put the .skill file
  # Use current directory or /tmp if not writable
  if [ -w "$(pwd)" ]; then
    PACKAGE_DIR="$(pwd)"
  else
    PACKAGE_DIR="/tmp"
  fi
  
  SKILL_FILE="$PACKAGE_DIR/$SKILL_NAME.skill"
  
  echo ""
  echo "Creating package..."
  
  # Create zip with skill name as root directory
  cd "$OUTPUT_DIR"
  zip -rq "$SKILL_FILE" "$SKILL_NAME"
  
  echo -e "${GREEN}✓ Created $SKILL_FILE${NC}"
  echo ""
  echo "Next steps:"
  echo "  1. Claude will present this file"
  echo "  2. Click 'Copy to your skills'"
  echo "  3. Start a new conversation to use the skill"
  
  # Output the path for Claude to use with present_files
  echo ""
  echo "SKILL_FILE=$SKILL_FILE"
  
  # Cleanup temp directory
  rm -rf "$OUTPUT_DIR"
else
  # Claude Code mode
  echo ""
  echo -e "${GREEN}✓ Installation complete${NC}"
  echo ""
  echo "Next step: Start a new Claude Code conversation to use this skill."
fi
```

---

## Script Behavior by Surface

### Claude Code

```bash
bash <(curl -sf .../install.sh) sk_install_xxx
```

1. Creates `~/.claude/skills/<skill-name>/`
2. Writes all files directly
3. Makes `.py` and `.sh` files executable
4. Prints success message

**Output:**
```
Fetching skill...
Installing data-analyzer v1.1.3...
  ✓ SKILL.md
  ✓ scripts/analyze_data.py
  ✓ scripts/quality_check.py
  ✓ references/supported_formats.md

✓ Wrote 4 files to /Users/jack/.claude/skills/data-analyzer

Next step: Start a new Claude Code conversation to use this skill.
```

### Claude.ai / Desktop

```bash
bash <(curl -sf .../install.sh) sk_install_xxx --package
```

1. Creates temp directory
2. Writes files to temp
3. Zips into `<skill-name>.skill`
4. Outputs path for `present_files`
5. Cleans up temp

**Output:**
```
Package mode: will create .skill file
Fetching skill...
Installing data-analyzer v1.1.3...
  ✓ SKILL.md
  ✓ scripts/analyze_data.py
  ✓ scripts/quality_check.py
  ✓ references/supported_formats.md

✓ Wrote 4 files to /var/folders/.../data-analyzer

Creating package...
✓ Created /home/claude/data-analyzer.skill

Next steps:
  1. Claude will present this file
  2. Click 'Copy to your skills'
  3. Start a new conversation to use the skill

SKILL_FILE=/home/claude/data-analyzer.skill
```

---

## Error Handling

### Invalid Token

```
Error: Invalid token format
Token should start with 'sk_install_'
```

### Expired Token

```
Error: Failed to fetch skill
Token not found or expired
```

### Already Used Token

```
Error: Failed to fetch skill
Token already used
```

### Network Error

```
Error: Failed to fetch skill
HTTP error code: 7
```

---

## Dependencies

All standard on macOS/Linux:

| Tool | Purpose | Fallback |
|------|---------|----------|
| `bash` | Script execution | None needed |
| `curl` | HTTP requests | None needed |
| `python3` | JSON parsing, file writing | None needed |
| `zip` | Package creation (--package only) | Pre-installed on macOS |

---

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `SKILLPORT_CONNECTOR_URL` | `https://skillport-connector.jack-ivers.workers.dev` | Override connector URL |

---

## How Claude Uses This

### Claude Code (via skillport-code-manager)

```markdown
When user asks to install a skill from Skillport:

1. Call `install_skill` with the skill name
2. Run the bash command (no flag):
   ```bash
   bash <(curl -sf https://connector/install.sh) <token>
   ```
3. Report success and remind user to restart Claude Code
```

### Claude.ai / Desktop (via skillport-manager)

```markdown
When user asks to install a skill from Skillport:

1. Call `install_skill` with the skill name
2. Run the bash command with --package flag:
   ```bash
   bash <(curl -sf https://connector/install.sh) <token> --package
   ```
3. Parse the SKILL_FILE path from output
4. Call `present_files` with that path
5. Tell user to click "Copy to your skills"
```

---

## Testing

### Manual Test - Claude Code

```bash
# Get a token (via Claude or direct MCP call)
TOKEN="sk_install_test123"

# Run install
bash <(curl -sf https://skillport-connector.jack-ivers.workers.dev/install.sh) $TOKEN

# Verify files
ls -la ~/.claude/skills/data-analyzer/
```

### Manual Test - Package Mode

```bash
# Run with --package
bash <(curl -sf https://skillport-connector.jack-ivers.workers.dev/install.sh) $TOKEN --package

# Verify .skill file
ls -la *.skill
unzip -l data-analyzer.skill
```

### Error Cases

```bash
# No token
bash <(curl -sf .../install.sh)
# Expected: Error message about missing token

# Invalid token
bash <(curl -sf .../install.sh) invalid_token
# Expected: Error about invalid format

# Expired/used token
bash <(curl -sf .../install.sh) sk_install_already_used
# Expected: Error from API
```

---

## Alternative: Embedded Script

Instead of `curl | bash`, we could embed the script in the skillport-manager skill itself:

```
skillport-manager/
├── SKILL.md
├── scripts/
│   ├── install.sh      ← Local copy
│   ├── package_skill.py
│   └── get_versions.py
```

**Pros:**
- Works offline after skill is installed
- No network request for script

**Cons:**
- Script version tied to skill version
- Harder to update script independently

**Recommendation:** Serve from connector for now. Easier to iterate on script without updating the skill.
