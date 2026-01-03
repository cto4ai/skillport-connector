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

```bash
curl -sf "${base_url}/api/skills" -H "Authorization: Bearer ${token}"
```

---

### Get Skill Details

View a skill's SKILL.md content and metadata.

```bash
curl -sf "${base_url}/api/skills/{skill-name}" -H "Authorization: Bearer ${token}"
```

Response includes `skill_md` with the full SKILL.md content.

---

### Install a Skill

Download a skill package for the user to install.

**Step 1: Get install command**
```bash
curl -sf "${base_url}/api/skills/{skill-name}/install" -H "Authorization: Bearer ${token}"
```

**Step 2: Execute the returned command**
The response includes a `command` field. Execute it to download the skill package.

**Step 3: Present the file**
Find the `SKILL_FILE=` path in the output and call `present_files` with it.

**Step 4: Instruct user**
Tell the user to click "Copy to your skills" button, then start a new conversation.

---

### Create or Update a Skill

Save skill files to the marketplace.

```bash
curl -X POST "${base_url}/api/skills/{skill-name}" \
  -H "Authorization: Bearer ${token}" \
  -H "Content-Type: application/json" \
  -d '{
    "skill_group": "my-skills",
    "files": [
      {"path": "SKILL.md", "content": "---\nname: my-skill\ndescription: Does something\n---\n\n# My Skill\n..."},
      {"path": "scripts/helper.py", "content": "# helper code..."}
    ],
    "commitMessage": "Update skill"
  }'
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
curl -X DELETE "${base_url}/api/skills/{skill-name}?confirm=true" \
  -H "Authorization: Bearer ${token}"
```

**Warning:** This is irreversible. The `confirm=true` parameter is required.

---

### Bump Version

Increment a skill's version number.

```bash
curl -X POST "${base_url}/api/skills/{skill-name}/bump" \
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
curl -X POST "${base_url}/api/skills/{skill-name}/publish" \
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
curl -sf "${base_url}/api/skills/{skill-name}/edit" -H "Authorization: Bearer ${token}"
```

**Step 2: Execute the returned command**
The response includes a `command` field. Execute it to download the skill files.

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
      {"name": "skill-a", "version": "1.0.0"},
      {"name": "skill-b", "version": "2.1.0"}
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

2. **present_files**: After downloading skill packages, always use `present_files` to give the user access.

3. **New conversations**: After a user installs a skill, they need to start a new conversation for Claude to see it.
