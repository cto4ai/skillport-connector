# Skillport Skill (SKILL.md)

This is what the Skillport skill's SKILL.md would contain. This skill teaches Claude how to interact with the Skillport API after obtaining an auth token.

---

```markdown
---
name: skillport
description: Manage skills from the Skillport marketplace. Search, install, create, edit, and publish skills. Requires calling skillport_auth MCP tool first to get an authenticated session.
---

# Skillport Skill

Skillport is a marketplace for Claude Skills. This skill teaches you how to interact with the Skillport API.

## Prerequisites

Before using any Skillport operation, you MUST get an auth token:

1. Call the `skillport_auth` MCP tool (no parameters needed)
2. You'll receive a `token` and `base_url`
3. The token expires in 5 minutes — get a new one if needed

## Quick Reference

| Operation | Method | Endpoint |
|-----------|--------|----------|
| List skills | GET | `/api/skills` |
| Get skill details | GET | `/api/skills/{name}` |
| Install skill | GET | `/api/skills/{name}/install` |
| Save skill | POST | `/api/skills/{name}` |
| Delete skill | DELETE | `/api/skills/{name}?confirm=true` |
| Bump version | POST | `/api/skills/{name}/bump` |
| Publish skill | POST | `/api/skills/{name}/publish` |
| Check updates | POST | `/api/check-updates` |
| Who am I | GET | `/api/whoami` |

## Operations

### List Available Skills

Find skills in the marketplace.

**Bash (simple):**
```bash
curl -sf "${base_url}/api/skills" -H "Authorization: Bearer ${token}"
```

**Python (with filtering):**
```python
import requests

response = requests.get(
    f"{base_url}/api/skills",
    headers={"Authorization": f"Bearer {token}"}
)
skills = response.json()["skills"]

# Filter by tag
data_skills = [s for s in skills if "data" in s.get("tags", [])]
for skill in data_skills:
    print(f"{skill['name']}: {skill['description']}")
```

---

### Get Skill Details

View a skill's SKILL.md content and metadata.

```bash
curl -sf "${base_url}/api/skills/soil-analyzer" -H "Authorization: Bearer ${token}"
```

Response includes `skill_md` with the full SKILL.md content.

---

### Install a Skill

Download a skill package for the user to install.

**Step 1: Get install command**
```bash
curl -sf "${base_url}/api/skills/soil-analyzer/install" -H "Authorization: Bearer ${token}"
```

**Step 2: Execute the returned command**
The response includes a `command` field. Execute it:
```bash
curl -sf ${base_url}/install.sh | bash -s -- ${install_token} --package
```

**Step 3: Present the file**
Find the `SKILL_FILE=` path in the output and call `present_files` with it.

**Step 4: Instruct user**
Tell the user to:
1. Download the .zip file
2. Go to Claude Settings > Capabilities > Skills
3. Upload the .zip
4. Start a new conversation

---

### Create or Update a Skill

Save skill files to the marketplace.

**Python (recommended for multi-file operations):**
```python
import requests
import json

skill_md = """---
name: my-skill
description: Does something useful
---

# My Skill

Instructions for using this skill...
"""

payload = {
    "skill_group": "my-skills",  # Optional for new skills
    "files": [
        {"path": "SKILL.md", "content": skill_md},
        {"path": "scripts/helper.py", "content": "# helper code..."}
    ],
    "commitMessage": "Initial skill creation"
}

response = requests.post(
    f"{base_url}/api/skills/my-skill",
    headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    },
    json=payload
)
print(response.json())
```

**Important notes:**
- `SKILL.md` is required and must have `name` and `description` in frontmatter
- Paths are relative to the skill directory
- Empty content string deletes a file (except SKILL.md)
- New skills require `skill_group` (defaults to skill name if omitted)

---

### Delete a Skill

Permanently remove a skill from the marketplace.

```bash
curl -X DELETE "${base_url}/api/skills/my-skill?confirm=true" \
  -H "Authorization: Bearer ${token}"
```

**Warning:** This is irreversible. The `confirm=true` parameter is required.

---

### Bump Version

Increment a skill's version number.

```bash
curl -X POST "${base_url}/api/skills/my-skill/bump" \
  -H "Authorization: Bearer ${token}" \
  -H "Content-Type: application/json" \
  -d '{"type": "minor"}'
