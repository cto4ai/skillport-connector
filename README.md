> **This is the Skillport Connector repository** — the Claude Connector that bridges your Skill Marketplace to Claude.ai and Claude Desktop.
> Looking for the Skillport Marketplace template? → [skillport-marketplace](https://github.com/cto4ai/skillport-marketplace)

---

# Skillport

**Share Claude Skills across your organization—on every Claude surface.**

Anthropic built something elegant with their Plugin Marketplace concept for Claude Code: a GitHub repository becomes a shared library of Skills that developers can browse and install. Skillport extends this same capability to Claude.ai, Claude Desktop, and Claude Mobile.

Your team's experts write Skills once. Everyone in the organization can discover and use them, wherever they use Claude.

---

## What Skillport Does

Anthropic's Plugin Marketplace works beautifully for developers in Claude Code. Skillport brings that same experience to the rest of your organization:

| Surface | Native Plugin Marketplace | With Skillport |
|---------|:-------------------------:|:--------------:|
| Claude Code | ✅ | ✅ |
| Claude.ai (web) | — | ✅ |
| Claude Desktop | — | ✅ |
| Claude Mobile | — | ✅ (syncs from web/desktop) |

One repository. Every Claude surface. Private to your organization.

---

## How It Works

### For Claude Users

Add your organization's Skillport Connector in Claude.ai or Claude Desktop (Settings → Connectors), authenticate with your corporate identity, and you're connected. Browse available Skills, install what you need, check for updates—all through natural conversation.

### For Skill Creators

Your organization's Skills live in a GitHub repository. Write Skills in Markdown, organize them by team or function, use your existing workflow—pull requests, code review, version history. The Skillport Connector bridges that repository to every Claude surface.

### Under the Hood

Skillport Connector deploys to Cloudflare Workers and uses a single-tool architecture inspired by Anthropic's Programmable Tool Calling patterns. Low context overhead. Fast responses. The Marketplace repository follows Anthropic's Plugin Marketplace standard—compatible with Claude Code's native `/plugin` command if you choose to make it public.

---

## The Skillport Skill

Skillport operates through its own Skill—a meta-skill that handles browsing, installation, and updates through natural conversation:

> "What skills are available?"

Claude lists your organization's Skills with descriptions.

> "Install the proposal-writer skill"

Claude packages the Skill and presents a one-click install button.

> "Check for updates"

Claude compares installed versions against the marketplace.

The Skillport Skill also supports creators: authoring new Skills, editing existing ones, managing versions. It includes a comprehensive guide to Skill best practices, helping your team write effective Skills.

---

## Private Libraries

With Anthropic's Plugin Marketplace, repositories need to be public. Skillport adds private repository support—your organization's Skills stay internal:

- The Connector authenticates with GitHub using a service token
- Users authenticate via OAuth (Google today, Microsoft Entra coming)
- Access control defines who can read vs. who can edit

Your proprietary workflows, prompts, and domain knowledge remain private.

---

## Claude Connector Compatible

Skillport Connector is fully compatible with Anthropic's Claude Connector standard, including OAuth authentication. Users add a URL, authenticate once with their corporate identity, and they're connected.

This matters because Claude Connectors work everywhere—Claude.ai on the web, Claude Desktop on Mac and Windows. Skills installed through the Connector sync to Claude's mobile apps automatically.

---

## Skill Versioning

Anthropic's Plugin Marketplace includes version tracking—for Claude Code users with public repositories. Skillport brings that same capability to all Claude surfaces, including private repositories:

- Skills are versioned in your repository's `plugin.json`
- Users can check which version they have installed
- Updates are discoverable through conversation

When your team improves a Skill, everyone can update with a single interaction—whether they use Claude.ai, Claude Desktop, or Claude Code.

---

## Plugin Marketplace Compliant

The Skillport Marketplace template follows Anthropic's Plugin Marketplace standard exactly. This means:

- If you choose to make your repository public, Claude Code users can access your Skills directly via `/plugin`—no Connector needed
- The same repository structure works for developers (native, if public) and everyone else (via Connector)
- You're building on Anthropic's standard, not around it

For private repositories, all users—including Claude Code users—access Skills through the Connector.

The template is available as a GitHub Public Template with "Use this template" for quick setup.

---

## Open Source

Skillport is fully open source under the MIT license:

| Repository | Purpose |
|------------|---------|
| [skillport-connector](https://github.com/cto4ai/skillport-connector) | Claude Connector (deploy your own) |
| [skillport-marketplace](https://github.com/cto4ai/skillport-marketplace) | GitHub Template for your Skills repository |

Clone, configure, deploy. Your infrastructure, your control.

---

## Quick Start

### 1. Create Your Marketplace

Use the [Skillport Marketplace template](https://github.com/cto4ai/skillport-marketplace):

1. Click "Use this template" on GitHub
2. Update `.claude-plugin/marketplace.json` with your marketplace name and owner info
3. Add your Skills in `plugins/your-group/skills/`
4. The repository is ready

### 2. Deploy Your Connector

Skillport Connector deploys to Cloudflare Workers—Cloudflare is a leader in MCP infrastructure and the Connector is configured for their platform out of the box.

```bash
git clone https://github.com/cto4ai/skillport-connector
cd skillport-connector
npm install

# Configure before deploying (see full setup guide below):
# - wrangler.toml with your marketplace repo
# - Google OAuth credentials
# - GitHub token for repository access

npm run deploy
```

Your configuration lives in untracked files (`wrangler.toml`, `.dev.vars`) and Cloudflare secrets—updates are just `git pull && npm install && npm run deploy`.

### 3. Connect Users

1. Share your Connector URL
2. Users add it in Claude.ai → Settings → Connectors
3. Users authenticate with corporate identity
4. Done—Skills are available

---

## Deploy Your Own Connector

Complete step-by-step guide to deploying Skillport Connector for your organization.

### Prerequisites

- **Cloudflare account** ($5/mo Workers Paid plan recommended)
- **Google Cloud Console** access (for OAuth credentials)
- **GitHub** account with access to your marketplace repository
- **Node.js v20+** installed locally

### Step 1: Clone and Configure

```bash
git clone https://github.com/cto4ai/skillport-connector
cd skillport-connector
npm install

# Copy configuration templates
cp wrangler.toml.example wrangler.toml
cp .dev.vars.example .dev.vars
```

> **Note:** Clone directly for easiest updates (`git pull`). Your config lives in untracked files and secrets. Fork only if you need to modify the connector code itself.

### Step 2: Create Cloudflare KV Namespace

```bash
npx wrangler kv namespace create OAUTH_KV
```

Copy the namespace ID from the output and update `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "OAUTH_KV"
id = "YOUR_ID_FROM_OUTPUT"
```

### Step 3: Configure Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Enable the **Google+ API** (or "Google People API")
4. Go to **Credentials** → **Create Credentials** → **OAuth client ID**
5. Select **Web application**
6. Add authorized redirect URI: `https://your-connector.your-domain.workers.dev/callback`
7. Copy the **Client ID** and **Client Secret**

### Step 4: Create GitHub Tokens

The connector uses two tokens for different access levels:

**Read Token** (`GITHUB_SERVICE_TOKEN`) — for browsing and installing skills:
1. Go to [GitHub Settings → Developer settings → Fine-grained tokens](https://github.com/settings/tokens?type=beta)
2. Create a token with:
   - Repository access: Select your marketplace repository
   - Permissions: **Contents → Read-only**

**Write Token** (`GITHUB_WRITE_TOKEN`) — for creating and editing skills:
1. Create a second fine-grained token with:
   - Repository access: Select your marketplace repository
   - Permissions: **Contents → Read and write**

### Step 5: Update Configuration

Edit `wrangler.toml`:

```toml
[vars]
MARKETPLACE_REPO = "your-org/your-marketplace"
CONNECTOR_URL = "https://your-connector.your-domain.workers.dev"
# GOOGLE_ALLOWED_DOMAINS = "your-domain.com"  # Optional: restrict access
```

### Step 6: Set Secrets

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
# Paste your Google OAuth client ID

npx wrangler secret put GOOGLE_CLIENT_SECRET
# Paste your Google OAuth client secret

npx wrangler secret put GITHUB_SERVICE_TOKEN
# Paste your read-only GitHub token

npx wrangler secret put GITHUB_WRITE_TOKEN
# Paste your read-write GitHub token (for editor features)
```

**Optional:** To restrict access to specific Google Workspace domains:
```bash
npx wrangler secret put GOOGLE_ALLOWED_DOMAINS
# Enter comma-separated domains: acme.com,acme.io
```

### Step 7: Deploy

```bash
npm run deploy
```

Your connector is now live at your Workers URL.

### Step 8: Add to Claude

#### Claude.ai / Claude Desktop

1. Open Settings → Integrations
2. Click "Add" → MCP
3. Enter your connector URL with the `/mcp` endpoint:
   ```
   https://your-connector.your-domain.workers.dev/mcp
   ```
   (Use `/sse` as fallback for older clients)
4. Complete Google OAuth authentication
5. Test with: *"What skills are available?"*

**For Claude.ai Team/Enterprise:** Add these to your domain allowlist (Admin Settings → Capabilities):
- `your-connector.your-domain.workers.dev` — for REST API calls
- `raw.githubusercontent.com` — for fetching skill content from GitHub

#### Claude Code

1. Add the connector as a remote MCP:
   ```bash
   claude mcp add --transport http skillport https://your-connector.your-domain.workers.dev/mcp
   ```
2. In Claude Code, run `/mcp` → select your connector → Authenticate
3. Complete Google OAuth in browser
4. Test with: *"What skills are available?"*

**Scope options:** Add `--scope user` to make available across all projects, or `--scope project` to share via `.mcp.json`.

### Troubleshooting

**"Unauthorized domain" error**
- Check `GOOGLE_ALLOWED_DOMAINS` matches your Google Workspace domain
- Users with personal Gmail accounts won't have a domain (`hd` field)

**OAuth redirect errors**
- Verify the redirect URI in Google Cloud Console matches exactly
- Include the `/callback` path

**GitHub API errors**
- Verify your `GITHUB_SERVICE_TOKEN` has access to the marketplace repo
- For private repos, ensure the `repo` scope is included

**View logs**
```bash
npx wrangler tail
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    YOUR GITHUB REPO                          │
│                    (private or public)                       │
│                                                              │
│  .skillport/access.json          ← Access control            │
│  .claude-plugin/marketplace.json ← Skill index               │
│  plugins/*/skills/*/SKILL.md     ← Your Skills               │
└─────────────────────────────────────────────────────────────┘
                 │                              │
                 │                              │ (direct, if public)
                 ▼                              ▼
┌────────────────────────────────────┐  ┌──────────────┐
│        SKILLPORT CONNECTOR         │  │  Claude Code │
│        (Cloudflare Workers)        │  │    (CLI)     │
│                                    │  └──────────────┘
│  • Single-tool architecture        │
│  • OAuth authentication            │
│  • GitHub API integration          │
│  • Access control enforcement      │
└────────────────────────────────────┘
                 │
     ┌───────────┼───────────┬───────────┐
     ▼           ▼           ▼           ▼
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│Claude.ai │ │  Claude  │ │  Claude  │ │  Claude  │
│  (web)   │ │ Desktop  │ │  Mobile  │ │   Code   │
└──────────┘ └──────────┘ └──────────┘ └──────────┘
```

Claude Code users can access public repositories directly via Plugin Marketplace. For most teams, however, the Connector provides a better experience—with support for private repositories a key consideration for enterprise use.

---

## Costs

Skillport runs on Cloudflare's $5/mo Workers Paid plan. The free tier exists but causes intermittent errors with Durable Objects.

| Resource | Paid Plan Limit | Typical Usage |
|----------|-----------------|---------------|
| Requests | 10M/mo | ~30,000/mo for 50-person team |
| KV Storage | 1GB included | Minimal (OAuth tokens) |

Your primary investment is time: writing good Skills and helping your team discover them.

---

## FAQ

**Do users need GitHub access?**

No. Users authenticate via OAuth. The Connector reads GitHub on their behalf.

**Do users need to install anything?**

No. Claude Connectors are URLs. Add in Settings, authenticate, done.

**Can Skills be restricted to certain users?**

Yes. Access control supports per-skill and per-group permissions.

**Do Skills work on mobile?**

Yes. Skills installed via Claude.ai or Desktop sync to mobile automatically.

**What about Claude Code users?**

Claude Code can access public repositories directly via Plugin Marketplace (`/plugin add org/repo`). For private repositories, add the Connector as a remote MCP: `claude mcp add --transport http skillport https://your-connector.workers.dev/mcp`

---

## Getting Help

**Documentation:** See the setup guides in each repository.

**Implementation Help:** Skillport was created by [Jack Ivers](https://craftycto.com), a fractional CTO specializing in AI infrastructure. If you need help deploying Skillport, designing your Skill architecture, or training your team—[get in touch](https://craftycto.com/contact).

---

## License

MIT—use it, modify it, deploy it.

---

## Acknowledgments

Skillport builds on Anthropic's excellent work:

- [MCP Connector](https://platform.claude.com/docs/en/agents-and-tools/mcp-connector)
- [Plugin Marketplaces](https://code.claude.com/docs/en/plugin-marketplaces)
- [Programmatic Tool Calling](https://platform.claude.com/docs/en/agents-and-tools/tool-use/programmatic-tool-calling)

And runs on [Cloudflare Workers](https://workers.cloudflare.com/).
