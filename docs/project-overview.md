# Skillport Project Overview

**Share Skills and plugins across all Claude surfaces.**

## The Problem

Claude has three main surfaces:
- **Claude Code** — CLI for developers
- **Claude Desktop** — Desktop application  
- **Claude.ai** — Web interface

Claude Code has a Plugin Marketplace system. Claude Desktop and Claude.ai don't. Organizations want to share Skills across all surfaces without maintaining separate systems.

## The Solution

Skillport bridges this gap:

1. **One marketplace format** — Use Claude Code's Plugin Marketplace format (with extensions)
2. **Native for Claude Code** — Works directly with `/plugin marketplace add`
3. **Bridged for others** — Skillport Connector serves Skills to Claude.ai/Desktop via MCP

```
┌─────────────────────────────────────┐
│      Plugin Marketplace Repo        │
│      (Claude Code format +          │
│       Skillport extensions)         │
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
| **skillport-connector** | MCP Connector (Cloudflare Worker) | [skillport-connector](https://github.com/your-org/skillport-connector) |
| **skillport-template** | GitHub template for creating marketplaces | [skillport-template](https://github.com/your-org/skillport-template) |

Organizations create their own marketplace instances from the template (e.g., `acme-skillport`).

## How It Works

### For Claude Code Users

Native experience — Claude Code consumes the marketplace directly:

```bash
/plugin marketplace add your-org/your-marketplace
/plugin install my-skill@your-marketplace
```

### For Claude.ai / Claude Desktop Users

1. Org admin deploys Skillport Connector to Cloudflare
2. Connector is configured with the marketplace repo URL
3. Users add connector: Settings > Connectors > Add Custom Connector
4. Users authenticate via OAuth
5. Users browse and install Skills via MCP tools

## Key Design Decisions

### Use Claude Code's Format

Instead of inventing a new format, Skillport extends Claude Code's Plugin Marketplace format. Claude Code ignores extension fields, so one marketplace serves all surfaces.

### MCP for Bridging

MCP (Model Context Protocol) is Anthropic's official protocol for tool integration. Skillport Connector is a "tools connector" that provides callable MCP tools for browsing and fetching Skills.

### OAuth for Identity

The connector uses OAuth (GitHub by default) to authenticate users. This provides:
- User identity for audit logs
- Access control possibilities
- Org membership verification

### Cloudflare for Hosting

Cloudflare Workers provides:
- Generous free tier (100K requests/day)
- Built-in KV storage for tokens
- Global edge deployment
- Simple deployment

## Project Context

### Why Build This?

- Learn MCP connector development deeply
- Solve a real need for sharing Skills across surfaces
- Create something clients can use
- Potentially contribute to open source community

### Bitter Lesson Consideration

Anthropic will likely build native skill distribution for Claude.ai/Desktop eventually. Skillport:
- Uses their official format (compatible, not competing)
- Solves a real need today
- Provides deep learning about the systems
- Can migrate gracefully when native support arrives

## Getting Started

### 1. Create Your Marketplace

Use the template — click "Use this template" on GitHub or:

```bash
git clone https://github.com/your-org/skillport-template my-org-skillport
```

### 2. Add Plugins

Create plugins in `plugins/` directory with Skills, commands, and agents.

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
- [MCP with GitHub OAuth](https://github.com/cloudflare/ai/tree/main/demos/remote-mcp-github-oauth)

## License

MIT
