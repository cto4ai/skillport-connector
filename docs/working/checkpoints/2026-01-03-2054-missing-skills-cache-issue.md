# Checkpoint: Missing Skills Cache Issue Investigation

**Date:** 2026-01-03 20:54:03
**Status:** ROOT CAUSE IDENTIFIED - SOLUTION RECOMMENDED
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

## Recommended Solution: Upgrade to Workers Paid Plan ⭐

**Cost: $5/month** - simplest and most cost-effective fix.

### Subrequest Limits by Plan

| Plan | Subrequest Limit | Cost |
|------|------------------|------|
| **Free** | 50 subrequests/request | $0 |
| **Paid (Standard)** | **1,000 subrequests/request** | **$5/month base** |

### What You Get for $5/month

| Resource | Free | Paid |
|----------|------|------|
| Requests | 100k/day | 10M/month included (+$0.30/M) |
| CPU time | 10ms/invocation | 30M ms/month (+$0.02/M ms) |
| **Subrequests** | **50** | **1,000** |
| KV reads | 100k/day | 10M/month (+$0.50/M) |
| KV storage | 1 GB | 1 GB (+$0.50/GB-mo) |

### Why This Works

- Current usage: ~52 subrequests
- Paid limit: 1,000 subrequests
- **Headroom: 20x** - supports growth to ~300+ plugins

### Estimated Monthly Cost for Skillport

Given typical usage:
- Requests: A few thousand/month → **included in base**
- CPU time: Minimal → **included in base**  
- KV operations: Caching reduces GitHub calls → **included in base**

**Total: ~$5/month flat** (unlikely to exceed included allocations)

### How to Upgrade

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages**
2. Find **Plans** or **Usage Model** → Upgrade to Standard/Paid
3. Redeploy or wait for cache to expire (5 min TTL)

### Benefits Beyond Subrequests

- Higher KV limits (10M reads/month vs 100k/day)
- More CPU time (30M ms/month vs 10ms/invocation)
- Better analytics and observability
- No code changes required

## Alternative Solutions (If Paid Plan Not Desired)

1. **Pre-computed Skills Index** - Build `skills-index.json` via GitHub Action on push
   - Pros: 1 subrequest instead of 50+
   - Cons: Requires webhook/CI setup, slight delay on updates

2. **GitHub GraphQL API** - Batch multiple file fetches into single request
   - Pros: No infrastructure changes
   - Cons: More complex query building

3. **Individual Manifest Caching** - Cache each `plugin.json` separately with longer TTL
   - Pros: Simple change
   - Cons: First request still fails, eventual consistency

4. **Lazy Discovery** - Only fetch full details on-demand
   - Pros: Reduces initial load
   - Cons: Slower individual skill fetches

## Changes Made (Diagnostics)

**Modified Files:**
- `src/github-client.ts` - Added diagnostic logging to silent catch blocks in `listSkills()`
- `src/github-client.ts` - Added `debugListPlugins()` method for raw GitHub API response
- `src/rest-api.ts` - Added `?refresh=true` parameter to force cache invalidation
- `src/rest-api.ts` - Added `GET /api/debug/plugins` endpoint

**Commits:**
- `651e30f` fix: use skill name for access control filtering
- `fd64edc` fix: validate installed array in check-updates endpoint
- `cef8738` feat: add file listing to skill details, validate bump type

## Diagnostic Endpoints Added

| Endpoint | Purpose |
|----------|---------|
| `GET /api/skills?refresh=true` | Force cache invalidation before listing |
| `GET /api/debug/plugins` | Raw GitHub API response for plugins directory |

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

**Last Updated:** 2026-01-04 04:15:00
