# Checkpoint: Missing Skills Cache Issue Investigation

**Date:** 2026-01-03 20:54:03
**Status:** ROOT CAUSE IDENTIFIED
**Branch:** feat/single-tool-api

## Objective

Investigate why `twitter-thread` and `word-pair-swap` skills don't appear in API results despite existing in the GitHub repo with valid structure.

## Root Cause

**Cloudflare Workers subrequest limit exceeded.**

Cloudflare Workers (free tier) allow only **50 subrequests** per invocation. The `listSkills()` function makes too many GitHub API calls:

| Step | Calls |
|------|-------|
| List `plugins/` directory | 1 |
| Fetch `plugin.json` per plugin | 17 |
| List `skills/` directory per plugin | 17 |
| Fetch `SKILL.md` per skill | 17+ |
| **Total** | **~52+** |

The last two plugins alphabetically (`twitter-thread`, `word-pair-swap`) fail because the request hits the limit before reaching them.

**Error from logs:**
```
[listSkills] Failed to fetch SKILL.md for "twitter-thread" in plugin "twitter-thread": Too many subrequests.
[listSkills] Failed to fetch manifest for plugin "word-pair-swap": Too many subrequests.
[listSkills] Found 15 skills from 17 plugin directories
```

## Changes Made

**Modified Files:**
- `src/github-client.ts` - Added diagnostic logging to silent catch blocks in `listSkills()`
- `src/github-client.ts` - Added `debugListPlugins()` method for raw GitHub API response
- `src/rest-api.ts` - Added `?refresh=true` parameter to force cache invalidation
- `src/rest-api.ts` - Added `GET /api/debug/plugins` endpoint

**Commits:**
- `651e30f` fix: use skill name for access control filtering
- `fd64edc` fix: validate installed array in check-updates endpoint
- `cef8738` feat: add file listing to skill details, validate bump type

## Key Issues/Findings

1. **Missing skills:** `twitter-thread` and `word-pair-swap` exist in repo with valid structure but don't appear in API list
2. **Root cause:** Cloudflare Workers 50-subrequest limit exceeded
3. **GitHub API returns correctly:** Debug endpoint shows all 17 plugins
4. **Alphabetical order matters:** Last plugins fail when limit is hit

## Diagnostic Endpoints Added

| Endpoint | Purpose |
|----------|---------|
| `GET /api/skills?refresh=true` | Force cache invalidation before listing |
| `GET /api/debug/plugins` | Raw GitHub API response for plugins directory |

## Potential Solutions

1. **Use GitHub GraphQL API** - Batch multiple file fetches into one request
2. **Cache individual manifests** - Cache `plugin.json` and `SKILL.md` separately with longer TTL
3. **Pre-compute skill index** - Build index at deploy time or via webhook
4. **Reduce API calls** - Fetch only what's needed, lazy-load details
5. **Upgrade Cloudflare plan** - Paid plans have higher limits

## Testing

- `GET /api/debug/plugins` returns 17 directories (correct)
- `GET /api/skills?refresh=true` returns 15 skills (2 missing due to subrequest limit)
- Logs confirm "Too many subrequests" error for last 2 plugins

## Notes

- Discovery logic in `github-client.ts:397-490` scans `plugins/` directory
- Silent error handling now logs with `[listSkills]` prefix
- Skills cache key: `skills:${this.repo}` with 300s TTL
- Connector reads from GitHub API, not local filesystem

---

**Last Updated:** 2026-01-04 03:30:00
