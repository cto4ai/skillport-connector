# Phase 3: GitHub API Client

## Objective

Create a GitHub API client using a service token (PAT) to fetch Plugin Marketplace data. This is separate from user authentication.

## Why Service Token?

| Approach | Pros | Cons |
|----------|------|------|
| User OAuth to GitHub | Per-user access | Requires GitHub seats for all users |
| Service Token (PAT) | Single token, no user seats | Shared rate limit, no per-user access |
| GitHub App | Higher rate limits, installable | More complex setup |

**Decision:** Start with PAT for simplicity. Can upgrade to GitHub App later if rate limits become an issue.

## GitHub PAT Setup

1. Go to GitHub Settings > Developer settings > Personal access tokens
2. Generate new token (classic) with scopes:
   - `repo` (for private repos) OR
   - `public_repo` (for public repos only)
3. Store as `GITHUB_SERVICE_TOKEN` secret

## Implementation: src/github-client.ts

```typescript
/**
 * GitHub API client using service token
 * Fetches Plugin Marketplace data from configured repository
 */

interface Marketplace {
  name: string;
  owner: { name: string; email: string };
  metadata?: { description?: string; version?: string };
  plugins: PluginEntry[];
  _skillport?: { version: string; features: string[] };
}

interface PluginEntry {
  name: string;
  source: string;
  description?: string;
  version?: string;
  author?: { name: string; email?: string };
  category?: string;
  tags?: string[];
  surfaces?: string[];
  skillPath?: string;
  permissions?: string[];
}

interface PluginManifest {
  name: string;
  version: string;
  description?: string;
  author?: { name: string; email?: string };
  homepage?: string;
  license?: string;
  keywords?: string[];
}

interface SkillFile {
  path: string;
  content: string;
}

const GITHUB_API = "https://api.github.com";

export class GitHubClient {
  private token: string;
  private repo: string;
  private kv: KVNamespace;

  constructor(token: string, repo: string, kv: KVNamespace) {
    this.token = token;
    this.repo = repo;
    this.kv = kv;
  }

  /**
   * Fetch a file from the repository
   */
  private async fetchFile(path: string): Promise<string> {
    const response = await fetch(
      `${GITHUB_API}/repos/${this.repo}/contents/${path}`,
      {
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/vnd.github.v3.raw",
          "User-Agent": "Skillport-Connector/1.0",
        },
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`File not found: ${path}`);
      }
      throw new Error(`GitHub API error: ${response.status}`);
    }

    return response.text();
  }

  /**
   * Fetch with caching
   */
  private async fetchWithCache<T>(
    cacheKey: string,
    ttlSeconds: number,
    fetcher: () => Promise<T>
  ): Promise<T> {
    // Check cache
    const cached = await this.kv.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as T;
    }

    // Fetch fresh data
    const data = await fetcher();

    // Store in cache
    await this.kv.put(cacheKey, JSON.stringify(data), {
      expirationTtl: ttlSeconds,
    });

    return data;
  }

  /**
   * Get marketplace manifest
   */
  async getMarketplace(): Promise<Marketplace> {
    return this.fetchWithCache(
      `marketplace:${this.repo}`,
      300, // 5 minutes
      async () => {
        const content = await this.fetchFile(".claude-plugin/marketplace.json");
        return JSON.parse(content) as Marketplace;
      }
    );
  }

  /**
   * List plugins with optional filtering
   */
  async listPlugins(options?: {
    surface?: string;
    category?: string;
  }): Promise<PluginEntry[]> {
    const marketplace = await this.getMarketplace();
    let plugins = marketplace.plugins;

    // Filter by surface
    if (options?.surface) {
      plugins = plugins.filter(
        (p) => !p.surfaces || p.surfaces.includes(options.surface!)
      );
    }

    // Filter by category
    if (options?.category) {
      plugins = plugins.filter((p) => p.category === options.category);
    }

    return plugins;
  }

  /**
   * Get detailed plugin information
   */
  async getPlugin(name: string): Promise<{
    entry: PluginEntry;
    manifest: PluginManifest | null;
  }> {
    const marketplace = await this.getMarketplace();
    const entry = marketplace.plugins.find((p) => p.name === name);

    if (!entry) {
      throw new Error(`Plugin not found: ${name}`);
    }

    // Try to fetch plugin.json for additional details
    let manifest: PluginManifest | null = null;
    try {
      const basePath = entry.source.replace("./", "");
      manifest = await this.fetchWithCache(
        `plugin:${this.repo}:${name}`,
        3600, // 1 hour
        async () => {
          const content = await this.fetchFile(`${basePath}/plugin.json`);
          return JSON.parse(content) as PluginManifest;
        }
      );
    } catch {
      // plugin.json is optional
    }

    return { entry, manifest };
  }

  /**
   * Fetch skill files for installation
   */
  async fetchSkill(name: string): Promise<{
    plugin: PluginEntry;
    files: SkillFile[];
  }> {
    const { entry } = await this.getPlugin(name);
    const basePath = entry.source.replace("./", "");
    const skillPath = entry.skillPath || "skills/SKILL.md";
    const files: SkillFile[] = [];

    // Fetch SKILL.md
    try {
      const skillContent = await this.fetchWithCache(
        `skill:${this.repo}:${name}`,
        21600, // 6 hours
        async () => this.fetchFile(`${basePath}/${skillPath}`)
      );
      files.push({ path: "SKILL.md", content: skillContent });
    } catch (error) {
      throw new Error(`Failed to fetch skill: ${error}`);
    }

    // TODO: Optionally fetch scripts/, references/, assets/
    // This would require listing directory contents

    return { plugin: entry, files };
  }

  /**
   * Check for updates
   */
  async checkUpdates(
    installed: Array<{ name: string; version: string }>
  ): Promise<
    Array<{
      name: string;
      installedVersion: string;
      availableVersion: string;
    }>
  > {
    const marketplace = await this.getMarketplace();
    const updates: Array<{
      name: string;
      installedVersion: string;
      availableVersion: string;
    }> = [];

    for (const inst of installed) {
      const plugin = marketplace.plugins.find((p) => p.name === inst.name);
      if (plugin && plugin.version && plugin.version !== inst.version) {
        updates.push({
          name: inst.name,
          installedVersion: inst.version,
          availableVersion: plugin.version,
        });
      }
    }

    return updates;
  }

  /**
   * Clear cache (for webhooks or manual refresh)
   */
  async clearCache(pluginName?: string): Promise<void> {
    if (pluginName) {
      await this.kv.delete(`plugin:${this.repo}:${pluginName}`);
      await this.kv.delete(`skill:${this.repo}:${pluginName}`);
    } else {
      // Clear marketplace cache
      await this.kv.delete(`marketplace:${this.repo}`);
    }
  }
}
```

