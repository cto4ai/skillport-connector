# PTC-Based Edit & Create Workflow

## Problem

When `fetch_skill` was replaced with `install_skill` (PTC pattern), the ability to read skill files for editing was lost. `fetch_skill_details` only returns SKILL.md content, not all files.

Additionally, the create workflow currently requires passing full file contents through `save_skill`, which is inefficient and doesn't leverage PTC.

## Solution Overview

Add `fetch_skill_for_editing` tool using the same PTC pattern as `install_skill`:
- Returns a short-lived token and curl command
- Script downloads all skill files to a local directory for editing
- Editor modifies files locally, then uses `save_skill` to push changes

## Workflows

### Edit Existing Skill

1. Call `fetch_skill_for_editing` with skill name
2. Run curl command → files downloaded to `/tmp/skillport-edit/<skill>/`
3. Read/modify files locally
4. Call `save_skill` with updated file contents

### Create New Skill

Current flow works but is inefficient:
- Model generates file contents in memory
- Passes to `save_skill` which commits to GitHub

No immediate change needed for create - the current flow is acceptable since you're creating content from scratch. The inefficiency is in *editing* where you need to fetch existing content first.

## Files to Modify

### skillport-connector (this repo)

#### src/mcp-server.ts
Add `fetch_skill_for_editing` tool (~line 385, after `fetch_skill_details`):
- Check **write** access (only editors need to fetch for editing)
- Look up skill's files via GitHub API
- Generate token with skill name + file paths
- Store token in KV with 5-min TTL
- Return token + curl command

```typescript
this.server.tool(
  "fetch_skill_for_editing",
  "Fetch all files for an existing skill to edit locally. " +
    "Returns a command to download files. After editing, use save_skill to push changes.",
  { name: z.string().describe("Skill name") },
  async ({ name }) => { ... }
);
```

#### src/index.ts
Add `/edit.sh` endpoint (after `/install.sh`):
- Validate token from KV
- Fetch all skill files from GitHub
- Write to `/tmp/skillport-edit/<skill>/`
- Output directory path and file list

Script output format:
```
SKILL_DIR=/tmp/skillport-edit/my-skill
FILES:
  SKILL.md
  templates/example.md
  scripts/helper.py
```

### skillport-marketplace-template

#### plugins/skillport-manager/skills/skillport-manager/SKILL.md
Add "Edit a Skill" section documenting the workflow.

#### plugins/skillport-code-manager/skills/skillport-code-manager/SKILL.md
Add "Edit a Skill" section documenting the workflow.

## Token Payload

Stored in `OAUTH_KV` with key `edit:<token>` and 5-min TTL:
```json
{
  "skill": "my-skill",
  "plugin": "my-plugin",
  "files": ["SKILL.md", "templates/example.md", "scripts/helper.py"],
  "email": "user@example.com"
}
```

## Access Control

- `fetch_skill_for_editing` requires **write** access to the skill's plugin
- This distinguishes it from `install_skill` which only requires read access
- Editors need to edit; readers only need to install

## Script Details (/edit.sh)

```bash
#!/bin/bash
# Usage: curl -sf .../edit.sh | bash -s -- <token>

TOKEN="$1"
EDIT_DIR="/tmp/skillport-edit"

# Fetch token metadata (includes file list)
# For each file in list, fetch content and write to $EDIT_DIR/<skill>/<path>

echo "SKILL_DIR=$EDIT_DIR/$SKILL_NAME"
echo "FILES:"
for file in "${FILES[@]}"; do
  echo "  $file"
done
```

## Open Questions

1. Should we support editing multiple skills at once? (Probably not - keep it simple)
2. Should the edit directory be cleaned up automatically? (No - let user manage)
