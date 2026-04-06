# Plan: Align with Official Plugin Marketplace Metadata Fields

## Goal
Replace our custom `surfaces` extension with the official spec fields (`category`, `tags`, `keywords`) and expose them properly across all tools.

## Changes

### 1. Update `PluginEntry` interface in src/github-client.ts
- Keep `category?: string` (already exists)
- Keep `tags?: string[]` (already exists)
- Add `keywords?: string[]`
- Remove `surfaces?: string[]`

### 2. Update `publish_skill` tool in src/mcp-server.ts
- Keep `category` parameter
- Add `tags` parameter (array)
- Add `keywords` parameter (array)
- Remove `surfaces` parameter
- Update `addToMarketplace()` call to pass new fields

### 3. Update `addToMarketplace()` in src/github-client.ts
- Accept `tags` and `keywords` in addition to `category`
- Remove `surfaces` handling
- Write all three fields to marketplace.json

### 4. Update `list_skills` output in src/mcp-server.ts
- Add `category`, `tags`, `keywords` to skill response objects
- Need to check if `listSkills()` returns these from the plugin entry

### 5. Update `listSkills()` / `listPlugins()` in src/github-client.ts
- Ensure `category`, `tags`, `keywords` are included in returned data
- Remove any `surfaces` filtering logic

### 6. Update `fetch_skill` output in src/mcp-server.ts
- Include `category`, `tags`, `keywords` in response if available

### 7. Clean up remaining `surfaces` references
- Remove from `PluginEntry` interface
- Remove from `listPlugins()` options/filtering
- Remove from any other locations

### 8. Create future features doc
- Create `docs/working/future-features.md`
- Add filtering by category/tags as a future feature

## Files to Modify
1. src/github-client.ts - PluginEntry interface, addToMarketplace, listPlugins
2. src/mcp-server.ts - publish_skill, list_skills, fetch_skill tools
3. New: docs/working/future-features.md

## Migration Note
The `word-pair-swap` plugin in skillport-marketplace-template has `surfaces` in marketplace.json - that will need to be cleaned up separately in that repo.
