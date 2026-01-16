# Implementation Guide

This guide describes the Skillport Connector implementation.

## Overview

The connector is a Cloudflare Worker that:

1. Handles OAuth authentication (Google)
2. Reads from a configured Plugin Marketplace repo via GitHub API
3. Exposes MCP tools for browsing and fetching skills
4. Enforces access control based on user roles

## Key Source Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Entry point, OAuth provider setup |
| `src/mcp-server.ts` | MCP server with all tool definitions |
| `src/github-client.ts` | GitHub API client for marketplace access |
| `src/google-handler.ts` | Google OAuth handler |
| `src/access-control.ts` | Role-based access control |

## Core Components

### 1. OAuth Handler (`src/google-handler.ts`)

Handles Google OAuth flow:
- Redirects to Google for authentication
- Handles callback with auth code
- Exchanges code for access token
- Extracts stable user ID and email from Google profile

Key data captured:
```typescript
{
  provider: "google",
  uid: "114339316701728183084",  // Stable Google user ID
  email: "user@example.com",
  name: "User Name"
}
```

### 2. MCP Server (`src/mcp-server.ts`)

Defines all MCP tools using the MCP SDK:

```typescript
import { McpAgent } from "agents/mcp";

export class SkillportMCP extends McpAgent<Env, unknown, Props> {
  async init() {
    // Define tools here
    this.server.tool("list_skills", ...);
    this.server.tool("fetch_skill", ...);
    // etc.
  }
}
```

### 3. GitHub Client (`src/github-client.ts`)

Fetches marketplace data from GitHub:
- `listSkills()` - Discovers skills from `plugins/*/skills/*/SKILL.md`
- `getSkill(name)` - Gets a specific skill by name
- `fetchSkill(name)` - Fetches SKILL.md and related files
- `fetchAccessConfig()` - Gets `.skillport/access.json`

Uses a service token for read operations, write token for edits.

### 4. Access Control (`src/access-control.ts`)

Enforces role-based permissions:

```typescript
const accessControl = await this.getAccessControl();

// Check if user can read a skill
if (!accessControl.canRead(skillName)) {
  return { error: "Access denied" };
}

// Check if user can write to a skill group
if (!accessControl.canWrite(groupName)) {
  return { error: "Access denied" };
}

// Check if user is a global editor
if (!accessControl.isEditor()) {
  return { error: "Only editors can create skills" };
}
```

## MCP Tools

### User Tools

#### list_skills

Lists all skills the user can access:

```typescript
this.server.tool(
  "list_skills",
  "List all skills available across all plugins.",
  {},
  async () => {
    const github = this.getGitHubClient();
    const accessControl = await this.getAccessControl();
    const allSkills = await github.listSkills();

    // Filter by read access
    const visibleSkills = allSkills.filter(s =>
      accessControl.canRead(s.plugin)
    );

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          count: visibleSkills.length,
          skills: visibleSkills.map(s => ({
            name: s.name,
            plugin: s.plugin,
            description: s.description,
            version: s.version,
            editable: accessControl.canWrite(s.plugin),
          })),
        }),
      }],
    };
  }
);
```

#### fetch_skill

Fetches skill files for installation:

```typescript
this.server.tool(
  "fetch_skill",
  "Fetch skill files for installation.",
  { name: z.string() },
  async ({ name }) => {
    const accessControl = await this.getAccessControl();

    if (!accessControl.canRead(name)) {
      return { error: "Access denied" };
    }

    const github = this.getGitHubClient();
    const skill = await github.getSkill(name);
    const files = await github.fetchSkillFiles(skill);

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          name: skill.name,
          version: skill.version,
          files: files,
          editable: accessControl.canWrite(skill.plugin),
        }),
      }],
    };
  }
);
```

### Editor Tools

#### save_skill

Creates or updates skill files:

```typescript
this.server.tool(
  "save_skill",
  "Create or update skill files.",
  {
    skill: z.string(),
    skill_group: z.string().optional(),
    files: z.array(z.object({
      path: z.string(),
      content: z.string(),
    })),
  },
  async ({ skill, skill_group, files }) => {
    const accessControl = await this.getAccessControl();
    const github = this.getGitHubClient();

    const existingSkill = await github.getSkill(skill);

    if (existingSkill) {
      // Update existing skill
      if (!accessControl.canWrite(existingSkill.plugin)) {
        return { error: "Access denied" };
      }
      // ... update files
    } else {
      // Create new skill (requires editor role)
      if (!accessControl.isEditor()) {
        return { error: "Only editors can create skills" };
      }
      // ... create skill group if needed, then create files
    }
  }
);
```

#### publish_skill

Makes a skill visible in marketplace.json:

```typescript
this.server.tool(
  "publish_skill",
  "Make a skill discoverable in the marketplace.",
  {
    skill: z.string(),
    description: z.string(),
    category: z.string().optional(),
    surfaces: z.array(z.string()).optional(),
  },
  async ({ skill, description, category, surfaces }) => {
    const accessControl = await this.getAccessControl();

    // Only global editors can publish
    if (!accessControl.isEditor()) {
      return { error: "Only editors can publish skills" };
    }

    // Add entry to marketplace.json
    // ...
  }
);
```

## Skill Discovery

Skills are discovered dynamically from the repository structure:

```
plugins/
  └── example-skills/           <- Skill group (plugin)
        ├── .claude-plugin/
        │     └── plugin.json   <- Group manifest with version
        └── skills/
              ├── my-skill/
              │     └── SKILL.md
              └── another-skill/
                    └── SKILL.md
```

The `listSkills()` method:
1. Fetches `marketplace.json` for published plugins
2. Scans `plugins/*/skills/*/SKILL.md` for all skills
3. Parses SKILL.md frontmatter for metadata
4. Associates skills with their parent group for versioning

## Configuration

### wrangler.toml

```toml
name = "skillport-connector"
main = "src/index.ts"
compatibility_date = "2024-12-01"

[vars]
MARKETPLACE_REPO = "your-org/your-marketplace"

[[kv_namespaces]]
binding = "OAUTH_KV"
id = "your-kv-id"
```

### Secrets

```bash
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put GITHUB_SERVICE_TOKEN      # Read-only token
wrangler secret put GITHUB_WRITE_TOKEN        # Write token (for editors)
```

## Testing

### Local Development

```bash
npm run dev
# Server runs at http://localhost:8788/sse
```

### MCP Inspector

```bash
npx @anthropic-ai/mcp-inspector
# Connect to http://localhost:8788/sse
# Complete OAuth flow
# Test tools
```

### Claude.ai Integration

1. Deploy: `npm run deploy`
2. Add connector in Settings > Connectors
3. Authenticate with Google
4. Test in conversation: "What skills are available?"

### Wrangler Tail

View live logs:
```bash
wrangler tail
```

## Access Control Setup

### Creating access.json

In the marketplace repo, create `.skillport/access.json`:

```json
{
  "version": "1.0",
  "editors": [
    { "id": "google:114339316701728183084", "label": "admin@example.com" }
  ],
  "skills": {},
  "defaults": {
    "read": "*",
    "write": "editors"
  }
}
```

### Getting User IDs

Users can get their ID via the `whoami` tool:

```
Tool: whoami
Result: {
  "provider": "google",
  "uid": "114339316701728183084",
  "email": "user@example.com"
}
```

Then add to `editors` array: `{ "id": "google:114339316701728183084", "label": "user@example.com" }`
