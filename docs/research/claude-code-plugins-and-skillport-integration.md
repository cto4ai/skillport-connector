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
**Status:** ❌ FAILED - marketplace registration required

### Hypothesis

Can we programmatically install a Skillport skill into Claude Code's plugin cache, bypassing `/plugin install`?

### Result: No - Marketplace Must Be Registered

The manually installed plugin did **not appear** in `/plugin` list. Claude Code only showed the three original plugins from registered marketplaces.

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

### Root Cause: Marketplace Registration Required

Claude Code validates that plugins come from **registered marketplaces** in `~/.claude/plugins/known_marketplaces.json`.

**Format of known_marketplaces.json:**
```json
{
  "marketplace-name": {
    "source": {
      "source": "github",
      "repo": "owner/repo"
    },
    "installLocation": "/Users/.../.claude/plugins/marketplaces/marketplace-name",
    "lastUpdated": "2025-12-31T..."
  }
}
```

**Why our install failed:** "skillport" isn't in `known_marketplaces.json`, so Claude Code ignored the `data-analyzer@skillport` entry in `installed_plugins.json`.

### Other Potential Issues (Not Yet Tested)

1. **gitCommitSha field:** We omitted this field. Native installations include it for update tracking.

2. **Marketplace clone required:** Each marketplace has an `installLocation` pointing to a cloned repo in `~/.claude/plugins/marketplaces/`. We didn't create this.

### What Would Be Required for This to Work

To make manual installation work, we would need to:

1. **Register a fake marketplace** in `known_marketplaces.json`:
   ```json
   "skillport": {
     "source": { "source": "github", "repo": "craftycto/skillport-marketplace" },
     "installLocation": "/Users/.../.claude/plugins/marketplaces/skillport",
     "lastUpdated": "..."
   }
   ```

2. **Create the marketplace directory** at `~/.claude/plugins/marketplaces/skillport/` with proper structure

3. **Include gitCommitSha** in the installed_plugins.json entry

This is getting complex - we're essentially recreating Claude Code's native plugin system.

---

## Next Steps

### Option A: Full Marketplace Registration (Complex)

Try registering Skillport as a marketplace:
1. Add entry to `known_marketplaces.json`
2. Create fake marketplace directory structure
3. Add gitCommitSha to installed_plugins.json
4. Test again

**Downside:** Requires modifying multiple system files, fragile, may break with Claude Code updates.

### Option B: Accept MCP-Only for Claude Code (Simple)

Claude Code users use Skillport via MCP tools only:
1. `list_skills` - Browse available skills
2. `fetch_skill` - Get skill files + instructions
3. User manually saves files where they want them

**Upside:** Works today, no hacking required, consistent with how other MCP tools work.

### Option C: CLI Install Script (Middle Ground)

Provide a CLI command that properly installs:
```bash
npx skillport-cli install data-analyzer
```

This script would:
1. Fetch from Skillport Connector
2. Register Skillport marketplace (first time only)
3. Write files to cache
4. Update installed_plugins.json properly

**Upside:** One-time setup, then works like native plugins.

### Recommendation

**Start with Option B** (MCP-only). It works today and is the simplest path. Claude Code users can still benefit from Skillport's private repo access - they just save the files manually.

Consider Option C later if there's demand for tighter Claude Code integration.

---

## Finding 6: User-Level Skills Work! (Tested ✅)

**Test Date:** 2025-12-31
**Status:** ✅ SUCCESS

### Discovery

Claude Code supports **user-level skills** at `~/.claude/skills/` that don't require marketplace registration!

### Test Results

1. **Installed skill to `~/.claude/skills/data-analyzer/`** - just the skill files, no plugin.json needed
2. **Started new Claude Code session**
3. **Asked "is the data-analyzer skill available?"**
4. **Response:** "Yes, the data-analyzer skill is available. It's listed as a **user-level skill** in your configuration."

### Even Better: Natural Language Install Works!

Tested: `install soil-data-analyzer from skillport`

