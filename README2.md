# Skillport

**Distribute Claude Skills to your team on Claude.ai and Claude Desktop.**

Skillport lets organizations share custom Claude Skills from a single GitHub repository. Your experts author Skills once; everyone in the org can install and use them, across all Claude surfaces: on the web at Claude.ai, in the Claude Desktop app on Mac and Windows, in Claude Code, and on the iOS and Android mobile apps. No technical setup required for end users.

---

## The Problem

Claude's Skills system is powerful but, for non-developers, isolated. Users create personal Skills in Claude.ai, but there's no native way to:

- Share Skills across a team or organization (other than manually sharing .skill archives)
- Version and update Skills centrally
- Control who can edit vs. who can install and use Skills

## The Solution

Skillport is two components that work together:

### Skillport Marketplace

A GitHub repository that follows the **Claude Code Plugin Marketplace standard** - the same format developers already use to share plugins in Claude Code. But with extensions that bring those capabilities to Claude's user-facing surfaces:

- **skillport-manager skill**: A meta-skill that orchestrates browsing, installation, and updates through natural conversation
- **Surface targeting**: Mark skills for `claude-ai`, `claude-desktop`, or both
- **Access control**: Define who can edit vs. who can use Skills

Your Skills live in version-controlled Markdown. Pull requests, code review, change history - your existing workflow.

### Skillport Connector

A **Claude Connector** that bridges your GitHub repository to Claude.ai and Claude Desktop:

```
                                                    ┌─────────────────┐
                                                    │   Claude.ai     │
                                                    │     (web)       │
                                                    └─────────────────┘
                                                              ▲
Your GitHub Repo       →    Skillport Connector    →──────────┼──────────┐
(Skillport Marketplace)     (Claude Connector)                │          │
                                                              ▼          ▼
                                                    ┌──────────────────────┐
                                                    │   Claude Desktop     │
                                                    │   (Mac / Windows)    │
                                                    └──────────────────────┘
                                                              │
                                                              ▼
                                                    ┌──────────────────────┐
                                                    │   Claude Mobile      │
                                                    │   (iOS / Android)    │
                                                    │   Skills sync here   │
                                                    └──────────────────────┘
```

Users add one URL in Settings → Connectors, authenticate with their corporate identity, and Skills from your repository become available.

**Mobile access included.** Skills installed via Claude.ai or Claude Desktop automatically sync to the Claude mobile apps (iOS/Android). You can't install Skills directly on mobile yet, but once installed elsewhere, they work on the go.

**One repository. All Claude surfaces. Managed access.**

---

## Why a Claude Connector?

Skillport is built as a **Claude Connector** - not a local MCP server. This matters:

|                            | Claude Connector (Skillport) |    Local MCP Server    |
| -------------------------- | :--------------------------: | :--------------------: |
| Works with Claude.ai (web) |              ✅              |           ❌           |
| Works with Claude Desktop  |              ✅              |           ✅           |
| Skills sync to mobile apps |              ✅              |           ❌           |
| End-user installation      |    One-click in Settings     | Edit JSON config files |
| Authentication             |        Built-in OAuth        |      DIY or none       |
| Updates                    |          Automatic           |    Manual reinstall    |

Local MCP servers only work with Claude Desktop, not Claude.ai on the web, and require each user to install software, edit configuration files, and restart Claude Desktop. They don't work with Claude.ai at all.

Claude Connectors are URLs. Users add them in Settings → Connectors, authenticate once, and they're done.

---

## Who This Is For

Skillport is designed for **organizations** that want to:

- Standardize how their teams interact with Claude
- Distribute domain-specific prompts and workflows
- Maintain control over AI tooling
- Enable non-technical users to benefit from expert-crafted Skills

If you're an individual user, Claude.ai's built-in Skills are probably sufficient. Skillport shines when you need to share Skills across a team.

---

## How It Works

### 1. Skills Live in GitHub

Your Skills are Markdown files in a GitHub repository:

```
your-org/claude-skills/
  plugins/
    sales-team/
      skills/
        proposal-writer/
          SKILL.md        ← "When writing proposals, always..."
        competitor-analysis/
          SKILL.md
    engineering/
      skills/
        code-review/
          SKILL.md
```

Version control, pull requests, code review - your existing workflow.

### 2. OAuth for Authentication

Users authenticate with **enterprise identity providers** they already use:

| Provider            | Status       |
| ------------------- | ------------ |
| **Google**          | ✅ Available |
| **Microsoft Entra** | 🚧 Coming    |

No separate passwords. No shared API keys. Users prove who they are with their corporate credentials, and that identity flows through to access control.

### 3. Access Control

Define who can read and who can edit in `.skillport/access.json`:

