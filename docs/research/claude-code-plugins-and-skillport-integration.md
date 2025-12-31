# Claude Code Plugins and Skillport Integration

**Research Date:** December 2024  
**Status:** Current as of Claude Code latest version

---

## Executive Summary

Claude Code supports remote MCP servers (announced June 2025), enabling Skillport Connector to work with Claude Code users. However, Claude Code's native Plugin Marketplace system does **not** support authentication to private repositories, which is an open feature request. This creates an opportunity for Skillport to solve the enterprise private repo problem across all Claude surfaces.

---

## Finding 1: Claude Code Supports Remote MCP Servers

### Overview

As of June 2025, Claude Code supports connecting to remote MCP servers with native OAuth support. This means Skillport Connector can be used from Claude Code, not just Claude.ai and Claude Desktop.

### How to Add a Remote MCP Server in Claude Code

```bash
# Add a remote MCP server with HTTP transport
claude mcp add --transport http skillport https://your-connector.workers.dev/sse

# Authenticate with OAuth
/mcp
```

### Scope Options

```bash
--scope local    # (default) Available only to you in the current project
--scope project  # Shared with everyone in the project via .mcp.json file
--scope user     # Available to you across all projects
```

### Key Capabilities

- **OAuth Support**: Native OAuth 2.0 authentication for remote servers
- **Multiple Transports**: Supports stdio, SSE, and HTTP transports
- **Enterprise Control**: Administrators can use `managed-mcp.json` or allowlists/denylists to control which MCP servers are permitted

### References

