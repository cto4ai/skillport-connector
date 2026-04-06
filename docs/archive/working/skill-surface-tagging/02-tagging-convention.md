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

| Tag | Full Name | Bash | Local MCPs | Connectors | Plugin Marketplace |
|-----|-----------|------|------------|------------|-------------------|
| CC | Claude Code | Yes | Yes | Yes | Full |
| CD | Claude Desktop | No | Yes (optional) | Yes | None |
| CAI | Claude.ai | No | No | Yes | None |

## API Behavior

**Surface tags are required.** The API will not accept skills without a `surface:*` tag.

- Existing marketplace repos will be manually updated to add surface tags
- New skills must include at least one surface tag
- API returns `surface_tags` array extracted from `tags` field

## Detection Approach for Skills

Skills should detect surface at runtime using tool availability:

```
IF Bash tool available:
  → CC (Claude Code)
ELSE IF any *-local MCP tools available:
  → CD (Claude Desktop with local MCPs)
ELSE:
  → CDAI (Claude.ai or Desktop without local MCPs)
```

## When to Use Each Tag

| Tag | Use When |
|-----|----------|
| `surface:CALL` | Skill works everywhere (most common) |
| `surface:CC` | Requires Bash, filesystem, hooks, or Plugin Marketplace features |
| `surface:CDAI` | Works on chat surfaces but NOT Claude Code |
| `surface:CD` | Requires local MCP (rare) |
| `surface:CAI` | Web-only (very rare) |

## Open Questions

1. Does Claude Desktop Code tab need its own tag?
2. Does Cowork need its own tag?
3. What about Claude Code Web?
