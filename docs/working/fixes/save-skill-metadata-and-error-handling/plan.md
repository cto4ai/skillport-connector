# Fix: save_skill Metadata and Error Handling

## Summary

Enhancements to the `save_skill` API to address gaps discovered during real-world usage.

---

## Fix 1: Plugin Metadata Support

### Problem

Models using Skillport cannot create or update `plugin.json` after initial skill creation:
- `save_skill` auto-creates `plugin.json` for new groups, but with generic defaults
- No way to customize description, keywords, author, etc.
- No way to update metadata after creation
- Path restrictions prevent writing to plugin root (by design)

### Solution

Add optional `plugin_metadata` field to `save_skill` request:

```typescript
// POST /api/skills/:name
{
  name: "soil-data-analyzer",
  files: [...],
  plugin_metadata: {  // NEW - optional
    description: "Analyzes soil test data with agronomic recommendations",
    keywords: ["soil", "agriculture", "data-analysis"],
    author: { name: "Jack Ivers" },
    license: "MIT"
  }
}
```

### Behavior

| Scenario | Result |
|----------|--------|
| `plugin_metadata` provided, plugin.json exists | Merge fields into existing |
| `plugin_metadata` provided, plugin.json missing | Create with provided + defaults |
| `plugin_metadata` omitted, **new group** | **ERROR** - metadata required for new plugins |
| `plugin_metadata` omitted, existing group | No change to plugin.json |

**Rationale:** Requiring metadata for new plugins ensures complete skills from the start (prevents the soil-data-analyzer issue). Optional for existing plugins allows incremental updates without forcing metadata on every save.

### Schema

```typescript
interface PluginMetadata {
  description: string;      // Required - what does this plugin do?
  keywords?: string[];      // Optional - for discoverability
  author?: { name?: string; email?: string };  // Optional - defaults to OAuth user
  license?: string;         // Optional - defaults to "MIT"
}
```

**Note:** `name` and `version` are controlled separately (name from URL path, version via `bump_version`).

### Files to Modify

- `src/rest-api.ts` - Add plugin_metadata handling to handleSaveSkill

---

## Fix 2: Install Script Error Handling

### Problem

When `install.sh` hits a transient error (like HTTP 503), it:
1. Shows unhelpful "Unknown error" message
2. Fails immediately with no retry
3. Loses the detailed `message` field from error responses

Example failure:
```
Fetching skill...
Error: Failed to fetch skill (HTTP 503)
Unknown error
```

### Root Cause Analysis

1. **503 source**: Likely Cloudflare Worker cold start or GitHub API hiccup. Our code returns 500 for caught errors (line 136), so 503 is infrastructure-level.

2. **"Unknown error"**: The script only extracts `error` field (line 219), but:
   - 503 from infrastructure has no JSON body
   - Our errors have both `error` AND `message` fields, but only `error` is shown

3. **No retry**: Single curl attempt, immediate failure on any non-200

### Solution

**A. Add retry logic with backoff**
```bash
MAX_RETRIES=3
RETRY_DELAY=2

for i in $(seq 1 $MAX_RETRIES); do
  HTTP_CODE=$(curl -s -w "%{http_code}" -o /tmp/skillport_response.json "$URL")
  if [ "$HTTP_CODE" = "200" ]; then
    break
  fi
  if [ $i -lt $MAX_RETRIES ]; then
    echo "Retry $i/$MAX_RETRIES in ${RETRY_DELAY}s..."
    sleep $RETRY_DELAY
    RETRY_DELAY=$((RETRY_DELAY * 2))
  fi
done
```

**B. Extract both error AND message fields**
```bash
# Try to parse error details from JSON
if [ -f /tmp/skillport_response.json ]; then
  ERROR_MSG=$(python3 -c "
import json
try:
    d = json.load(open('/tmp/skillport_response.json'))
    error = d.get('error', '')
    message = d.get('message', '')
    if error and message:
        print(f'{error}: {message}')
    elif error:
        print(error)
    else:
        print(open('/tmp/skillport_response.json').read()[:200])
except:
    print(open('/tmp/skillport_response.json').read()[:200])
" 2>/dev/null) || ERROR_MSG="No response body"
fi
```

**C. Show raw body on parse failure**
If JSON parsing fails, show first 200 chars of raw response - helps debug infrastructure errors.

### Files to Modify

- `src/index.ts` - serveInstallScript function (install.sh template, ~line 145)

---

## Implementation Checklist

### Fix 1: Plugin Metadata
- [ ] Add plugin_metadata to save_skill request schema (Zod)
- [ ] Add validation: require plugin_metadata.description for new plugins
- [ ] Implement merge logic for existing plugin.json
- [ ] Implement create logic when plugin.json missing
- [ ] Update MCP tool description to document new field

### Fix 2: Error Handling
- [ ] Add retry loop with exponential backoff (3 retries)
- [ ] Extract both `error` and `message` fields
- [ ] Show raw response body on JSON parse failure
- [ ] Apply same fixes to edit script (line ~511)

## Testing

### Fix 1: Plugin Metadata
- [ ] Create new plugin with plugin_metadata → verify plugin.json created correctly
- [ ] Create new plugin WITHOUT plugin_metadata → verify error returned
- [ ] Update existing skill with plugin_metadata → verify fields merged
- [ ] Update existing skill without plugin_metadata → verify no error, plugin.json unchanged

### Fix 2: Error Handling
- [ ] Simulate 503 → verify retry succeeds on second attempt
- [ ] Verify error + message both displayed
- [ ] Verify non-JSON error body is shown (first 200 chars)
