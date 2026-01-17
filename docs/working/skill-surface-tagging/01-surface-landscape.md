# Skill Surface Landscape

*Research started: January 2026*

## Problem Statement

Skills need to indicate which Claude surfaces they're compatible with. The official Plugin Marketplace spec supports `tags` (array) which we can use with a namespaced convention like `surface:claude-code`.

## Claude Surfaces

### Claude Code CLI

- **Environment:** Terminal/command line
- **File access:** Full local filesystem
- **MCP:** Native support
- **Plugins:** Full Plugin Marketplace support (commands, agents, hooks, MCP servers, LSP servers)
- **Skills:** Full SKILL.md support with scripts/, references/, assets/

### Claude Code on the Web

- **Environment:** Browser-based Claude Code experience
- **File access:** TBD - likely sandboxed or cloud-based
- **MCP:** TBD
- **Plugins:** TBD - may be subset of CLI capabilities
- **Skills:** TBD

### Claude.ai (Web)

- **Environment:** Browser at claude.ai
- **File access:** None (upload only)
- **MCP:** Via connectors only (like Skillport)
- **Plugins:** No native plugin support
- **Skills:** Manual installation via Settings, or via MCP connector
- **UI:** Chat-focused, artifact support

### Claude Desktop

- **Environment:** Native desktop app
- **File access:** Limited, via MCP
- **MCP:** Local MCP server support
- **Plugins:** No native Plugin Marketplace support
- **Skills:** Manual installation, similar to Claude.ai
- **UI:** Nearly identical to Claude.ai
- **Special features:**
  - **Cowork:** New collaborative feature - unclear how it relates to Skills/Plugins
  - **Code tab:** New feature - may be more like CC CLI or CC Web (needs research)

## Key Differences

| Surface | Filesystem | MCP | Plugin Marketplace | Skills Install |
|---------|------------|-----|-------------------|----------------|
| CC CLI | Full | Native | Full | `/plugin` command |
| CC Web | TBD | TBD | TBD | TBD |
| Claude.ai | None | Connectors | None | Manual / Connector |
| Claude Desktop | Via MCP | Local servers | None | Manual |

## Implications for Tagging

1. **Multi-surface skills are common** - Many skills work across Claude.ai and Desktop (same UI)
2. **CC CLI is unique** - Has capabilities others don't (hooks, commands, LSP)
3. **MCP availability varies** - Affects which skills with tool dependencies work where
4. **Desktop has emerging features** - Cowork, Code tab may need their own surface tags

## Open Questions

- [ ] How does Claude Desktop's Code tab relate to Claude Code?
- [ ] Does Cowork need its own surface tag?
- [ ] What capabilities does Claude Code Web have vs CLI?
- [ ] Should we tag by capability (`mcp-required`) or by surface (`surface:claude-desktop`)?

## Next Steps

1. Research Claude Desktop Code tab capabilities
2. Define tagging convention
3. Determine default behavior (no tag = all surfaces? or explicit only?)
