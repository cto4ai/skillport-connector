# Skill Surface Landscape

*Research started: January 2026*

## Problem Statement

Skills need to indicate which Claude surfaces they're compatible with. The official Plugin Marketplace spec supports `tags` (array) which we can use with a namespaced convention like `surface:CC`.

## Surface Tags Reference

| Tag | Full Name | Description |
|-----|-----------|-------------|
| CC | Claude Code | CLI terminal experience |
| CD | Claude Desktop | Desktop app |
| CAI | Claude.ai | Web interface |
| CDAI | Claude Desktop + Claude.ai | Both chat surfaces (shared UI) |
| CALL | All Surfaces | Works everywhere |

## Claude Surfaces

### CC - Claude Code (CLI)

- **Environment:** Terminal/command line
- **File access:** Full local filesystem
- **MCP:** Native support
- **Plugins:** Full Plugin Marketplace support (commands, agents, hooks, MCP servers, LSP servers)
- **Skills:** Full SKILL.md support with scripts/, references/, assets/

### Claude Code on the Web (TBD)

- **Environment:** Browser-based Claude Code experience
- **File access:** TBD - likely sandboxed or cloud-based
- **MCP:** TBD
- **Plugins:** TBD - may be subset of CLI capabilities
- **Skills:** TBD
- **Tag:** TBD - may need CCW or similar

### CAI - Claude.ai (Web)

- **Environment:** Browser at claude.ai
- **File access:** None (upload only)
- **MCP:** Via connectors only (like Skillport)
- **Plugins:** No native plugin support
- **Skills:** Manual installation via Settings, or via MCP connector
- **UI:** Chat-focused, artifact support

### CD - Claude Desktop

- **Environment:** Native desktop app
- **File access:** Limited, via MCP
- **MCP:** Local MCP server support
- **Plugins:** No native Plugin Marketplace support
- **Skills:** Manual installation, similar to Claude.ai
- **UI:** Nearly identical to Claude.ai
- **Special features:**
  - **Cowork:** New collaborative feature - unclear how it relates to Skills/Plugins
  - **Code tab:** New feature - may be more like CC or Claude Code Web (needs research)

## Key Differences

| Tag | Full Name | Bash | Local MCPs | Connectors | Plugin Marketplace |
|-----|-----------|------|------------|------------|-------------------|
| CC | Claude Code | Yes | Yes | Yes | Full |
| CD | Claude Desktop | No | Yes (optional) | Yes | None |
| CAI | Claude.ai | No | No | Yes | None |

**Key insight:** CD and CAI differ in local MCP support. CD can have local MCPs installed (like `obsidian-local`), CAI cannot.

## Surface Detection Methods

Research into how to detect which surface a skill is running on:

| Method | Can Detect | Notes |
|--------|-----------|-------|
| MCP `clientInfo.name` | CC vs CDAI (maybe) | CD and CAI both report as `"claude-ai"` |
| Tool availability | CC, CD, CAI | Most reliable - see patterns below |
| Official `compatibility` field | None | Free-form text, not machine-readable |

### Detection Patterns

**Claude Code (CC):**
- Bash tool available
- Full filesystem access
- Plugin Marketplace tools

**Claude Desktop (CD):**
- Local MCP tools present (e.g., `obsidian-local:*`)
- No Bash tool
- Manual skill installation

**Claude.ai (CAI):**
- Only remote MCP connectors (e.g., `skillport:*`)
- No Bash tool
- No local MCP tools

### How Existing Skills Handle Detection

**Obsidian skill:**
```
obsidian-local:* tools available → CD or CC (local MCP)
Only obsidian-remote:* → CAI (connector only)
```

**Skillport skill:**
```
Bash tool available → CC (use --skill for direct install)
No Bash → CDAI (use --package for upload)
```

## Implications for Tagging

1. **CDAI covers most skills** - Many skills work across Claude.ai and Desktop (same UI)
2. **CC is unique** - Has capabilities others don't (hooks, commands, LSP, full filesystem, Bash)
3. **CD vs CAI** - CD can have local MCPs, CAI cannot - some skills may work on CD but not CAI
4. **Desktop has emerging features** - Cowork, Code tab may need their own tags

## Open Questions

- [ ] How does Claude Desktop's Code tab relate to CC?
- [ ] Does Cowork need its own surface tag?
- [ ] What capabilities does Claude Code Web have vs CC?
- [ ] Default behavior when no surface tag present?

## References

- [Agent Skills Specification](https://agentskills.io/specification) - Official spec (has `compatibility` field, free-form text)
- [Plugin Marketplaces Documentation](https://code.claude.com/docs/en/plugin-marketplaces) - Official `tags` array field
- [apify/mcp-client-capabilities](https://github.com/apify/mcp-client-capabilities) - MCP client identification database
