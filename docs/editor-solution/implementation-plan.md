# Skillport Editor Solution: Implementation Plan

## Summary

Add skill editing capabilities to Skillport Connector using:
- Existing IdP OAuth (Google now, Entra/Okta later)
- `.skillport/access.json` for email-based access control
- Two GitHub PATs (read + write) for defense in depth

---

## Phase 1: Access Control Foundation

### 1.1 Add WRITE PAT Secret

```bash
wrangler secret put GITHUB_WRITE_TOKEN
```

Update `wrangler.toml` bindings (no code change needed for secrets).

### 1.2 Create Access Control Module

**New file: `src/access-control.ts`**

```typescript
interface UserRef {
  id: string;    // e.g., "google:110248495921238986420"
  label: string; // e.g., "jack@craftycto.com" (informational only)
}

interface AccessConfig {
  version: string;
  editors: UserRef[];
  skills: Record<string, { read?: UserRef[] | "*"; write?: UserRef[] | "editors" }>;
  defaults: { read: "*" | UserRef[]; write: "editors" | UserRef[] };
}

export class AccessControl {
  private userId: string; // Format: "{provider}:{uid}"

  constructor(private config: AccessConfig, provider: string, uid: string) {
    this.userId = `${provider}:${uid}`;
  }

  isEditor(): boolean {
    return this.config.editors.some(e => e.id === this.userId);
  }

  canRead(skillName: string): boolean {
    const skillAccess = this.config.skills[skillName]?.read;
    if (skillAccess === "*") return true;
    if (Array.isArray(skillAccess)) {
      return skillAccess.some(u => u.id === this.userId);
    }
    // Fall back to defaults
    return this.config.defaults.read === "*" ||
           (Array.isArray(this.config.defaults.read) &&
            this.config.defaults.read.some(u => u.id === this.userId));
  }

  canWrite(skillName: string): boolean {
    const skillAccess = this.config.skills[skillName]?.write;
    if (skillAccess === "editors") return this.isEditor();
    if (Array.isArray(skillAccess)) {
      return skillAccess.some(u => u.id === this.userId);
    }
    // Fall back to defaults
    if (this.config.defaults.write === "editors") return this.isEditor();
    return Array.isArray(this.config.defaults.write) &&
           this.config.defaults.write.some(u => u.id === this.userId);
  }

  getUserId(): string {
    return this.userId;
  }
}
```

### 1.3 Update OAuth to Capture User ID

**Update: `src/google-handler.ts`** (line ~202)

```typescript
props: {
  uid: user.id,        // Stable unique identifier from IdP
  provider: "google",  // For constructing full id
  email: user.email,   // For display only
  name: user.name,
  picture: user.picture,
  domain: user.hd,
},
```

### 1.4 Add "Show My ID" Tool

New MCP tool to help users discover their `id` for bootstrap:

```typescript
this.server.tool("whoami", {}, async () => {
  const fullId = `${this.props.provider}:${this.props.uid}`;
  return {
    id: fullId,
    email: this.props.email,
    name: this.props.name,
    message: `To add yourself as an editor, add this to .skillport/access.json:\n\n{ "id": "${fullId}", "label": "${this.props.email}" }`
  };
});
```

### 1.5 Fetch Access Config

**Update: `src/github-client.ts`**

```typescript
async fetchAccessConfig(): Promise<AccessConfig | null> {
  try {
    const response = await this.fetchFile(".skillport/access.json");
    return JSON.parse(response);
  } catch {
    // No access.json = everyone can read, no one can write
    return {
      version: "1.0",
      editors: [],
      skills: {},
      defaults: { read: "*", write: "editors" }
    };
  }
}
```

---

## Phase 2: Permission-Filtered Tools

### 2.1 Update list_plugins

Filter results based on user's read access:

```typescript
// In mcp-server.ts
const accessConfig = await this.githubClient.fetchAccessConfig();
const accessControl = new AccessControl(accessConfig, this.props.email);

const allPlugins = await this.githubClient.listPlugins();
const visiblePlugins = allPlugins.filter(p => accessControl.canRead(p.name));
```

### 2.2 Update get_plugin and fetch_skill

Add access check before returning data:

```typescript
if (!accessControl.canRead(pluginName)) {
  return { error: "Access denied", message: "You don't have access to this skill" };
}
```

### 2.3 Add isEditor to Tool Responses

Include editor status in responses for UI hints:

```typescript
return {
  plugins: visiblePlugins,
  isEditor: accessControl.isEditor(),
  editableSkills: allPlugins.filter(p => accessControl.canWrite(p.name)).map(p => p.name)
};
```

---

## Phase 3: Editor Tools

### 3.1 PAT Selection Logic

**Update: `src/mcp-server.ts`**

```typescript
private getGitHubClient(forWrite: boolean = false): GitHubClient {
  const token = forWrite && this.isEditor
    ? this.env.GITHUB_WRITE_TOKEN
    : this.env.GITHUB_READ_TOKEN;
  return new GitHubClient(token, this.env.MARKETPLACE_REPO);
}
```

### 3.2 Implement update_skill