Claude Code automatically:
1. Called `list_skills` via Skillport MCP to find the skill
2. Called `fetch_skill` to get all files
3. Created directory at `~/.claude/skills/soil-data-analyzer/`
4. Wrote all files (SKILL.md, scripts, references)
5. Made scripts executable with `chmod +x`
6. Informed user to start new session

**Full interaction log:**
```
> install soil-data-analyzer from skillport

⏺ Found it. Let me fetch the skill files:
⏺ skillport - fetch_skill (MCP)(name: "soil-data-analyzer")
⏺ I'll install the soil-data-analyzer skill for you...
⏺ Bash(mkdir -p ~/.claude/skills/soil-data-analyzer/...)
⏺ Write(~/.claude/skills/soil-data-analyzer/SKILL.md)
⏺ Write(~/.claude/skills/soil-data-analyzer/references/soil_parameters.md)
⏺ Write(~/.claude/skills/soil-data-analyzer/references/supported_formats.md)
⏺ Write(~/.claude/skills/soil-data-analyzer/scripts/analyze_soil_data.py)
⏺ Write(~/.claude/skills/soil-data-analyzer/scripts/soil_quality_check.py)
⏺ Bash(chmod +x ~/.claude/skills/soil-data-analyzer/scripts/*.py)

⏺ Installed soil-data-analyzer v1.0.2 to ~/.claude/skills/soil-data-analyzer/
  Important: Start a new conversation to use this skill.
```

### Skill Directory Locations

| Location | Scope | Registration Required |
|----------|-------|----------------------|
| `~/.claude/plugins/cache/` | User | Yes - marketplace + installed_plugins.json |
| `~/.claude/skills/<skill>/` | User | **No** - just drop files here ✅ |
| `.claude/skills/<skill>/` | Project | **No** - just drop files here ✅ |

### Issue: Token-Heavy Interaction

The `fetch_skill` MCP response was **~10.9k tokens**. This is expensive for every install.

**Breakdown:**
- SKILL.md content
- Multiple reference files
- Multiple Python scripts
- Plugin metadata

### Proposed Solution: Installer Skill with Bash Script

Create a `skillport-installer` skill that uses a local bash script instead of MCP file transfer.

#### Why Bash Instead of NPX?

| Approach | Complexity | Distribution | Platform |
|----------|------------|--------------|----------|
| `npx skillport-cli` | High - npm package | npm registry | Cross-platform |
| Bash script in skill | Low - just files | Via Skillport itself | Mac/Linux |

Bash is simpler and can be distributed as a Skillport skill - no npm package needed.

#### Proposed Structure

**~/.claude/skills/skillport-installer/SKILL.md:**
```markdown
# Skillport Installer

When user says "install [skill] from skillport", run:
\`\`\`bash
~/.claude/skills/skillport-installer/install.sh <skill-name>
\`\`\`

This is more token-efficient than using MCP fetch_skill.
```

**~/.claude/skills/skillport-installer/install.sh:**
```bash
#!/bin/bash
SKILL_NAME=$1
API_KEY=${SKILLPORT_API_KEY:-""}
CONNECTOR_URL="https://skillport-connector.jack-ivers.workers.dev"

if [ -z "$API_KEY" ]; then
  echo "Error: Set SKILLPORT_API_KEY environment variable"
  echo "Get your API key from: $CONNECTOR_URL/settings"
  exit 1
fi

# Fetch skill JSON from connector REST endpoint
curl -s -H "Authorization: Bearer $API_KEY" \
  "$CONNECTOR_URL/api/skills/$SKILL_NAME" \
  | python3 -c "
import json, sys, os

data = json.load(sys.stdin)
if 'error' in data:
    print(f\"Error: {data['error']}\")
    sys.exit(1)

skill_name = data['skill']['name']
skill_dir = os.path.expanduser(f'~/.claude/skills/{skill_name}')

# Create directories and write files
for f in data['files']:
    path = os.path.join(skill_dir, f['path'])
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w') as out:
        out.write(f['content'])
    # Make Python scripts executable
    if path.endswith('.py'):
        os.chmod(path, 0o755)

print(f'✓ Installed {skill_name} v{data[\"skill\"][\"version\"]} to {skill_dir}')
print('  Restart Claude Code to use this skill.')
"
```

