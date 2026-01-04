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

Skillport has two components:

### Skillport Marketplace

A GitHub repository that follows Anthropic's Plugin Marketplace standard—the same format Claude Code already understands. Your Skills live in version-controlled Markdown:

```
your-org/skills/
  plugins/
    sales/
      skills/
        proposal-writer/
          SKILL.md
    engineering/
      skills/
        code-review/
          SKILL.md
```

Pull requests, code review, version history—your existing workflow.

### Skillport Connector

A Claude Connector that bridges your GitHub repository to Claude.ai and Claude Desktop. Users add one URL in Settings → Connectors, authenticate with their corporate identity, and your organization's Skills become available.

```
Your GitHub Repo    →    Skillport Connector    →    Claude.ai
(private)                (OAuth + GitHub API)        Claude Desktop
                                                     Claude Mobile
```

The Connector uses a single-tool architecture inspired by Anthropic's Programmable Tool Calling patterns. Low context overhead. Fast responses.

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

Anthropic's Skills system is powerful. Skillport adds version tracking:

- Skills are versioned in your repository's `plugin.json`
- Users can check which version they have installed
- Updates are discoverable through conversation

When your team improves a Skill, everyone can update with a single interaction.

---

## Plugin Marketplace Compliant

The Skillport Marketplace template follows Anthropic's Plugin Marketplace standard exactly. This means:

- Claude Code users can access your Skills directly via `/plugin`—no Connector needed
- The same repository works for developers (native) and everyone else (via Connector)
- You're building on Anthropic's standard, not around it

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

```bash
git clone https://github.com/cto4ai/skillport-connector
cd skillport-connector
npm install
npm run deploy
```

Configure OAuth credentials (Google Cloud), a GitHub token, and your marketplace repository. Full setup guide in the repository.

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
│                    (private)                                 │
│                                                              │
│  .skillport/access.json          ← Access control            │
│  .claude-plugin/marketplace.json ← Skill index               │
│  plugins/*/skills/*/SKILL.md     ← Your Skills               │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              SKILLPORT CONNECTOR                             │
│              (Cloudflare Workers)                            │
│                                                              │
│  • Single-tool architecture (low context overhead)           │
│  • OAuth authentication (Google, Microsoft Entra coming)     │
│  • GitHub API integration                                    │
│  • Access control enforcement                                │
└─────────────────────────────────────────────────────────────┘
                           │
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
   ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
   │  Claude.ai   │ │    Claude    │ │    Claude    │
   │    (web)     │ │   Desktop    │ │    Mobile    │
   └──────────────┘ └──────────────┘ └──────────────┘
```

Claude Code users access the same repository directly via Plugin Marketplace—the Connector extends that capability to everyone else.

---

## Costs

Skillport runs on Cloudflare's free tier for most organizations:

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

Claude Code has native Plugin Marketplace support. Those users can access your repository directly—Skillport extends that same capability to everyone else.

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
