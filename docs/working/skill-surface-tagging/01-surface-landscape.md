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

| Tag | Full Name | Filesystem | MCP | Plugin Marketplace | Skills Install |
|-----|-----------|------------|-----|-------------------|----------------|
| CC | Claude Code | Full | Native | Full | `/plugin` command |
| CD | Claude Desktop | Via MCP | Local servers | None | Manual |
| CAI | Claude.ai | None | Connectors | None | Manual / Connector |

## Implications for Tagging

1. **CDAI covers most skills** - Many skills work across Claude.ai and Desktop (same UI)
2. **CC is unique** - Has capabilities others don't (hooks, commands, LSP, full filesystem)
3. **MCP availability varies** - CD has local MCP, CAI has connectors only
4. **Desktop has emerging features** - Cowork, Code tab may need their own tags

## Open Questions

- [ ] How does Claude Desktop's Code tab relate to CC?
- [ ] Does Cowork need its own surface tag?
- [ ] What capabilities does Claude Code Web have vs CC?
- [ ] Default behavior when no surface tag present?

## Next Steps

1. Research Claude Desktop Code tab capabilities
2. Research Claude Code Web capabilities
3. Determine default behavior (no tag = CALL? or explicit only?)
