# Future Features

Ideas and enhancements for future consideration.

## Filtering by Metadata

**Status:** Deferred

Add optional filter parameters to `list_skills`:
- `category` - Filter by category string
- `tags` - Filter by tags (match any)
- `keywords` - Filter by keywords (match any)

This would allow users/Claude to narrow down skill listings:
```
list_skills category="productivity"
list_skills tags=["data", "analysis"]
```

**Why deferred:** Current marketplace is small enough that filtering isn't necessary. Revisit when the skill catalog grows.

## Surface Targeting

**Status:** Removed (was custom extension)

We previously had a custom `surfaces` field to indicate which Claude surfaces a skill works with (claude-ai, claude-desktop, claude-code). This was removed because:
1. Not part of the official Plugin Marketplace spec
2. Can be accomplished using `category` or `tags` if needed
3. Adds complexity without clear immediate value

If surface targeting becomes important, consider using the official `category` or `tags` fields:
- `category: "developer-tools"` for Claude Code only skills
- `tags: ["requires-mcp"]` for skills needing MCP capabilities