## Usage in MCP Tools

```typescript
// In src/index.ts or src/mcp-server.ts

import { GitHubClient } from "./github-client";

// Inside tool implementation
const github = new GitHubClient(
  env.GITHUB_SERVICE_TOKEN,
  env.MARKETPLACE_REPO,
  env.OAUTH_KV
);

const plugins = await github.listPlugins({ surface: "claude-ai" });
```

## Rate Limiting

### PAT Limits
- 5,000 requests per hour
- Check headers: `X-RateLimit-Remaining`, `X-RateLimit-Reset`

### Mitigation Strategies
1. **Caching** - Already implemented with KV
2. **Conditional requests** - Use ETag headers (future enhancement)
3. **Upgrade to GitHub App** - 15,000 requests per hour

## Error Handling

```typescript
try {
  const plugins = await github.listPlugins();
} catch (error) {
  if (error.message.includes("404")) {
    // Repository or file not found
  } else if (error.message.includes("403")) {
    // Rate limited or unauthorized
  } else if (error.message.includes("401")) {
    // Invalid token
  }
}
```

## Testing

```typescript
// Test file fetch
const github = new GitHubClient(token, "cto4ai/skillport-template", kv);

// Should return marketplace data
const marketplace = await github.getMarketplace();
console.log(marketplace.name, marketplace.plugins.length);

// Should return example-skill
const plugins = await github.listPlugins();
console.log(plugins.map(p => p.name));

// Should return skill content
const skill = await github.fetchSkill("example-skill");
console.log(skill.files[0].content.substring(0, 100));
```