#### Token Savings

| Approach | Tokens Used | Why |
|----------|-------------|-----|
| MCP fetch_skill + Claude writes files | ~11,000+ | Full file contents in conversation |
| Script-based install | ~100-200 | Just command + output |

#### Authentication Options

| Method | Setup | Security | Recommendation |
|--------|-------|----------|----------------|
| API key in `SKILLPORT_API_KEY` env var | Simple | Medium | ✅ Start here |
| OAuth token in `~/.skillport/auth.json` | Medium | Good | Future enhancement |
| Browser OAuth flow on first run | Complex | Best | If needed |

**Recommendation:** Start with API key auth. Users set `SKILLPORT_API_KEY` in their shell profile. Simple and works.

#### Required Connector Changes

1. **Add REST endpoint:** `GET /api/skills/:name`
   - Returns same JSON as MCP `fetch_skill` tool
   - Accepts `Authorization: Bearer <api_key>` header

2. **Add API key generation:**
   - New page at `/settings` to generate/revoke API keys
   - Store in KV, associate with user email

3. **Update CORS:** Allow requests from CLI (not browser-based, so simpler)

#### Dependencies

All available on macOS by default:
- `bash` ✅
- `curl` ✅
- `python3` ✅

No need for `jq` - Python handles JSON parsing.

#### Distribution

The installer skill itself is distributed via Skillport:
```
> install skillport-installer from skillport
```

Bootstrapping problem: First install uses MCP (token-heavy), subsequent installs use the script (token-efficient).

---

### Alternative: Hybrid Skill + Script Approach

Instead of a standalone script with separate API key auth, consider a Claude Code skill that uses scripts for efficiency while staying within the MCP ecosystem.

#### Comparison of Approaches

| Approach | Tokens | Auth | UX |
|----------|--------|------|-----|
| **Pure MCP** (current) | ~11k+ | ✅ MCP OAuth | Good - Claude handles everything |
| **Pure Script** | ~100 | ❌ Needs API key | Basic - just script output |
| **Hybrid Skill + Script** | Varies | ✅ MCP OAuth | Best - skill guides, script executes |

#### Hybrid Option 3a: Script Handles File Writing Only

```
1. Claude Code calls MCP fetch_skill (still ~11k tokens)
2. Claude pipes JSON to script via stdin
3. Script writes all files (faster than multiple Write calls)
4. Script returns success message
5. Claude reports result
```

**SKILL.md instruction:**
```markdown
When installing a skill:
1. Call fetch_skill to get the skill data
2. Run: echo '$SKILL_JSON' | ~/.claude/skills/skillport-manager/write-skill.sh
3. Report the result to the user
```

**Tradeoff:** Saves time (one script vs many Write calls) but NOT tokens (still fetches full content into context).

#### Hybrid Option 3b: Script with MCP Session Passthrough

```
1. Claude runs: install.sh data-analyzer --session $MCP_SESSION
2. Script calls MCP tools using Claude's auth session
3. Script writes files directly
4. Script returns success/failure
```

**Challenge:** Unknown if MCP session can be shared with subprocess. Would require investigation into Claude Code internals.

#### Hybrid Option 3c: Skill Orchestrates, Minimal Context

```
1. skillport-manager skill loaded, knows how to install
2. User: "install data-analyzer from skillport"
3. Skill instructs Claude to run install script
4. Script calls Skillport REST API (needs API key)
5. Script writes files, returns success/failure
6. Claude reports friendly result with next steps
```

**Tradeoff:** Still needs API key, but skill provides:
- Better error messages
- Guidance on next steps
- Consistent UX

#### The Core Challenge: Auth Isolation

The MCP OAuth session belongs to Claude Code's process. A subprocess script cannot access it because:
- OAuth tokens are in Claude's memory, not on disk
- MCP protocol is over the Claude ↔ Connector connection
- Scripts run as separate processes