```typescript
this.server.tool("update_skill", {
  name: z.string(),
  content: z.string(),
  commitMessage: z.string().optional()
}, async ({ name, content, commitMessage }) => {
  if (!this.accessControl.canWrite(name)) {
    return { error: "Access denied" };
  }

  const client = this.getGitHubClient(true);
  const path = `plugins/${name}/skills/SKILL.md`;
  const message = commitMessage || `Update ${name} SKILL.md`;

  await client.updateFile(path, content, `${message}\n\nRequested by: ${this.props.email}`);

  this.logAction("update_skill", { plugin: name });
  return { success: true, path };
});
```

### 3.3 Implement update_manifest

```typescript
this.server.tool("update_manifest", {
  name: z.string(),
  updates: z.record(z.unknown())
}, async ({ name, updates }) => {
  if (!this.accessControl.canWrite(name)) {
    return { error: "Access denied" };
  }

  const client = this.getGitHubClient(true);
  const path = `plugins/${name}/plugin.json`;

  const current = await client.fetchFile(path);
  const manifest = JSON.parse(current);
  const updated = { ...manifest, ...updates };

  await client.updateFile(path, JSON.stringify(updated, null, 2),
    `Update ${name} manifest\n\nRequested by: ${this.props.email}`);

  return { success: true, manifest: updated };
});
```

### 3.4 Implement bump_version

```typescript
this.server.tool("bump_version", {
  name: z.string(),
  type: z.enum(["major", "minor", "patch"])
}, async ({ name, type }) => {
  if (!this.accessControl.canWrite(name)) {
    return { error: "Access denied" };
  }

  const client = this.getGitHubClient(true);

  // Update plugin.json
  const manifestPath = `plugins/${name}/plugin.json`;
  const manifest = JSON.parse(await client.fetchFile(manifestPath));
  const [major, minor, patch] = manifest.version.split(".").map(Number);

  const newVersion = type === "major" ? `${major + 1}.0.0`
    : type === "minor" ? `${major}.${minor + 1}.0`
    : `${major}.${minor}.${patch + 1}`;

  manifest.version = newVersion;
  await client.updateFile(manifestPath, JSON.stringify(manifest, null, 2),
    `Bump ${name} version to ${newVersion}\n\nRequested by: ${this.props.email}`);

  // Update marketplace.json
  await this.updateMarketplaceVersion(name, newVersion);

  return { success: true, oldVersion: `${major}.${minor}.${patch}`, newVersion };
});
```

### 3.5 Implement create_plugin

```typescript
this.server.tool("create_plugin", {
  name: z.string(),
  description: z.string(),
  author: z.string().optional()
}, async ({ name, description, author }) => {
  if (!this.accessControl.isEditor()) {
    return { error: "Access denied", message: "Only editors can create plugins" };
  }

  const client = this.getGitHubClient(true);

  // Create plugin.json
  const manifest = {
    name,
    version: "1.0.0",
    description,
    author: { name: author || this.props.name, email: this.props.email },
    license: "MIT",
    keywords: []
  };

  // Create SKILL.md template
  const skillTemplate = `---
name: ${name}
description: ${description}
---

# ${name}

## When to Use This Skill

[Describe when Claude should use this skill]

## Instructions

[Step-by-step instructions for Claude]
`;

  await client.createFile(`plugins/${name}/plugin.json`, JSON.stringify(manifest, null, 2),
    `Create ${name} plugin\n\nRequested by: ${this.props.email}`);
  await client.createFile(`plugins/${name}/skills/SKILL.md`, skillTemplate,
    `Add ${name} SKILL.md\n\nRequested by: ${this.props.email}`);

  return { success: true, name, path: `plugins/${name}` };
});
```

---

## Phase 4: GitHub Client Write Operations

### 4.1 Add Write Methods to GitHubClient

**Update: `src/github-client.ts`**

```typescript
async updateFile(path: string, content: string, message: string): Promise<void> {
  // Get current file SHA
  const { sha } = await this.getFileMeta(path);

  await fetch(`https://api.github.com/repos/${this.repo}/contents/${path}`, {
    method: "PUT",
    headers: this.headers,
    body: JSON.stringify({
      message,
      content: btoa(content),
      sha
    })
  });
}

async createFile(path: string, content: string, message: string): Promise<void> {
  await fetch(`https://api.github.com/repos/${this.repo}/contents/${path}`, {
    method: "PUT",
    headers: this.headers,
    body: JSON.stringify({
      message,
      content: btoa(content)
    })
  });
}

private async getFileMeta(path: string): Promise<{ sha: string }> {
  const response = await fetch(
    `https://api.github.com/repos/${this.repo}/contents/${path}`,
    { headers: this.headers }
  );
  const data = await response.json();
  return { sha: data.sha };
}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/access-control.ts` | **NEW** - Access control logic |
| `src/github-client.ts` | Add `fetchAccessConfig()`, write methods |
| `src/mcp-server.ts` | Add editor tools, permission filtering |
| `wrangler.toml` | Document new secret |

---

## Testing Checklist

- [ ] Non-editor cannot see restricted skills
- [ ] Non-editor gets "Access denied" on write tools
- [ ] Editor can update SKILL.md
- [ ] Editor can bump version (updates both files)
- [ ] Editor can create new plugin
- [ ] Commits include user email in message
- [ ] Missing access.json defaults to read-only

---

## Rollout

1. Deploy with editor tools disabled (feature flag)
2. Test with single editor email
3. Enable for broader editor list
4. Document for customers
