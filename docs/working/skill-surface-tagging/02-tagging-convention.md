# Skill Surface Tagging Convention

*Draft - January 2026*

## Proposed Convention

Use namespaced tags in the `tags` array field (official Plugin Marketplace spec):

```json
{
  "name": "my-skill",
  "tags": ["surface:claude-code-cli", "surface:claude-desktop"]
}
```

## Proposed Surface Tags

| Tag | Description |
|-----|-------------|
| `surface:claude-code-cli` | Claude Code in terminal |
| `surface:claude-code-web` | Claude Code in browser |
| `surface:claude-ai` | Claude.ai web interface |
| `surface:claude-desktop` | Claude Desktop app (main chat) |
| `surface:claude-desktop-cowork` | Claude Desktop Cowork feature (TBD if distinct) |
| `surface:claude-desktop-code` | Claude Desktop Code tab (TBD - may align with CC CLI or CC Web) |

## Surface Characteristics

| Surface | Filesystem | MCP | Plugin Marketplace | Hooks/Commands |
|---------|------------|-----|-------------------|----------------|
| `claude-code-cli` | Full | Native | Full | Yes |
| `claude-code-web` | TBD | TBD | TBD | TBD |
| `claude-ai` | None | Connectors only | None | No |
| `claude-desktop` | Via MCP | Local servers | None | No |
| `claude-desktop-cowork` | TBD | TBD | TBD | TBD |
| `claude-desktop-code` | TBD | TBD | TBD | TBD |

## Natural Groupings

Some surfaces share UI or capabilities:

**Chat-style UI (similar skill experience):**
- `claude-ai` + `claude-desktop`

**Code-focused (may share capabilities):**
- `claude-code-cli` + `claude-code-web` + `claude-desktop-code` (TBD)

## Open Questions

1. Does `claude-desktop-code` behave like `claude-code-cli` or `claude-code-web`?
2. Is `claude-desktop-cowork` a distinct surface or just a mode?
3. Should we have group tags like `surface:chat` or `surface:code`?
4. Default behavior when no surface tag present?

## Decision Needed

1. Research Desktop Code tab and Cowork capabilities
2. Finalize tag list
3. Define default behavior
