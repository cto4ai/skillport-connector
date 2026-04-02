# Skillport Retirement Assessment

**Date:** 2026-04-01
**Decision:** Retire the Skillport connector. Keep the marketplace repo.

## Background

Skillport was built when Anthropic had no native skill/plugin distribution infrastructure. It provided:

- Centralized private skill repo targeting all Claude surfaces via MCP connector
- Version tracking with explicit semantic versions and update checking
- Cross-surface distribution (Claude.ai, Desktop, Mobile, Code) from one source
- Enterprise-style distribution with OAuth and access controls
- Low context overhead via single-tool MCP + Programmatic Tool Calling

## What Changed

Anthropic now provides native capabilities that cover Skillport's core value:

### Claude Code (fully replaces Skillport)

- Plugin marketplace system with official + custom marketplaces
- Private marketplace support from any Git host, local paths, or URLs
- Auto-update at startup for marketplaces and installed plugins
- Team marketplace configuration via `.claude/settings.json`
- Full plugin mechanism: skills, agents, hooks, MCP servers, LSP

### Claude Cowork (fully replaces Skillport)

- Full plugin mechanism (skills, connectors, sub-agents) — all paid plans (Pro, Max, Team, Enterprise)
- Browse and install from Anthropic's official plugin marketplace ([claude.com/plugins](https://claude.com/plugins))
- Upload custom plugin ZIPs locally
- Plugin Create tool for building new plugins from scratch
- Plugins are cross-compatible with Claude Code (same format)
- [knowledge-work-plugins](https://github.com/anthropics/knowledge-work-plugins) — 11 official domain plugins (sales, finance, legal, etc.)
- **Team/Enterprise only:** private org marketplaces with admin controls (auto-install, per-user provisioning, visibility restrictions)

### Claude.ai / Claude Desktop Chat (mostly replaces Skillport)

- Native skill upload and management via Customize panel
- Share with specific people or org-wide (Team/Enterprise)
- Auto-updates when creator updates a shared skill
- Unified directory for skills, connectors, and plugins

### Claude Mobile

- No standalone plugin/skill support
- Dispatch feature remote-controls Cowork sessions from phone

## Surface Coverage Comparison

| Surface | Skillport provided | Native replacement |
|---|---|---|
| Claude Code | MCP connector | Plugin marketplace (better) |
| Cowork | MCP connector | Full plugin marketplace + custom upload (better) |
| Claude.ai web | MCP connector | Skill upload/sharing |
| Claude Desktop Chat | MCP connector | Skill upload/sharing |
| Claude Mobile | MCP connector | Dispatch to Cowork |

## Remaining Gaps

### No automated push to Claude.ai/Desktop

When a skill changes in the marketplace repo, Claude Code picks it up automatically (marketplace auto-update). Claude.ai/Desktop requires manual re-upload of the skill ZIP.

**Mitigation:** Scheduled Cowork action with browser automation can automate this (see migration plan).

### Version tracking is less explicit

Anthropic's auto-update is "latest wins" with no visible version numbers. Skillport had semantic versions and changelogs.

**Mitigation:** Version numbers can still be tracked in plugin.json and marketplace.json in the repo. The native system doesn't surface them to users, but the source of truth remains.

### Custom Cowork plugins are per-machine on Max plan

All paid Cowork users (including Max) have full access to the plugin marketplace — browsing, installing, uploading custom plugins, and Plugin Create. The only Team/Enterprise-exclusive feature is private org marketplaces with admin controls (auto-install, provisioning, visibility).

Custom plugins uploaded locally are saved per-machine, not synced across devices. Cowork can mount one selected local directory per session (at creation time), so a dedicated session could access a marketplace repo clone. However, mid-session mounting was removed and multiple directories per session is an open feature request.

**Mitigation:** ZIP upload for custom plugins, or dedicated Cowork session pointed at the marketplace repo. Synced plugin storage directory across Macs if feasible. These limitations are in flux — Anthropic is actively developing Cowork's filesystem access model.

## Verdict

Skillport's core value has been absorbed by Anthropic's native capabilities. The remaining gaps are minor and have practical mitigations. The MCP connector approach was the right bet when no native infrastructure existed — now it's unnecessary overhead.

## What We Keep

- **Marketplace repo** (`crafty-skillport-marketplace`) — already a valid Claude Code marketplace format
- **`skillport-repo-utils`** plugin — validation, deletion, copying scripts still useful

## What We Retire

- **Skillport connector** (Cloudflare Worker, this repo)
- **`skillport` bootstrap skill** — exists to manage the connector, becomes circular
- **`surface-detect` skill** — existed to work around cross-surface detection, less relevant now
- **Connector infrastructure** — OAuth, REST API, MCP server, search index

## Sources

- [Discover plugins through marketplaces — Claude Code Docs](https://code.claude.com/docs/en/discover-plugins)
- [Extend Claude with skills — Claude Code Docs](https://code.claude.com/docs/en/skills)
- [Use plugins in Cowork — Claude Help Center](https://support.claude.com/en/articles/13837440-use-plugins-in-cowork)
- [Manage Cowork plugins for your organization — Claude Help Center](https://support.claude.com/en/articles/13837433-manage-cowork-plugins-for-your-organization)
- [Use Skills in Claude — Claude Help Center](https://support.claude.com/en/articles/12512180-use-skills-in-claude)
- [Browse skills, connectors, and plugins — Claude Help Center](https://support.claude.com/en/articles/14328846-browse-skills-connectors-and-plugins-in-one-directory)
- [Plugins for Claude Code and Cowork — Anthropic](https://claude.com/plugins)
