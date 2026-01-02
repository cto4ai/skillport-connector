# Skillport Project Overview

**Share Skills across all Claude surfaces.**

## The Problem

Claude has three main surfaces:
- **Claude Code** - CLI for developers
- **Claude Desktop** - Desktop application
- **Claude.ai** - Web interface

Claude Code has a Plugin Marketplace system. Claude Desktop and Claude.ai don't. Organizations want to share Skills across all surfaces without maintaining separate systems.

## The Solution

Skillport bridges this gap:

1. **One marketplace format** - Use Claude Code's Plugin Marketplace format
2. **Native for Claude Code** - Works directly with `/plugin marketplace add`
3. **Bridged for others** - Skillport Connector serves Skills to Claude.ai/Desktop via MCP

```
┌─────────────────────────────────────┐
│      Plugin Marketplace Repo        │
│      (Claude Code format)           │
└─────────────────────────────────────┘
           │                │
           ▼                ▼
    ┌────────────┐   ┌─────────────────┐
    │Claude Code │   │Skillport        │
    │ (native)   │   │Connector (MCP)  │
    └────────────┘   └─────────────────┘
                            │
                     ┌──────┴──────┐
                     ▼             ▼
              Claude.ai    Claude Desktop
```

## Project Components

| Component | Purpose | Repository |
|-----------|---------|------------|
| **skillport-connector** | MCP Connector (Cloudflare Worker) | This repo |
| **skillport-marketplace** | GitHub template for creating marketplaces | Sibling repo |

Organizations create their own marketplace instances from the template.

## Skill-Centric Model

**Skills are the primary unit** that users interact with:

- Users browse individual skills via `list_skills`
- Users install individual skills via `fetch_skill`
- Skills are discovered from `plugins/*/skills/*/SKILL.md`
- Skill groups (plugins) are just containers that provide versioning

### Two User Personas

| Persona | Tools | Purpose |
|---------|-------|---------|
| **Skill User** | `list_skills`, `fetch_skill`, `check_updates` | Browse and install skills |
| **Skill Editor** | `save_skill`, `publish_skill`, `bump_version` | Create and maintain skills |

Access is controlled via `.skillport/access.json` in the marketplace repo.

## How It Works

### For Claude Code Users

Native experience - Claude Code consumes the marketplace directly:

```bash
/plugin marketplace add your-org/your-marketplace
/plugin install my-skill@your-marketplace
```

### For Claude.ai / Claude Desktop Users

1. Admin deploys Skillport Connector to Cloudflare
2. Connector is configured with the marketplace repo URL
3. Users add connector: Settings > Connectors > Add Custom Connector
4. Users authenticate via Google OAuth
5. Users browse and install Skills via MCP tools

## Key Design Decisions

### Use Claude Code's Format

Instead of inventing a new format, Skillport uses Claude Code's Plugin Marketplace format. Claude Code works natively; Skillport bridges for other surfaces.

### Skills Inside Skill Groups

Skills live at `plugins/<group>/skills/<skill>/SKILL.md`:
- A skill group can contain multiple related skills
- All skills in a group share the same version
- Groups map to Claude Code plugins

### MCP for Bridging

MCP (Model Context Protocol) is Anthropic's official protocol for tool integration. Skillport Connector is a "tools connector" that provides callable MCP tools.

### Google OAuth for Identity

The connector uses Google OAuth to authenticate users:
- Stable user IDs for access control
- User identity for audit logs
- Works well with organizational Google accounts

### Cloudflare for Hosting

Cloudflare Workers provides:
- Generous free tier (100K requests/day)
- Built-in KV storage for tokens
- Global edge deployment
- Simple deployment

## Getting Started

### 1. Create Your Marketplace

Use the template - click "Use this template" on GitHub or clone it.

### 2. Add Skills

Create skills in `plugins/<group>/skills/<skill>/SKILL.md`.

### 3. Deploy Connector (for Claude.ai/Desktop access)

```bash
git clone https://github.com/your-org/skillport-connector
cd skillport-connector
npm install
# Configure wrangler.toml with your marketplace repo
npm run deploy
```

### 4. Connect Users

- **Claude Code:** `/plugin marketplace add your-org/your-marketplace`
- **Claude.ai:** Settings > Connectors > Add Custom Connector

## Reference Links

### Anthropic Documentation
- [Building Custom Connectors](https://support.claude.com/en/articles/11503834-building-custom-connectors-via-remote-mcp-servers)
- [MCP Authorization Spec](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization)
- [Claude Code Plugin Marketplaces](https://code.claude.com/docs/en/plugin-marketplaces)

### Cloudflare Documentation
- [Build a Remote MCP Server](https://developers.cloudflare.com/agents/guides/remote-mcp-server/)

## License

MIT