**Options to solve this:**

| Solution | Feasibility | Notes |
|----------|-------------|-------|
| Share MCP session with script | Unknown | Would need Claude Code support |
| Script uses separate API key | Works | But requires extra auth setup |
| Claude streams to file instead of context | Unknown | Would need new MCP tool design |
| Accept token cost, optimize elsewhere | Works | May be acceptable for infrequent installs |

#### Recommendation: Start Simple, Optimize Later

1. **Phase 1 (now):** Pure MCP approach works. Accept ~11k tokens per install.
2. **Phase 2:** Add REST API + API key for power users who install frequently.
3. **Phase 3:** Investigate MCP session sharing if there's demand.

For most users, installing skills is infrequent. The token cost may be acceptable, especially with Claude Max's higher limits.

---

## Proposed Solution: Token-Based Installation

**Status:** Proposed  
**Complexity:** Medium  
**Token Savings:** ~11k → ~100 tokens

### The Insight

Instead of returning all skill content via MCP (expensive), return a short-lived install token that a script can redeem for the full content.

### How It Works

```
1. User: "install data-analyzer from skillport"
2. Claude calls MCP: get_install_token("data-analyzer")
3. Connector:
   - Validates user auth (MCP OAuth session)
   - Generates short-lived token (5 min, single-use)
   - Stores in KV: token → { skill, user, expires }
   - Returns: { token: "sk_abc123", skill: "data-analyzer", version: "1.0.0" }
4. Claude runs: install.sh sk_abc123
5. Script calls: curl https://connector/api/install/sk_abc123
6. Connector validates token, returns full skill JSON
7. Script writes files, reports success
```

### Why This Solves the Auth Problem

| Challenge | Solution |
|-----------|----------|
| MCP OAuth can't be shared with scripts | Token inherits auth - no separate API key |
| Security risk of long-lived tokens | Short-lived (5 min) and single-use |
| Script needs to authenticate | Just passes the token - no OAuth flow |

### MCP Response: ~100 Tokens

**New tool: `get_install_token`**
```json
{
  "install_token": "sk_install_abc123",
  "skill": "data-analyzer",
  "version": "1.0.0",
  "expires_in": 300,
  "command": "~/.claude/skills/skillport-installer/install.sh sk_install_abc123"
}
```

Compare to current `fetch_skill` which returns ~11k tokens of file contents.

### New Connector Components

**1. MCP Tool: `get_install_token`**
```typescript
{
  name: "get_install_token",
  description: "Get a short-lived token for installing a skill via script. More efficient than fetch_skill for Claude Code users.",
  parameters: {
    name: { type: "string", description: "Skill name" }
  },
  returns: {
    install_token: "string - single-use token",
    skill: "string - skill name",
    version: "string - skill version", 
    expires_in: "number - seconds until expiry",
    command: "string - command to run"
  }
}
```

**2. REST Endpoint: `GET /api/install/:token`**

Lives in the same Cloudflare Worker as the MCP endpoint:

```
skillport-connector.workers.dev/
├── /sse                    ← MCP (existing)
├── /callback               ← OAuth callback (existing)
└── /api/install/:token     ← REST endpoint (new)
```

**Why same Worker:**

| Benefit | Why |
|---------|-----|
| Shared KV | MCP writes token, REST reads it - same namespace |
| Shared code | Both use `fetchSkillFromGitHub()` |
| Single deployment | One `wrangler deploy` |
| Same infra | CORS, error handling already set up |

**Implementation:**

