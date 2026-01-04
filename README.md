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

Fork, configure, deploy. Your infrastructure, your control.

---

## Quick Start

### 1. Create Your Marketplace

Use the [Skillport Marketplace template](https://github.com/cto4ai/skillport-marketplace):

1. Click "Use this template" on GitHub
2. Add your Skills in `plugins/your-group/skills/`
3. The repository is ready

### 2. Deploy Your Connector

Skillport Connector deploys to Cloudflare Workers—Cloudflare is a leader in MCP infrastructure and the Connector is configured for their platform out of the box.

```bash
git clone https://github.com/cto4ai/skillport-connector
cd skillport-connector
npm install

# Configure before deploying:
# - Google OAuth credentials (or Microsoft Entra when available)
# - GitHub token for repository access
# - Your marketplace repository URL
# See the full setup guide in the repository

npm run deploy
```

### 3. Connect Users

1. Share your Connector URL
2. Users add it in Claude.ai → Settings → Connectors
3. Users authenticate with corporate identity
4. Done—Skills are available

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

Skillport runs on Cloudflare's free or $5/mo tier for most organizations:

| Resource | Free Limit | Typical Usage |
|----------|------------|---------------|
| Requests | 100,000/day | ~1,000/day for 50-person team |
| KV Storage | 1GB | Minimal (OAuth tokens) |

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

Claude Code can access public repositories directly via Plugin Marketplace. For most teams, however, the Connector provides a better experience—with support for private repositories a key consideration for enterprise use.

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

- [Claude Connectors](https://docs.anthropic.com/en/docs/build-with-claude/mcp/remote-mcp-servers)
- [Plugin Marketplaces](https://docs.anthropic.com/en/docs/claude-code/plugins)
- [Programmable Tool Calling patterns](https://docs.anthropic.com/en/docs/build-with-claude/tool-use)

And runs on [Cloudflare Workers](https://workers.cloudflare.com/).