- [Remote MCP support in Claude Code (Anthropic Blog)](https://claude.com/blog/claude-code-remote-mcp)
- [Connect Claude Code to tools via MCP (Claude Code Docs)](https://code.claude.com/docs/en/mcp)
- [Remote MCP servers (Claude Platform Docs)](https://platform.claude.com/docs/en/agents-and-tools/remote-mcp-servers)

---

## Finding 2: Native Plugin Marketplaces Cannot Authenticate to Private Repos

### The Problem

Claude Code's native `/plugin marketplace add` command fetches marketplace repositories via HTTP without any authentication mechanism. This means:

- **Private GitHub repos**: Cannot be accessed
- **Private GitLab repos**: Cannot be accessed  
- **Any repo requiring auth**: Not supported

### Open Feature Request

This is tracked as **issue #9756** on the Claude Code GitHub repository, with significant community interest (10+ upvotes).

**Issue Title:** [FEATURE] Support Auth on Private Marketplaces and Plugins

**Problem Statement from the issue:**
> "We are a Gitlab SaaS shop and all of our projects are private. As far as I can tell, and as far as I have tried, Claude Code does not support loading private marketplaces and plugins when auth is required. This is an interesting hurdle in distributing our Claude Code augmentation."

### Requested Solutions (Not Yet Implemented)

1. Use git protocol instead of HTTP (leveraging existing git auth)
2. Support `VENDOR_TOKEN` environment variables for basic auth (e.g., `GITLAB_TOKEN`, `GITHUB_TOKEN`)
3. Some mechanism to inject credentials into HTTP requests

### Current Workarounds Being Used

Organizations are resorting to:
- Mirroring private repos to public ones
- Auto-syncing mechanisms
- Other "weird" workarounds (as described in the issue)

### References

- [GitHub Issue #9756: Support Auth on Private Marketplaces and Plugins](https://github.com/anthropics/claude-code/issues/9756)

---

## Implications for Skillport

### Skillport Solves the Private Repo Problem

| Capability | Native Claude Code Marketplace | Skillport |
|------------|:------------------------------:|:---------:|
| Private repo support | ❌ Not supported | ✅ Works |
| Authentication mechanism | None available | OAuth via Connector |
| How it accesses GitHub | Direct HTTP fetch (fails on private) | Connector uses `GITHUB_SERVICE_TOKEN` |

### How Skillport Works Differently

Skillport solves the **distribution** problem, not the **storage** problem. Skills still get stored locally once installed.

```
Skillport Marketplace     →    Skillport Connector    →    User's Local Skills
(GitHub repo)                  (authenticates to           (Claude.ai/Desktop
                                GitHub, serves to user)     stores locally)
```

**The key difference is how Skills get from the repo to the user:**

| | Claude Code Plugins | Skillport Skills |
|---|---|---|
| Fetch source | User's machine fetches directly from repo | Connector fetches from repo on user's behalf |
| Auth for private repos | ❌ Not supported | ✅ Connector handles via service token |
| Local storage | `~/.claude/plugins/cache/` | Claude.ai/Desktop's native Skills storage |

1. **Skillport Connector** authenticates to GitHub using a `GITHUB_SERVICE_TOKEN` (server-side)
2. **Users** authenticate to the Connector via OAuth (Google, MS Entra coming)
3. Users never need direct GitHub access to the marketplace repo
4. The Connector serves Skills to users, who install them into their **local** Claude.ai/Desktop Skills storage

Skillport solves "how do I get private repo content to users" - not "where do Skills live." They still live locally once installed, just like Claude Code plugins.

### Claude Code Users Can Use Skillport

Claude Code users can:
1. Add Skillport Connector as a remote MCP server: `claude mcp add --transport http skillport https://your-connector.workers.dev/sse`
2. Authenticate via `/mcp`
3. Use `list_skills` and `fetch_skill` tools to browse and download Skills
4. Install Skills manually (the Connector returns Skill files, not native plugin installation)

### Important Distinction

Skillport does **not** integrate with Claude Code's native `/plugin install` command. Instead, it provides a parallel system for browsing and fetching Skills that works across all Claude surfaces:

| Surface | Native Plugin System | Skillport |
|---------|---------------------|-----------|
| Claude Code | `/plugin install` (no private repo auth) | MCP tools via Connector |
| Claude.ai | N/A | MCP tools via Connector |
| Claude Desktop | N/A | MCP tools via Connector |
| Claude Mobile | N/A | Skills sync from web/desktop |

---

## All Claude Surfaces Can Use Skillport Connector

| Surface | How to Connect |
|---------|----------------|
| **Claude.ai** | Settings → Connectors → Add custom connector |
| **Claude Desktop** | Settings → Connectors → Add custom connector |
| **Claude Mobile** | Skills sync from Claude.ai/Desktop (can't add connectors directly) |
| **Claude Code** | `claude mcp add --transport http skillport <url>` |

---

## Additional References

### Claude Code Plugin Marketplaces
- [Create and distribute a plugin marketplace (Claude Code Docs)](https://code.claude.com/docs/en/plugin-marketplaces)

### Claude Connectors / Remote MCP
- [Getting Started with Custom Connectors Using Remote MCP (Claude Help Center)](https://support.claude.com/en/articles/11175166-getting-started-with-custom-connectors-using-remote-mcp)
- [Building Custom Connectors via Remote MCP Servers (Claude Help Center)](https://support.claude.com/en/articles/11503834-building-custom-connectors-via-remote-mcp-servers)
- [Connect to Remote MCP Servers (MCP Documentation)](https://modelcontextprotocol.io/docs/tutorials/use-remote-mcp-server)

### Identity and Access Management
- [Identity and Access Management (Claude Code Docs)](https://code.claude.com/docs/en/iam)

---

## Finding 3: Claude Code Plugin Installation Locations

### Overview

When Claude Code installs a plugin from a marketplace, it copies the plugin files to a local cache directory. Understanding this structure is important for debugging and for understanding how Skillport's approach differs.

### Directory Structure

| Directory | Purpose |
|-----------|----------|
| `~/.claude/plugins/marketplaces/` | Where marketplace repositories are cloned |
| `~/.claude/plugins/cache/` | Where installed plugins are copied to |
| `~/.claude/plugins/installed_plugins.json` | Registry tracking all installed plugins |

### Cache Directory Structure

Plugins are cached at:
```
~/.claude/plugins/cache/{marketplace}/{plugin}/{version}/
```

Example:
```
~/.claude/plugins/cache/cc-plugins/devloop/
├── 2.4.4/
├── 2.4.5/
├── 2.4.6/
└── 2.4.7/   ← Current version
```

### installed_plugins.json Format

```json
{
  "version": 2,
  "plugins": {
    "plugin-name@marketplace": [{
      "scope": "user",
      "installPath": "/Users/user/.claude/plugins/cache/marketplace/plugin/1.0.0",
      "version": "1.0.0",
      "lastUpdated": "2025-12-28T10:57:20.745Z",
      "gitCommitSha": "abc123..."
    }]
  }
}
```

### Key Behaviors

1. **Plugins are copied, not linked**: When you install a plugin, Claude Code copies the plugin files to the cache. The plugin runs from the cache, not from the marketplace directory.

2. **External paths don't work**: Because plugins are copied, paths like `../shared-utils` won't work after installation - those external files aren't copied to the cache.

3. **Version directories accumulate**: Old versions remain in the cache. There are known bugs where uninstall doesn't clean up cache directories.

4. **`${CLAUDE_PLUGIN_ROOT}` environment variable**: Plugins can use this variable to reference their cache location in scripts and configurations.

### Workarounds for External File Access

From the official docs:

**Option 1: Use symlinks**
```
my-plugin/
├── shared/           ← Symlink to ../shared-utils
└── commands/
```
Symlinks are followed during the copy process.

**Option 2: Restructure marketplace**
Set the plugin source to a parent directory that contains all required files.

### Clearing the Cache

To fix stale plugin issues:
```bash
rm -rf ~/.claude/plugins/cache/
```

Then reinstall plugins.

### References

- [Plugins reference - File locations (Claude Code Docs)](https://code.claude.com/docs/en/plugins-reference)
- [Discover and install plugins - Troubleshooting (Claude Code Docs)](https://code.claude.com/docs/en/discover-plugins)
- [GitHub Issue #14061: /plugin update does not invalidate plugin cache](https://github.com/anthropics/claude-code/issues/14061)
- [GitHub Issue #15642: CLAUDE_PLUGIN_ROOT points to stale version](https://github.com/anthropics/claude-code/issues/15642)
- [GitHub Issue #15369: Plugin uninstall does not clear cached files](https://github.com/anthropics/claude-code/issues/15369)

---

## Finding 4: Skillport Connector Works from Claude Code (Tested)

**Test Date:** 2025-12-31

### What We Tested

We successfully added Skillport Connector as a remote MCP server in Claude Code and used its tools.

### Setup

```bash
# Add the connector
claude mcp add --transport http skillport https://skillport-connector.jack-ivers.workers.dev/sse --scope user

# Verify connection
claude mcp list
# Output: skillport: https://skillport-connector.jack-ivers.workers.dev/sse (SSE) - ✓ Connected
```

### Results: MCP Tools Work

| Tool | Result |
|------|--------|
| `whoami` | ✅ Returns authenticated user (OAuth working) |
| `list_skills` | ✅ Returns 8 skills from marketplace |
| `fetch_skill` | ✅ Returns full skill package (SKILL.md + scripts + references) |

**whoami output:**
```json
{
  "email": "jack@craftycto.com",
  "name": "Jack Ivers",
  "id": "undefined:undefined"  // Bug: ID not properly captured
}
```

**list_skills output:** Returns skill metadata including name, plugin, version, description, author, tags.

**fetch_skill output:** Returns complete skill package:
- `SKILL.md` - Main skill definition
- `scripts/*.py` - Python scripts referenced by the skill
- `references/*.md` - Documentation files
- `.claude-plugin/plugin.json` - Plugin metadata
- Installation instructions

### Issue: Transient "Too Many Subrequests" Error

On first `fetch_skill` call, received:
```json
{"error":"Failed to fetch skill","message":"Too many subrequests."}
```

This is a Cloudflare Workers limitation when the connector makes many GitHub API calls to fetch multi-file skills. Retry succeeded.

**TODO:** Optimize `fetch_skill` to reduce GitHub API calls, possibly by batching or caching.

---

## Finding 5: Manual Plugin Installation via File System (Experimental)

**Test Date:** 2025-12-31
**Status:** PARTIALLY TESTED - needs new session to verify

### Hypothesis

Can we programmatically install a Skillport skill into Claude Code's plugin cache, bypassing `/plugin install`?

### What We Did

1. **Fetched skill via MCP:** Used `fetch_skill("data-analyzer")` to get all files
2. **Created directory structure:**
   ```
   ~/.claude/plugins/cache/skillport/data-analyzer/1.1.3/
   ├── .claude-plugin/
   │   └── plugin.json
   └── skills/
       └── data-analyzer/
           ├── SKILL.md
           ├── references/
           │   └── supported_formats.md
           └── scripts/
               ├── analyze_data.py
               └── quality_check.py
   ```
3. **Registered in installed_plugins.json:**
   ```json
   "data-analyzer@skillport": [{
     "scope": "user",
     "installPath": "/Users/jackivers/.claude/plugins/cache/skillport/data-analyzer/1.1.3",
     "version": "1.1.3",
     "installedAt": "2025-12-31T18:30:00.000Z",
     "lastUpdated": "2025-12-31T18:30:00.000Z",
     "isLocal": true
   }]
   ```
4. **Validated plugin:** `claude plugin validate` passed ✅

### Verification Checks

| Check | Result |
|-------|--------|
| Files installed in cache | ✅ 5 files present |
| Plugin validates | ✅ `claude plugin validate` passed |
| Registered in JSON | ✅ Entry added to installed_plugins.json |
| Skill visible in session | ❌ Not visible (plugins load at session start) |

### Still Needs Testing

**In a NEW Claude Code session:**

1. Does the skill appear in `/plugins` list?
2. Can Claude Code invoke the skill?
3. Do the Python scripts execute correctly?

### Potential Issues

1. **Missing marketplace registration:** Native plugins come from registered marketplaces. "skillport" isn't a real marketplace in `known_marketplaces.json`.

2. **gitCommitSha field:** We omitted this field. Native installations include it for update tracking.

3. **Session reload required:** Plugins are snapshotted at conversation start. Must test in fresh session.

### If This Works

This would enable a powerful workflow:

```
User in Claude Code:
1. "Install the data-analyzer skill from Skillport"
2. Claude Code calls fetch_skill via MCP
3. Claude Code writes files to ~/.claude/plugins/cache/skillport/...
4. Claude Code updates installed_plugins.json
5. User starts new session - skill is available!
```

This would give Skillport feature parity with native plugin installation, while supporting private repos.

---

## Next Steps

### Immediate (verify Finding 5)

1. Start a new Claude Code session
2. Check if `data-analyzer@skillport` appears in plugin list
3. Try using the skill on a CSV file
4. Document results

### If Manual Installation Works

1. Add an `install_skill` MCP tool to the connector that:
   - Fetches the skill
   - Writes files to the cache
   - Updates installed_plugins.json
   - Returns success/instructions to restart

2. Consider adding Skillport as a "virtual marketplace" in `known_marketplaces.json`

### If Manual Installation Fails

1. Research what additional metadata/registration is required
2. Consider alternative approaches:
   - Hook into Claude Code's plugin system differently
   - Provide a CLI script that wraps installation
   - Accept that Claude Code users must manually copy files

---

## Known Issues

### Issue 1: `whoami` ID Not Captured from Claude Code CLI

**Observed:** When calling `whoami` from Claude Code (via remote MCP), the ID field returns `undefined:undefined`.

```json
{
  "id": "undefined:undefined",
  "email": "jack@craftycto.com",
  "name": "Jack Ivers"
}
```

**Expected:** Should return `google:<user-id>` like it does from Claude.ai.

**Hypothesis:** The OAuth flow or session props may work differently when accessed via Claude Code's remote MCP transport vs Claude.ai's connector system. Need to investigate:
- How `this.props` is populated in the McpAgent for remote MCP connections
- Whether Claude Code passes OAuth tokens differently than Claude.ai
- Server-side logging to see what's received

**Impact:** User identity is still captured via email, but the unique ID needed for `access.json` editor permissions won't work.

### Issue 2: Cloudflare "Too Many Subrequests" Error

**Observed:** First call to `fetch_skill` for multi-file skills sometimes fails:

```json
{"error":"Failed to fetch skill","message":"Too many subrequests."}
```

**Cause:** Cloudflare Workers have a limit of 50 subrequests per request. When fetching a skill with many files, the connector makes multiple GitHub API calls that can exceed this limit.

**Workaround:** Retry the request (usually succeeds on second attempt).

**Potential Fixes:**
1. **Batch GitHub API calls:** Use the Trees API to fetch directory contents in one call
2. **Cache responses:** Cache skill files in KV to reduce GitHub calls
3. **Lazy loading:** Return SKILL.md immediately, fetch other files on demand
4. **Reduce file count:** Evaluate if all files need to be fetched upfront
