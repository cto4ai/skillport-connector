# Skill Surface Tagging Convention

*Draft - January 2026*

## Proposed Convention

Use namespaced tags in the `tags` array field (official Plugin Marketplace spec).

**Most skills need only a single surface tag.**

```json
{
  "name": "my-skill",
  "tags": ["surface:CALL"]
}
```

## Surface Tags

| Tag | Full Name | Description |
|-----|-----------|-------------|
| `surface:CC` | Claude Code | CLI terminal experience |
| `surface:CD` | Claude Desktop | Desktop app |
| `surface:CAI` | Claude.ai | Web interface |
| `surface:CDAI` | Claude Desktop + Claude.ai | Both chat surfaces (shared UI) |
| `surface:CALL` | All Surfaces | Works everywhere |

## Usage

**Single tag is the norm:**
```json
{"tags": ["surface:CALL"]}     // Works everywhere
{"tags": ["surface:CC"]}       // Claude Code only (needs filesystem, hooks, etc.)
{"tags": ["surface:CDAI"]}     // Chat surfaces (Desktop + AI)
```

**Multiple tags only when needed:**
```json
{"tags": ["surface:CC", "surface:CD"]}  // Code + Desktop (has MCP)
```

## Surface Characteristics

| Tag | Full Name | Filesystem | MCP | Plugin Marketplace | Hooks/Commands |
|-----|-----------|------------|-----|-------------------|----------------|
| CC | Claude Code | Full | Native | Full | Yes |
| CD | Claude Desktop | Via MCP | Local servers | None | No |
| CAI | Claude.ai | None | Connectors only | None | No |

## Open Questions

1. Does Claude Desktop Code tab need its own tag?
2. Does Cowork need its own tag?
3. What about Claude Code Web?
4. Default behavior when no surface tag present?
