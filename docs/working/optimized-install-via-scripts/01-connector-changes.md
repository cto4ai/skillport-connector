# Phase 1: Connector Changes

## Overview

Changes to skillport-connector:

1. **New MCP Tool:** `install_skill` - returns token + command for PTC installation
2. **Repurposed MCP Tool:** `fetch_skill` - now returns only SKILL.md (not all files)
3. **New REST Endpoint:** `/api/install/:token` - redeems tokens for skill files
4. **New Served Script:** `/install.sh` - the installation script

---

## 1. New MCP Tool: `install_skill`

### Tool Definition

```typescript
{
  name: "install_skill",
  description: "Install a skill efficiently. Returns a short-lived token and command to run. This is the recommended way to install skills - much faster than fetching all files.",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Skill name to install"
      }
    },
    required: ["name"]
  }
}
```

### Response Format

```json
{
  "install_token": "sk_install_7f3a9b2c4d5e6f7a8b9c0d1e2f3a4b5c",
  "skill": "data-analyzer",
  "version": "1.1.3",
  "expires_in": 300,
  "command": "bash <(curl -sf https://skillport-connector.jack-ivers.workers.dev/install.sh) sk_install_7f3a9b2c4d5e6f7a8b9c0d1e2f3a4b5c"
}
```

### Implementation

```typescript
async function handleInstallSkill(
  params: { name: string },
  user: UserInfo,
  env: Env
): Promise<ToolResponse> {
  const { name } = params;
  
  // Verify skill exists
  const skillInfo = await getSkillInfo(name, env);
  if (!skillInfo) {
    return { error: `Skill '${name}' not found` };
  }
  
  // Generate cryptographically random token
  const tokenBytes = new Uint8Array(24);
  crypto.getRandomValues(tokenBytes);
  const token = 'sk_install_' + btoa(String.fromCharCode(...tokenBytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  
  // Store token in KV with 5 minute TTL
  const tokenData = {
    skill: name,
    version: skillInfo.version,
    user: user.email,
    created: Date.now(),
    used: false
  };
  
  await env.OAUTH_KV.put(
    `install_token:${token}`,
    JSON.stringify(tokenData),
    { expirationTtl: 300 }
  );
  
  const connectorUrl = env.CONNECTOR_URL || 'https://skillport-connector.jack-ivers.workers.dev';
  
  return {
    install_token: token,
    skill: name,
    version: skillInfo.version,
    expires_in: 300,
    command: `bash <(curl -sf ${connectorUrl}/install.sh) ${token}`
  };
}
```

---

## 2. Repurposed MCP Tool: `fetch_skill`

### Before (REMOVING)

Returned all files (~11k tokens):
```json
{
  "skill": { "name": "...", "version": "..." },
  "files": [
    { "path": "SKILL.md", "content": "..." },
    { "path": "scripts/foo.py", "content": "..." },
    ...
  ]
}
```

### After (NEW BEHAVIOR)

Returns only SKILL.md content (~500-2k tokens):
```json
{
  "skill": {
    "name": "data-analyzer",
    "version": "1.1.3",
    "description": "Analyzes CSV and JSON data files..."
  },
  "skill_md": "---\nname: data-analyzer\ndescription: >...\n---\n\n# Data Analyzer\n\n## Overview\n..."
}
```

### Tool Definition (Updated)

```typescript
{
  name: "fetch_skill",
  description: "Get details about a skill. Returns the SKILL.md content which describes what the skill does, how to use it, and its capabilities. Use install_skill to actually install a skill.",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string", 
        description: "Skill name"
      }
    },
    required: ["name"]
  }
}
```

### Implementation

```typescript
async function handleFetchSkill(
  params: { name: string },
  env: Env
): Promise<ToolResponse> {
  const { name } = params;
  
  const skillInfo = await getSkillInfo(name, env);
  if (!skillInfo) {
    return { error: `Skill '${name}' not found` };
  }
  
  // Fetch ONLY SKILL.md - not all files
  const skillMd = await fetchSkillMd(name, env);
  
  return {
    skill: {
      name: skillInfo.name,
      version: skillInfo.version,
      description: skillInfo.description
    },
    skill_md: skillMd
  };
}
```

---

## 3. REST Endpoint: `/api/install/:token`

### Route

```
GET /api/install/:token
```

No authentication header - the token itself is the auth.

### Response: Success (200)

Returns all skill files (same as old `fetch_skill`):

```json
{
  "skill": {
    "name": "data-analyzer",
    "version": "1.1.3"
  },
  "files": [
    {
      "path": "SKILL.md",
      "content": "---\nname: data-analyzer\n..."
    },
    {
      "path": "scripts/analyze_data.py",
      "content": "#!/usr/bin/env python3\n..."
    }
  ]
}
```

