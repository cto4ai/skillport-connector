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

## Install Script Retry Logic

**Status:** Deferred

Add automatic retry with exponential backoff in `install.sh` and `edit.sh` for transient 503 errors. Observed a 503 during skill installation that resolved on manual retry.

**Proposed implementation:**
```bash
MAX_RETRIES=3
RETRY_DELAY=2

for attempt in $(seq 1 $MAX_RETRIES); do
  HTTP_CODE=$(curl -s -w "%{http_code}" -o /tmp/response.json "$URL")
  if [ "$HTTP_CODE" = "200" ]; then
    break
  elif [ "$HTTP_CODE" = "503" ] && [ $attempt -lt $MAX_RETRIES ]; then
    echo "Server temporarily unavailable, retrying in ${RETRY_DELAY}s..."
    sleep $RETRY_DELAY
    RETRY_DELAY=$((RETRY_DELAY * 2))
  else
    # Handle error
    exit 1
  fi
done
```

**Why deferred:** The 503 was transient and resolved on manual retry. Claude.ai's model handles retries reasonably well. Revisit if 503s become frequent.

## GitHub API Rate Limit / Subrequest Errors

**Status:** Deferred

When Claude Code calls `publish_skill` multiple times in quick succession (e.g., batch creating 5+ skills), it can hit Cloudflare Workers' subrequest limit or GitHub API rate limits, causing "Too many subrequests" errors.

**Observed behavior:** Publishing 5 skills sequentially works if saves are batched first, then publishes follow. But rapid parallel publish calls fail.

**Proposed solutions:**

1. **Batch publish tool** - Add `publish_skills` (plural) that accepts an array of skills and publishes them all in one request with a single marketplace.json update
   ```typescript
   publish_skills({ skills: [
     { skill: "foo", description: "...", category: "..." },
     { skill: "bar", description: "...", category: "..." }
   ]})
   ```

2. **Combine save + publish** - Add optional `publish` boolean to `save_skill` that publishes in the same request
   ```typescript
   save_skill({
     skill: "foo",
     files: [...],
     publish: { description: "...", category: "..." }
   })
   ```

3. **Auto-publish on save** - If skill already exists in marketplace.json, auto-update its metadata on save (preserve description/category, update version)

**Why deferred:** Workaround exists (batch saves first, then publish). The model can be instructed to call sequentially. Revisit if this becomes a frequent friction point.
