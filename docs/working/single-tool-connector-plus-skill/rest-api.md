# REST API Specification

## Overview

The REST API exposes all Skillport operations as HTTP endpoints. Authentication is via Bearer token obtained from the `skillport_auth` MCP tool.

## Base URL

```
https://skillport-connector.jack-ivers.workers.dev
```

## Authentication

All endpoints (except bootstrap) require a Bearer token:

```
Authorization: Bearer sk_api_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Tokens are short-lived (5 minute TTL) and obtained via the `skillport_auth` MCP tool.

## Endpoints

### List Skills

List all skills available to the authenticated user.

```
GET /api/skills
```

**Response:**
```json
{
  "count": 5,
  "skills": [
    {
      "name": "soil-analyzer",
      "plugin": "crafty-skills",
      "description": "Analyze soil test data...",
      "version": "1.2.0",
      "author": "Jack Ivers",
      "category": "data",
      "tags": ["agriculture", "analysis"],
      "keywords": ["soil", "nutrients", "pH"],
      "editable": true
    }
  ]
}
```

---

### Get Skill Details

Get detailed information about a skill, including SKILL.md content.

```
GET /api/skills/:name
```

**Response:**
```json
{
  "skill": {
    "name": "soil-analyzer",
    "version": "1.2.0",
    "description": "Analyze soil test data...",
    "plugin": "crafty-skills",
    "category": "data",
    "tags": ["agriculture"],
    "keywords": ["soil"]
  },
  "skill_md": "---\nname: soil-analyzer\ndescription: ...\n---\n\n# Soil Analyzer\n\n...",
  "editable": true
}
```

---

### Install Skill

Get an install script for a skill. Returns a shell script that downloads and packages the skill.

```
GET /install.sh?token=TOKEN&skill=SKILL_NAME&package=true
```

Or use the existing PTC pattern:

```
GET /api/skills/:name/install
```

**Response:**
```json
{
  "install_token": "sk_install_xxx",
  "skill": "soil-analyzer",
  "version": "1.2.0",
  "expires_in": 300,
  "command": "curl -sf https://.../install.sh | bash -s -- sk_install_xxx --package"
}
```

---

### Save Skill

Create or update skill files.

```
POST /api/skills/:name
```

**Request Body:**
```json
{
  "skill_group": "my-skills",
  "files": [
    {
      "path": "SKILL.md",
      "content": "---\nname: my-skill\ndescription: Does something\n---\n\n# My Skill\n\n..."
    },
    {
      "path": "scripts/helper.py",
      "content": "#!/usr/bin/env python3\n..."
    }
  ],
  "commitMessage": "Update skill documentation"
}
```

**Response:**
```json
{
  "success": true,
  "skill": "my-skill",
  "skill_group": "my-skills",
  "isNewSkill": false,
  "isNewGroup": false,
  "files": [
    { "path": "plugins/my-skills/skills/my-skill/SKILL.md", "created": false },
    { "path": "plugins/my-skills/skills/my-skill/scripts/helper.py", "created": true }
  ],
  "summary": "1 file(s) created, 1 file(s) updated"
}
```

---

### Delete Skill

Delete a skill entirely.

```
DELETE /api/skills/:name?confirm=true
```

**Response:**
```json
{
  "success": true,
  "skill": "my-skill",
  "plugin": "my-skills",
  "pluginDeleted": false,
  "deletedFiles": [
    "plugins/my-skills/skills/my-skill/SKILL.md",
    "plugins/my-skills/skills/my-skill/scripts/helper.py"
  ],
  "message": "Deleted skill \"my-skill\" (2 files removed)"
}
```

---

### Bump Version

Increment the version of a skill.

```
POST /api/skills/:name/bump
```

**Request Body:**
```json
{
  "type": "minor"
}
```

**Response:**
```json
{
  "success": true,
  "skill": "my-skill",
  "skill_group": "my-skills",
  "oldVersion": "1.0.0",
  "newVersion": "1.1.0"
}
```

---

### Publish Skill

Make a skill discoverable in the marketplace.

```
POST /api/skills/:name/publish
```

**Request Body:**
```json
{
  "description": "Analyzes soil test data and provides recommendations",
  "category": "data",
  "tags": ["agriculture", "analysis"],
  "keywords": ["soil", "nutrients", "pH"]
}
```

**Response:**
```json
{
  "success": true,
  "skill": "soil-analyzer",
  "skill_group": "crafty-skills",
  "message": "Successfully published skill \"soil-analyzer\" to the marketplace"
}
```

---

### Fetch for Editing

Get all files for a skill to edit locally.

```
GET /api/skills/:name/edit
```

**Response:**
```json
{
  "edit_token": "sk_edit_xxx",
  "skill": "my-skill",
  "plugin": "my-skills",
  "version": "1.0.0",
  "expires_in": 300,
  "command": "curl -sf https://.../edit.sh | bash -s -- sk_edit_xxx"
}
```

---

### Check Updates

Check if installed skills have updates available.

```
POST /api/check-updates
```

**Request Body:**
```json
{
  "installed": [
    { "name": "soil-analyzer", "version": "1.0.0" },
    { "name": "csv-toolkit", "version": "2.1.0" }
  ]
}
```

**Response:**
```json
{
  "hasUpdates": true,
  "updates": [
    {
      "name": "soil-analyzer",
      "currentVersion": "1.0.0",
      "latestVersion": "1.2.0"
    }
  ]
}
```

---

### Who Am I

Get the authenticated user's identity.

```
GET /api/whoami
```

**Response:**
```json
{
  "id": "google:123456789",
  "email": "jack@example.com",
  "name": "Jack Ivers",
  "provider": "google"
}
```

---

### Bootstrap

Get the Skillport skill for first-time setup. Uses standard Bearer token authentication.

```
GET /bootstrap.sh
Authorization: Bearer TOKEN
```

**Response:** Returns a shell script that downloads and packages the Skillport skill.

---

## Error Responses

All errors return a consistent format:

```json
{
  "error": "Error type",
  "message": "Human-readable description"
}
```

**HTTP Status Codes:**
- `400` - Bad request (validation error)
- `401` - Unauthorized (missing or invalid token)
- `403` - Forbidden (access denied)
- `404` - Not found
- `500` - Internal server error

---

## Implementation Notes

### Migrating from MCP Tool Handlers

The existing MCP tool handler logic maps directly to REST handlers:

| MCP Tool | REST Endpoint |
|----------|---------------|
| `list_skills` | `GET /api/skills` |
| `install_skill` | `GET /api/skills/:name/install` |
| `fetch_skill_details` | `GET /api/skills/:name` |
| `fetch_skill_for_editing` | `GET /api/skills/:name/edit` |
| `save_skill` | `POST /api/skills/:name` |
| `delete_skill` | `DELETE /api/skills/:name` |
| `bump_version` | `POST /api/skills/:name/bump` |
| `publish_skill` | `POST /api/skills/:name/publish` |
| `check_updates` | `POST /api/check-updates` |
| `whoami` | `GET /api/whoami` |

### Request Routing

Add REST routes to the Cloudflare Worker:

```typescript
// In index.ts
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    
    // Existing MCP/SSE routes
    if (url.pathname === "/sse" || url.pathname === "/mcp") {
      return handleMCP(request, env);
    }
    
    // REST API routes
    if (url.pathname.startsWith("/api/")) {
      return handleAPI(request, env);
    }
    
    // Existing script routes
    if (url.pathname === "/install.sh" || url.pathname === "/edit.sh") {
      return handleScript(request, env);
    }
    
    // Bootstrap (no auth required)
    if (url.pathname === "/bootstrap.sh") {
      return handleBootstrap(request, env);
    }
    
    return new Response("Not found", { status: 404 });
  },
};
```
