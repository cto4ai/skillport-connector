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

## Atomic Token Redemption

**Status:** Deferred (low priority)

The install token redemption in `src/index.ts` has a theoretical race condition. Two near-simultaneous requests could both observe `used=false` and proceed before the KV write propagates (Cloudflare KV is not atomic/strongly consistent).

**Impact:** Low. Worst case is a skill gets installed twice in the same second. Tokens have 5-minute TTL and are for skill installation, not high-stakes operations.

**Possible fixes:**
1. **Durable Objects** - Use DO for atomic read-modify-write
2. **D1 transaction** - Move token storage to D1 with transaction
3. **Compare-and-swap pattern** - Use conditional KV operations if available

**Why deferred:** The race window is tiny, impact is benign (duplicate install), and the fix adds significant complexity.