```typescript
export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    
    // Existing routes
    if (url.pathname === '/sse') {
      return handleMCP(request, env);
    }
    if (url.pathname === '/callback') {
      return handleOAuthCallback(request, env);
    }
    
    // New REST endpoint
    if (url.pathname.startsWith('/api/install/')) {
      const token = url.pathname.split('/')[3];
      return handleInstallToken(token, env);
    }
    
    return new Response('Not found', { status: 404 });
  }
}

async function handleInstallToken(token: string, env: Env) {
  const tokenData = await env.OAUTH_KV.get(`install_token:${token}`, 'json');
  
  if (!tokenData) {
    return Response.json({ error: 'Token not found or expired' }, { status: 404 });
  }
  
  if (tokenData.used) {
    return Response.json({ error: 'Token already used' }, { status: 410 });
  }
  
  // Mark as used
  await env.OAUTH_KV.put(`install_token:${token}`, 
    JSON.stringify({ ...tokenData, used: true }),
    { expirationTtl: 60 }
  );
  
  // Fetch and return skill (reuse existing logic)
  const skillData = await fetchSkillFromGitHub(tokenData.skill, env);
  return Response.json(skillData);
}
```

**3. KV Storage Schema**
```
Key: install_token:sk_abc123
Value: {
  skill: "data-analyzer",
  user: "jack@craftycto.com",
  created: 1735678900,
  expires: 1735679200,
  used: false
}
TTL: 5 minutes
```

### Install Script

**~/.claude/skills/skillport-installer/install.sh:**
```bash
#!/bin/bash
set -e

TOKEN=$1
CONNECTOR_URL="https://skillport-connector.jack-ivers.workers.dev"

if [ -z "$TOKEN" ]; then
  echo "Usage: install.sh <install-token>"
  exit 1
fi

# Fetch skill using install token
curl -sf "$CONNECTOR_URL/api/install/$TOKEN" | python3 -c "
import json, sys, os

data = json.load(sys.stdin)
if 'error' in data:
    print(f\"Error: {data['error']}\")
    sys.exit(1)

skill_name = data['skill']['name']
skill_dir = os.path.expanduser(f'~/.claude/skills/{skill_name}')

# Create directories and write files
for f in data['files']:
    path = os.path.join(skill_dir, f['path'])
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w') as out:
        out.write(f['content'])
    if path.endswith('.py'):
        os.chmod(path, 0o755)

print(f'✓ Installed {skill_name} v{data[\"skill\"][\"version\"]} to {skill_dir}')
print('  Restart Claude Code to use this skill.')
"
```

### Skillport-Installer Skill

**~/.claude/skills/skillport-installer/SKILL.md:**
```markdown
# Skillport Installer

Efficient skill installation using install tokens.

## When to Use

When user asks to install a skill from Skillport:
1. Call `get_install_token` with the skill name
2. Run the install command from the response
3. Report success and remind user to restart Claude Code

## Example

User: "install data-analyzer from skillport"

1. Call Skillport MCP tool `get_install_token("data-analyzer")`
2. Run: `~/.claude/skills/skillport-installer/install.sh <token>`
3. Report: "Installed data-analyzer v1.1.3. Restart Claude Code to use it."
```

### Token Comparison

| Approach | MCP Response | Total Tokens | Auth |
|----------|-------------|--------------|------|
| Current `fetch_skill` | ~11k | ~11k+ | MCP OAuth ✅ |
| Separate API key | ~100 | ~100 | Needs setup ❌ |
| **Install token** | ~100 | ~100 | MCP OAuth ✅ |

### Speed Comparison

Beyond token cost, **wall-clock time** is the bigger UX issue. Current installs take minutes.

**Why current approach is slow:**
```
1. MCP fetch_skill         → Multiple GitHub API calls (can hit rate limits)
2. Claude receives ~11k tokens → Processing time to parse response
3. Claude calls Write() × N  → Each file is a full round-trip
4. Claude calls chmod()      → Another round-trip  
5. Claude reports success    → More processing
```

Each `Write()` is a round-trip: Claude → tool → response → Claude thinks → next action.

For a skill with 5 files: **5+ round-trips plus thinking time between each.**

**Why token-based approach is fast:**
```
1. MCP get_install_token   → Tiny response (~100 tokens), instant
2. Claude runs install.sh  → Single Bash() call
3. Script runs locally:
   - curl: one HTTP request (~1 sec)
   - python: writes all files (~100ms)
   - chmod: instant
4. Script returns success  → Done
```

