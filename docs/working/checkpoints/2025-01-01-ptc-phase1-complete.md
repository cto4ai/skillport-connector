# Checkpoint: PTC Phase 1 Complete

**Date:** 2025-01-01
**Branch:** main
**Last Commit:** fix: Resolve install script failing on large JSON responses

## Summary

Successfully implemented and tested Phase 1 of PTC (Programmatic Tool Calling) optimization for Skillport skill installation. The token-based approach reduces installation from ~11k tokens to ~100 tokens (99% reduction).

## What Was Implemented

### New MCP Tools
- **`install_skill`** - Returns a short-lived token + bash command (~100 tokens)
- **`fetch_skill_details`** - Returns only SKILL.md content (replaces full file fetch for browsing)

### New REST Endpoints
- **`GET /install.sh`** - Serves the installation bash script
- **`GET /api/install/:token`** - Redeems tokens for skill files (no auth needed - token is the auth)

### Token System
- Tokens prefixed with `sk_install_`
- 5-minute TTL, single-use
- Stored in Cloudflare KV with metadata (skill, version, user, created, used)

## Testing Results

### Claude Code - Direct Install ✅
```bash
bash <(curl -sf https://skillport-connector.jack-ivers.workers.dev/install.sh) sk_install_xxx
# Successfully installs to ~/.claude/skills/
```

### Claude Code - Package Mode ✅
```bash
bash <(curl -sf https://skillport-connector.jack-ivers.workers.dev/install.sh) sk_install_xxx --package
# Successfully creates .skill zip file
```

### Claude.ai/Desktop ⚠️
- Claude correctly calls `install_skill` and gets token
- Claude displays the bash command to user
- **BUT**: Claude.ai cannot execute bash commands
- User must manually copy/paste command to terminal

## Key Discovery

The PTC pattern works differently across Claude surfaces:

| Surface | Bash Execution | Installation Method |
|---------|----------------|---------------------|
| Claude Code | ✅ Native | PTC (token + bash) |
| Claude.ai | ❌ Not available | Manual bash or `fetch_skill` |
| Claude Desktop | ❌ Not available | Manual bash or `fetch_skill` |

## Files Modified

| File | Changes |
|------|---------|
| `src/index.ts` | Added REST endpoints, install script serving |
| `src/mcp-server.ts` | Added `install_skill`, `fetch_skill_details` tools |
| `src/github-client.ts` | Added `getSkill()`, `fetchSkillMd()` methods |

## Bug Fixed This Session

**JSONDecodeError with large JSON responses**
- Root cause: Python reading from stdin but bash wrote to file
- Fix: Changed Python to read from `/tmp/skillport_response.json`
- Added cleanup after processing

## Open Questions

For Claude.ai/Desktop, options are:
1. **Keep both paths** - `install_skill` for Claude Code, `fetch_skill` for Claude.ai
2. **Update skillport-manager** - Detect surface and use appropriate method
3. **Accept manual step** - User copies command to terminal (still saves tokens in conversation)

## Next Steps

- Decide on Claude.ai/Desktop installation approach
- Consider if `fetch_skill` should be kept for backwards compatibility
- May need to update skillport-manager skill to be surface-aware