```json
{
  "editors": [
    { "id": "google:114339...", "label": "alice@yourcompany.com" },
    { "id": "google:229448...", "label": "bob@yourcompany.com" }
  ],
  "defaults": {
    "read": "*",
    "write": "editors"
  }
}
```

Everyone can use Skills. Only editors can create or modify them. Permissions are tied to authenticated identities from step 2.

### 4. The Connector

Skillport Connector is a **Claude Connector** deployed to Cloudflare Workers. It ties everything together:

- Reads your Skills repository via GitHub API
- Authenticates users via OAuth (step 2)
- Enforces access control (step 3)
- Serves Skills to Claude.ai and Claude Desktop

Users add the connector URL once in Claude.ai Settings → Connectors, authenticate with their corporate identity, and Skills from your repository become available.

### 5. The Manager Skill

The [Skillport Marketplace template](https://github.com/craftycto/skillport-marketplace) includes **skillport-manager**, a meta-skill that gives users a conversational interface:

- Browse and search available Skills
- One-click installation (packages Skills as `.skill` files)
- Check for and apply updates

Users never interact with tools directly - they just talk to Claude.

---

## What Users See

Once connected, users interact with Skills through natural conversation (via the skillport-manager skill):

> "What skills are available?"

Claude lists Skills from your marketplace with descriptions.

> "Install the proposal-writer skill"

Claude fetches the Skill, packages it as a `.skill` file, and presents a one-click install button. User clicks "Copy to your skills" - done.

> "Check for skill updates"

Claude compares installed versions against the marketplace and offers to update any that have changed.

No GitHub access needed. No command line. No file management. Just conversation.

---

## Quick Start

### Prerequisites

- GitHub repository (public or private)
- Cloudflare account (free tier works)
- Google Cloud OAuth credentials
- 30 minutes

### Deploy Your Connector

```bash
# Clone this repo
git clone https://github.com/craftycto/skillport-connector
cd skillport-connector

# Install dependencies
npm install

# Configure (see Setup Guide below)
cp .dev.vars.example .dev.vars
# Edit .dev.vars with your credentials

# Deploy to Cloudflare
npm run deploy

# Set production secrets
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put GITHUB_SERVICE_TOKEN
wrangler secret put COOKIE_ENCRYPTION_KEY
```

### Create Your Skills Repository

Use the [Skillport Marketplace template](https://github.com/craftycto/skillport-marketplace) to create your marketplace:

1. Click "Use this template" on GitHub
2. Add your Skills in `plugins/your-group/skills/`
3. Update `wrangler.toml` to point to your repo

### Connect Users

1. Share your connector URL: `https://your-connector.workers.dev/sse`
2. Users add it in Claude.ai → Settings → Connectors
3. Users authenticate with their corporate identity (Google OAuth)
4. Install the **skillport-manager** skill for the best experience
5. Done - users can browse and install Skills conversationally

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    YOUR GITHUB REPO                         │
│                                                             │
│  .skillport/access.json         ← Who can edit             │
│  .claude-plugin/marketplace.json ← Skill index             │
│                                                             │
│  plugins/                                                   │
│    └── your-skills/                                         │
│          └── skills/                                        │
│                ├── skill-one/SKILL.md                       │
│                └── skill-two/SKILL.md                       │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              SKILLPORT CONNECTOR                            │
│              (Claude Connector on Cloudflare Workers)       │
│                                                             │
│  • Reads skills from GitHub                                 │
│  • Authenticates users via OAuth                            │
│  • Enforces access control                                  │
│  • Exposes tools to Claude                                  │
└─────────────────────────────────────────────────────────────┘
                           │
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
   ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
   │  Claude.ai   │ │    Claude    │ │    Claude    │
   │    (web)     │ │   Desktop    │ │    Mobile    │
   └──────────────┘ └──────────────┘ └──────────────┘
                                       (Skills sync
                                        from web/desktop)
```

**Note:** Claude Code users can access Skills directly via Plugin Marketplaces - they don't need the connector. Skillport brings that same capability to Claude.ai, Desktop, and Mobile users.

---

## Tools

### For Users

| Tool            | Description                         |
| --------------- | ----------------------------------- |
| `list_skills`   | Browse available Skills             |
| `fetch_skill`   | Install a Skill for use             |
| `check_updates` | See if Skills have been updated     |
| `whoami`        | Get your user ID (for access setup) |

### For Editors

| Tool            | Description                             |
| --------------- | --------------------------------------- |
| `save_skill`    | Create or update a Skill                |
| `publish_skill` | Make a Skill visible in the marketplace |
| `bump_version`  | Increment version after changes         |

---

## Setup Guide

### 1. Google OAuth Credentials

In [Google Cloud Console](https://console.cloud.google.com/):

1. Create a new project (or use existing)
2. Enable the Google+ API
3. Create OAuth 2.0 Client ID (Web application)
4. Add authorized redirect URI: `https://your-worker.workers.dev/callback`
5. Note the Client ID and Client Secret

### 2. GitHub Access Token

Create a [Personal Access Token](https://github.com/settings/tokens) with `repo` scope. This allows the connector to read your Skills repository.

### 3. Local Configuration

Create `.dev.vars`:

```bash
GOOGLE_CLIENT_ID="your-client-id"
GOOGLE_CLIENT_SECRET="your-client-secret"
GITHUB_SERVICE_TOKEN="ghp_your_token"
COOKIE_ENCRYPTION_KEY="$(openssl rand -hex 32)"
```

### 4. Cloudflare KV

Create the KV namespace for OAuth token storage:

```bash
npx wrangler kv namespace create "OAUTH_KV"
```

Update `wrangler.toml` with the returned namespace ID.

### 5. Configure Your Marketplace

In `wrangler.toml`, set your repository:

```toml
[vars]
MARKETPLACE_REPO = "your-org/your-skills-repo"
```

---

## Costs

Skillport runs on Cloudflare's **free tier** for most organizations:

| Resource   | Free Limit   | Typical Usage                 |
| ---------- | ------------ | ----------------------------- |
| Requests   | 100,000/day  | ~1,000/day for 50-person team |
| KV Storage | 1GB          | Minimal (just OAuth tokens)   |
| CPU Time   | 10ms/request | Well under limit              |

Your primary cost is time: initial setup, writing Skills, and training your team.

---

## Roadmap

- [x] Google OAuth authentication
- [x] Role-based access control
- [x] Skill versioning
- [x] skillport-manager for conversational installation
- [ ] Microsoft Entra authentication
- [ ] Additional OAuth providers (GitHub, Okta)
- [ ] Skill analytics (usage tracking)
- [ ] Slack notifications for Skill updates

---

## FAQ

**Can I use this for my company?**

Yes. Skillport is MIT licensed. Deploy your own connector, create your own Skills repository, completely under your control.

**Do end users need GitHub access?**

No. Users authenticate via OAuth (Google today, Microsoft Entra coming). The connector reads GitHub on their behalf using a service token. Users never see the repository directly.

**Do end users need to install anything?**

No. Unlike local MCP servers, Claude Connectors require zero installation. Users add a URL in Settings → Connectors, authenticate, and they're done. Works in Claude.ai (web) and Claude Desktop.

**Can I restrict Skills to certain users?**

Yes. The `access.json` file supports per-skill and per-group permissions. You can make some Skills available to everyone and others restricted to specific teams.

**We use Microsoft, not Google. Can we still use this?**

Microsoft Entra support is on the roadmap. In the meantime, if you have a hybrid environment where users have Google accounts, that works. Or reach out - implementation help is available.

**What about Claude Code users?**

Claude Code has native Plugin Marketplace support. Claude Code users can access your Skills directly from the GitHub repo without the connector. Skillport's value is bringing that same capability to Claude.ai and Desktop users.

**Do Skills work on mobile?**

Yes! Skills installed via Claude.ai or Claude Desktop automatically sync to the Claude mobile apps (iOS and Android). You can't install Skills directly on mobile yet, but once installed on web or desktop, they're available on your phone. Great for on-the-go access to your team's Skills.

**What if I need help setting this up?**

See "Getting Help" below.

---

## Related Projects

| Project                                                                                | Description                                          |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| [skillport-marketplace](https://github.com/craftycto/skillport-marketplace)            | GitHub template for creating your Skills marketplace |
| [Claude Code Plugin Marketplaces](https://code.claude.com/docs/en/plugin-marketplaces) | Native Plugin system for Claude Code                 |

---

## Getting Help

**Documentation Issues?** Open a GitHub issue.

**Implementation Help?** Skillport was created by [Jack Ivers](https://craftycto.com), a fractional CTO specializing in AI-first infrastructure for technology teams. If you need help deploying Skillport for your organization, designing your Skill architecture, or training your team, [get in touch](https://craftycto.com/contact).

---

## License

MIT - Use it, modify it, deploy it. No strings attached.

---

## Acknowledgments

Built on:

- [Claude Connectors](https://support.claude.com/en/articles/11503834-building-custom-connectors-via-remote-mcp-servers) by Anthropic
- [Cloudflare Workers](https://workers.cloudflare.com/)
- [Claude Code Plugin Marketplaces](https://code.claude.com/docs/en/plugin-marketplaces)