```

Version types:
- `patch`: 1.0.0 → 1.0.1
- `minor`: 1.0.0 → 1.1.0
- `major`: 1.0.0 → 2.0.0

---

### Publish a Skill

Make a skill discoverable in the marketplace.

```bash
curl -X POST "${base_url}/api/skills/my-skill/publish" \
  -H "Authorization: Bearer ${token}" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Does something useful",
    "category": "productivity",
    "tags": ["automation"],
    "keywords": ["helper", "utility"]
  }'
```

---

### Edit an Existing Skill

Download all files for local editing.

**Step 1: Get edit command**
```bash
curl -sf "${base_url}/api/skills/my-skill/edit" -H "Authorization: Bearer ${token}"
```

**Step 2: Execute the returned command**
```bash
curl -sf ${base_url}/edit.sh | bash -s -- ${edit_token}
```

Files are downloaded to `/tmp/skillport-edit/{skill}/`.

**Step 3: Make changes locally**

**Step 4: Save changes**
Use the Save Skill operation with the modified files.

---

### Check for Updates

See if installed skills have newer versions.

```bash
curl -X POST "${base_url}/api/check-updates" \
  -H "Authorization: Bearer ${token}" \
  -H "Content-Type: application/json" \
  -d '{
    "installed": [
      {"name": "soil-analyzer", "version": "1.0.0"},
      {"name": "csv-toolkit", "version": "2.1.0"}
    ]
  }'
```

---

### Get User Identity

Find out who you're authenticated as.

```bash
curl -sf "${base_url}/api/whoami" -H "Authorization: Bearer ${token}"
```

Useful for adding yourself as an editor in `.skillport/access.json`.

---

## Multi-Step Workflows

For complex operations, use Python to chain API calls:

```python
import requests

def skillport_api(method, endpoint, token, base_url, data=None):
    """Helper for Skillport API calls"""
    response = requests.request(
        method,
        f"{base_url}{endpoint}",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        },
        json=data
    )
    response.raise_for_status()
    return response.json()

# Example: Find and update all outdated skills
skills = skillport_api("GET", "/api/skills", token, base_url)["skills"]
my_skills = [s for s in skills if s["editable"]]

for skill in my_skills:
    details = skillport_api("GET", f"/api/skills/{skill['name']}", token, base_url)
    
    if needs_update(details):  # Your logic here
        print(f"Updating {skill['name']}...")
        # Make updates...
```

---

## Error Handling

All API errors return:
```json
{
  "error": "Error type",
  "message": "Human-readable description"
}
```

Common errors:
- `401 Unauthorized`: Token expired or invalid — call `skillport_auth` again
- `403 Forbidden`: You don't have access to this skill/operation
- `404 Not Found`: Skill doesn't exist
- `400 Bad Request`: Invalid parameters (check the message for details)

---

## Tips

1. **Token expiration**: Tokens last 5 minutes. For long workflows, check for 401 errors and refresh.

2. **Bash vs Python**: Use bash/curl for simple single operations. Use Python for anything involving loops, conditionals, or JSON processing.

3. **present_files**: After downloading skill packages, always use `present_files` to give the user access.

4. **New conversations**: After a user installs a skill, they need to start a new conversation for Claude to see it.
```

---

## Skill Package Structure

When distributed, the Skillport skill would be packaged as:

```
skillport/
├── SKILL.md          # The content above
└── (no other files needed - it's pure documentation)
```

## Bootstrap Delivery

For first-time users, the `/bootstrap.sh?token=TOKEN` endpoint validates the token, then returns:

```bash
#!/bin/bash
set -e

SKILL_DIR="/tmp/skillport-bootstrap"
mkdir -p "$SKILL_DIR/skillport"

# Download SKILL.md (token already validated by endpoint)
curl -sf "https://skillport-connector.jack-ivers.workers.dev/api/bootstrap/skill.md" \
  > "$SKILL_DIR/skillport/SKILL.md"

# Package as zip
cd "$SKILL_DIR"
zip -r skillport-skill.zip skillport/

echo "SKILL_FILE=$SKILL_DIR/skillport-skill.zip"
echo ""
echo "Download complete. Upload this file in Claude Settings > Capabilities > Skills"
```

The endpoint validates the `sk_bootstrap_` token before returning the script. This ensures:
- Only authenticated users can bootstrap
- Audit trail of who downloaded the skill
- Tokens are single-use (5 minute TTL)