### Response: Errors

| Status | Body | When |
|--------|------|------|
| 400 | `{"error": "Invalid token format"}` | Token doesn't start with `sk_install_` |
| 404 | `{"error": "Token not found or expired"}` | Token doesn't exist or TTL expired |
| 410 | `{"error": "Token already used"}` | Token was already redeemed |
| 500 | `{"error": "Failed to fetch skill", "message": "..."}` | GitHub API error |

### Implementation

```typescript
async function handleInstallToken(token: string, env: Env): Promise<Response> {
  if (!token || !token.startsWith('sk_install_')) {
    return Response.json({ error: 'Invalid token format' }, { status: 400 });
  }
  
  const tokenKey = `install_token:${token}`;
  const tokenDataStr = await env.OAUTH_KV.get(tokenKey);
  
  if (!tokenDataStr) {
    return Response.json({ error: 'Token not found or expired' }, { status: 404 });
  }
  
  const tokenData = JSON.parse(tokenDataStr);
  
  if (tokenData.used) {
    return Response.json({ error: 'Token already used' }, { status: 410 });
  }
  
  // Mark as used immediately
  tokenData.used = true;
  tokenData.usedAt = Date.now();
  await env.OAUTH_KV.put(tokenKey, JSON.stringify(tokenData), {
    expirationTtl: 60 // Keep briefly for debugging
  });
  
  // Fetch ALL skill files (this is what old fetch_skill did)
  try {
    const skillData = await fetchAllSkillFiles(tokenData.skill, env);
    return Response.json(skillData, {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
    });
  } catch (error) {
    return Response.json(
      { error: 'Failed to fetch skill', message: error.message },
      { status: 500 }
    );
  }
}
```

---

## 4. Served Script: `/install.sh`

### Route

```
GET /install.sh
```

Returns the bash install script. See [02-install-script.md](./02-install-script.md) for full script.

### Implementation

```typescript
function serveInstallScript(env: Env): Response {
  const connectorUrl = env.CONNECTOR_URL || 'https://skillport-connector.jack-ivers.workers.dev';
  
  const script = `#!/bin/bash
set -e
TOKEN="$1"
PACKAGE_FLAG="$2"
CONNECTOR_URL="${connectorUrl}"
# ... rest of script
`;
  
  return new Response(script, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=300'
    }
  });
}
```

---

## 5. Main Worker Routes

```typescript
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    
    // MCP endpoint (handles install_skill, fetch_skill, etc.)
    if (url.pathname === '/sse') {
      return handleMCP(request, env, ctx);
    }
    
    // OAuth callback
    if (url.pathname === '/callback') {
      return handleOAuthCallback(request, env);
    }
    
    // NEW: Install script
    if (url.pathname === '/install.sh') {
      return serveInstallScript(env);
    }
    
    // NEW: Token redemption
    if (url.pathname.startsWith('/api/install/')) {
      const token = url.pathname.split('/')[3];
      return handleInstallToken(token, env);
    }
    
    return new Response('Not found', { status: 404 });
  }
}
```

---

## 6. Token Format & Storage

### Token Format

- Prefix: `sk_install_`
- Body: 24 random bytes, base64url encoded
- Example: `sk_install_7f3a9b2c4d5e6f7a8b9c0d1e2f3a4b5c`

### KV Storage

```
Key: install_token:sk_install_xxx
TTL: 300 seconds (5 minutes)
Value: {
  "skill": "data-analyzer",
  "version": "1.1.3",
  "user": "jack@craftycto.com",
  "created": 1735689600000,
  "used": false,
  "usedAt": null
}
```

---

## 7. Summary of Tool Changes

| Tool | Before | After |
|------|--------|-------|
| `list_skills` | Returns all skill metadata | Unchanged |
| `fetch_skill` | Returns ALL files (~11k tokens) | Returns only SKILL.md (~500-2k tokens) |
| `install_skill` | N/A | **NEW**: Returns token + command (~100 tokens) |
| `check_updates` | Compare versions | Unchanged |

---

## 8. Files to Modify

| File | Changes |
|------|---------|
| `src/index.ts` | Add routes for `/api/install/:token` and `/install.sh` |
| `src/tools.ts` | Add `install_skill`, modify `fetch_skill` |
| `src/github.ts` | Add `fetchSkillMd()` helper |
| `src/types.ts` | Add types for token data |

---

## 9. Testing

```bash
# Test install_skill via Claude
> "install data-analyzer from skillport"

# Test token redemption directly
curl -s "https://connector/api/install/sk_install_xxx" | jq .

# Test fetch_skill returns only SKILL.md
> "tell me more about the data-analyzer skill"
# Should return skill_md content, not all files

# Test install.sh
bash <(curl -sf https://connector/install.sh) sk_install_xxx
```
