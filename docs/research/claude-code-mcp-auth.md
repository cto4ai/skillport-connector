# Claude Code MCP Authentication Research

**Date:** 2025-01-01

## Summary

Research into how Claude Code handles MCP server authentication, particularly for remote OAuth-based MCPs like skillport-connector.

## Key Findings

### MCP Configuration Locations

Each Claude client has completely separate configuration:

| Client | Config Location | How to Configure |
|--------|-----------------|------------------|
| Claude Code | `~/.claude.json` | `claude mcp add` / `/mcp` command |
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` | Edit JSON manually |
| Claude.ai (web) | Server-side | Settings UI in web app |

### Claude Code MCP Management

**CLI Commands:**
```bash
# List configured MCP servers
claude mcp list

# Add an MCP server (user scope = all projects)
claude mcp add --transport sse skillport https://skillport-connector.jack-ivers.workers.dev/sse -s user

# Add an MCP server (local scope = this project only)
claude mcp add --transport sse skillport https://skillport-connector.jack-ivers.workers.dev/sse -s local

# Remove from specific scope
claude mcp remove skillport -s user
claude mcp remove skillport -s local
```

**Scopes:**
- `user` - Available in all projects (`~/.claude.json`)
- `local` - Private to current project (`~/.claude.json [project: /path/to/project]`)

An MCP server can exist in multiple scopes simultaneously.

### Authentication vs Connection

The `claude mcp list` output shows "Connected" status, but this only indicates the transport (SSE connection) is working, **not** that OAuth is authenticated.

OAuth tokens are stored **separately** from MCP config:
- MCP config (`~/.claude.json`) = where to connect
- Auth tokens (separate credential store) = authentication state

This means:
1. Removing and re-adding an MCP server does NOT clear OAuth tokens
2. Tokens persist across MCP config changes
3. To force re-authentication, use `/mcp` command and select "Clear authentication"

### Re-authentication Flow

To force a fresh OAuth flow:

1. In a Claude Code conversation, type `/mcp`
2. Select the MCP server
3. Choose "Clear authentication"
4. Re-authenticate (will redirect to IdP, e.g., Google)

### Bug Discovery: Stale OAuth Props

**Symptom:** `whoami` returned `id: "undefined:undefined"` but `email` and `name` worked correctly.

**Root Cause:** Stale OAuth tokens from an older version of the connector that didn't properly capture `provider` and `uid` props.

**Fix:** Re-authenticate via `/mcp` → "Clear authentication" → fresh OAuth flow.

**After re-auth:** `id: "google:114339316701728183084"` returned correctly.

**Lesson:** When adding new props to OAuth flow, existing users need to re-authenticate to get the new props. Old tokens will have only the props that existed at authentication time.

### Install Flow Test (PTC Pattern)

Successfully tested the PTC installation flow in Claude Code:

1. Claude called `install_skill("example-skill")`
2. Got token: `sk_install_xxx`
3. Response included `--package` flag (old behavior)
4. Claude correctly omitted `--package` for direct Claude Code install
5. Ran: `bash <(curl -sf .../install.sh) sk_install_xxx`
6. Skill installed to `~/.claude/skills/example-skill/`

**Note:** Claude (the model) correctly interpreted the situation and omitted `--package` even before we deployed the updated instructions. This validates the approach of adding a note for Claude Code rather than changing the default command.

## Open Questions

1. Where exactly does Claude Code store OAuth tokens? (credential cache location)
2. Is there a way to programmatically clear auth tokens without UI?
3. How long do OAuth tokens last before requiring re-auth?

## References

- `/mcp` slash command in Claude Code
- `claude mcp` CLI subcommand
- `~/.claude.json` config file
