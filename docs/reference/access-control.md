# Access Control

Skillport implements role-based access control to manage who can read and edit skills in a marketplace.

## Overview

Access control is configured per-marketplace via `.skillport/access.json`. This file defines:
- **Editors**: Users with write access to the marketplace
- **Per-skill overrides**: Custom read/write rules for specific skills
- **Defaults**: Fallback rules for skills without specific overrides

## User Roles

| Role | Description | Capabilities |
|------|-------------|--------------|
| **Skill User** | Anyone not in the editors list | Read skills, fetch for installation |
| **Skill Editor** | User listed in `editors` array | Create skills, edit skills, publish, bump versions |

## Configuration

### File Location

`.skillport/access.json` in the marketplace repository root.

### Schema

```json
{
  "$schema": "https://skillport.dev/schemas/access.json",
  "version": "1.0",

  "editors": [
    { "id": "google:114339316701728183084", "label": "jack@example.com" }
  ],

  "skills": {
    "private-skill": {
      "read": [{ "id": "google:123...", "label": "user@example.com" }],
      "write": "editors"
    }
  },

  "defaults": {
    "read": "*",
    "write": "editors"
  }
}
```

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `version` | string | Schema version (currently "1.0") |
| `editors` | UserRef[] | Global editors with write access |
| `skills` | object | Per-skill access overrides |
| `defaults` | object | Fallback access rules |

### UserRef Format

Users are identified by stable OAuth IDs, not emails:

```json
{
  "id": "google:114339316701728183084",
  "label": "jack@example.com"
}
```

- `id`: `{provider}:{uid}` format (e.g., `google:123...`)
- `label`: Human-readable label (informational only, not used for auth)

### Access Values

| Value | Meaning |
|-------|---------|
| `"*"` | Everyone (public access) |
| `"editors"` | Only users in the `editors` array |
| `UserRef[]` | Specific list of users |

## Default Behavior

When `.skillport/access.json` doesn't exist:
- **Read**: Everyone (`"*"`)
- **Write**: No one (empty editors list)

This means a marketplace without access.json is read-only for all users.

## Tool Access Matrix

| Tool | Read-Only User | Editor |
|------|---------------|--------|
| `list_skills` | Shows readable skills with `editable: false` | Shows all with `editable: true` for writable |
| `fetch_skill` | Allowed if `canRead(skill)` | Allowed |
| `check_updates` | Allowed | Allowed |
| `whoami` | Allowed (helps get ID for access.json) | Allowed |
| `save_skill` (new) | Denied | Allowed (requires `isEditor()`) |
| `save_skill` (existing) | Denied | Allowed if `canWrite(group)` |
| `bump_version` | Denied | Allowed if `canWrite(group)` |
| `publish_skill` | Denied | Allowed (requires `isEditor()`) |

## Getting Your User ID

Use the `whoami` tool to get your stable user ID:

```
Tool: whoami
Result: {
  "provider": "google",
  "uid": "114339316701728183084",
  "email": "jack@example.com",
  "name": "Jack Ivers"
}
```

Then add yourself to `.skillport/access.json`:

```json
{
  "editors": [
    { "id": "google:114339316701728183084", "label": "jack@example.com" }
  ]
}
```

## Per-Skill Access

Override defaults for specific skills:

```json
{
  "skills": {
    "internal-tool": {
      "read": [
        { "id": "google:123...", "label": "team@example.com" }
      ],
      "write": "editors"
    },
    "public-skill": {
      "read": "*",
      "write": [
        { "id": "google:456...", "label": "maintainer@example.com" }
      ]
    }
  }
}
```

## Access Check Flow

```
canRead(skillName):
  1. Check skills[skillName].read
     - "*" → allow
     - UserRef[] → check if user in list
  2. Fall back to defaults.read
     - "*" → allow
     - UserRef[] → check if user in list

canWrite(skillName):
  1. Check skills[skillName].write
     - "editors" → check isEditor()
     - UserRef[] → check if user in list
  2. Fall back to defaults.write
     - "editors" → check isEditor()
     - UserRef[] → check if user in list

isEditor():
  - Check if user ID is in editors array
```

## Implementation Details

Access control is implemented in [src/access-control.ts](../../src/access-control.ts):

- `AccessControl` class handles all permission checks
- Created per-request with user's OAuth identity
- Config fetched from GitHub (cached for performance)

The MCP server integrates access control in [src/mcp-server.ts](../../src/mcp-server.ts):
- `getAccessControl()` creates an AccessControl instance
- Each tool checks permissions before performing operations
- Denied operations return `{ error: "Access denied", message: "..." }`
