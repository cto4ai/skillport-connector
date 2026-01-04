# Checkpoint: Missing Skills Cache Issue Investigation

**Date:** 2026-01-03 20:54:03
**Status:** PAUSED
**Branch:** feat/single-tool-api

## Objective

Investigate why `twitter-thread` and `word-pair-swap` skills don't appear in API results despite existing in the GitHub repo with valid structure.

## Changes Made

**Modified Files:**
- [CLAUDE.md](../../CLAUDE.md) - Added note about Claude Code not being able to call MCP tools (requires OAuth)

**Commits:**
- `651e30f` fix: use skill name for access control filtering
- `fd64edc` fix: validate installed array in check-updates endpoint
- `cef8738` feat: add file listing to skill details, validate bump type

## Key Issues/Findings

1. **Missing skills:** `twitter-thread` and `word-pair-swap` exist in repo with valid structure (plugin.json, SKILL.md) but don't appear in API list
2. **Cache suspicion:** Skills cache uses 300-second TTL in KV. GitHub API directory listing may be cached/stale
3. **Local vs GitHub mismatch:** Local repo was 4 commits behind - pulled to sync, but issue persists
4. **Structure verified:** Both missing skills have:
   - Valid `.claude-plugin/plugin.json`
   - Valid `skills/{name}/SKILL.md` with correct frontmatter

## Testing

- Claude Code CLI returned 15 skills (expected 17)
- Verified skill directories exist locally and on GitHub
- Cannot directly test MCP tools from Claude Code (requires OAuth)

## Next Steps

1. Add logging to `listSkills()` in `github-client.ts` to see exactly what GitHub API returns
2. Check if GitHub Contents API is paginating or returning stale data
3. Consider adding manual cache invalidation endpoint
4. Deploy with logging and test via Claude Desktop

## Notes

- Discovery logic in `github-client.ts:397-490` scans `plugins/` directory
- Silent error handling (line 478-480) may hide issues
- Skills cache key: `skills:${this.repo}` with 300s TTL
- Connector reads from GitHub API, not local filesystem

---

**Last Updated:** 2026-01-03 20:54:03