**One `Bash()` call vs 5+ `Write()` calls.**

| Metric | Current (fetch_skill) | Token-based |
|--------|----------------------|-------------|
| Tool calls | 1 MCP + N Write + chmod | 1 MCP + 1 Bash |
| Round-trips | N + 2 | 2 |
| Claude thinking cycles | N + 2 | 2 |
| Estimated time | **2-5 minutes** | **5-10 seconds** |

The script runs at native speed - no waiting for Claude to process each file.

### Security Considerations

| Risk | Mitigation |
|------|------------|
| Token interception | HTTPS only, short-lived (5 min) |
| Token reuse | Single-use, marked as consumed |
| Token guessing | Cryptographically random (32+ bytes) |
| Scope creep | Token only valid for specific skill |

### Implementation Priority

This is the **recommended approach** for Phase 2:

1. **Phase 1 (current):** Pure MCP works, accept token cost
2. **Phase 2 (next):** Implement token-based installation
   - Add `get_install_token` MCP tool
   - Add `/api/install/:token` REST endpoint
   - Create `skillport-installer` skill with script
3. **Phase 3:** Optimize further if needed (caching, etc.)

### Open Questions

1. **Token format:** UUID v4? Base64? Prefixed (sk_install_...)?
2. **Token storage:** KV with TTL is simplest. Need cleanup job?
3. **Error handling:** What if script fails mid-install?
4. **Rollback:** Should failed installs clean up partial files?

---

## Revised Recommendation

### For Claude Code Users

**Current (works today):**
```
> install [skill] from skillport
```
Claude Code handles it via MCP. Token-heavy but functional.

**Future (with installer skill):**
```
> install [skill] from skillport
```
Claude Code runs install script. Token-efficient.

### For Claude.ai / Desktop Users

Continue using Skillport Connector via Settings → Connectors. The `fetch_skill` response includes installation instructions for the native Skills UI.

### Priority Order

1. ✅ **Done:** Verify MCP + user-level skills work
2. ✅ **Done:** Test soil-data-analyzer runs in new session (SUCCESS!)
3. 📋 **Future:** Build skillport-installer skill with script
4. 📋 **Future:** Add REST API endpoint to connector for script access

---

## Finding 7: Full End-to-End Skill Execution (Tested ✅)

**Test Date:** 2025-12-31
**Status:** ✅ COMPLETE SUCCESS

### Test: Run Installed Skill on Real Data

```
> is the soil data analyzer skill installed

⏺ Yes, the soil-data-analyzer skill is installed. It's listed as a user-level skill.

> run the soil data analyzer skill

⏺ /soil-data-analyzer
⏺ The Soil Data Analyzer skill is ready...

> /Users/jackivers/Downloads/Soil-Results-1501610.csv

⏺ Read(~/Downloads/Soil-Results-1501610.csv)
⏺ Bash(python3 scripts/analyze_soil_data.py "...")
  ⎿  ## Soil Data Summary: Soil-Results-1501610.csv
     - **Samples:** 1
     - **Parameters:** 59
     … +226 lines

⏺ [Intelligent analysis of results, noting suspicious data values]
```

### What Worked

| Step | Result |
|------|--------|
| Skill recognition | ✅ Listed as user-level skill |
| Skill invocation | ✅ `/soil-data-analyzer` worked |
| File reading | ✅ Read CSV from Downloads |
| Script discovery | ✅ Found scripts in skill directory |
| Script execution | ✅ `python3` ran successfully |
| Output parsing | ✅ 226+ lines of analysis |
| Intelligent interpretation | ✅ Caught suspicious pH=1.3 values |

### Minor Issue: python vs python3

The script shebang uses `#!/usr/bin/env python` but macOS only has `python3`. Claude Code adapted:
```
⏺ Bash(python scripts/analyze_soil_data.py ...)
  ⎿  Error: command not found: python

⏺ Bash(python3 scripts/analyze_soil_data.py ...)
  ⎿  [Success]
```

**Fix:** Update skill scripts to use `#!/usr/bin/env python3`

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
