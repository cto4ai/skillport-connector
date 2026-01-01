# Optimized Skill Installation via Programmatic Tool Calling

**Created:** 2025-12-31  
**Updated:** 2025-12-31  
**Status:** Planning  
**Research:** [skillport-installation-optimization-across-surfaces.md](../../research/skillport-installation-optimization-across-surfaces.md)

## Goal

Reduce skill installation time from **2-5 minutes** to **5-10 seconds** across all Claude surfaces by applying Anthropic's Programmatic Tool Calling (PTC) pattern.

| Metric | Current | Target |
|--------|---------|--------|
| Tokens consumed | ~11,000 | ~100 |
| Tool round-trips | N + 2 | 2 |
| Wall-clock time | 2-5 min | 5-10 sec |

## Key Decisions

### Tool Changes

| Tool | Before | After |
|------|--------|-------|
| `list_skills` | Returns metadata for all skills | Unchanged (future: slim down) |
| `fetch_skill` | Returns ALL files (~11k tokens) | **DEPRECATED** (kept for Phase 1-2) |
| `fetch_skill_details` | N/A | **NEW**: Returns SKILL.md content (~500-2k tokens) |
| `install_skill` | N/A | **NEW**: Returns token + command (~100 tokens) |
| `check_updates` | Compare versions | Unchanged |

**`fetch_skill` is deprecated, not removed immediately.** This allows existing `skillport-manager` v1.x to keep working during transition.

### Surface-Specific Skills

| Skill | Surface | Final Output |
|-------|---------|--------------|
| `skillport-manager` | Claude.ai / Desktop | `.skill` zip file |
| `skillport-code-manager` | Claude Code | Files in `~/.claude/skills/` |

Both skills use `install_skill` → script. Different flags, different outputs.

### Bootstrap

Bootstrap uses `install_skill` too - no special case needed. The install script is served from the connector, so it works before any skill is installed.

## How It Works

```
User: "install data-analyzer from skillport"

1. Claude calls install_skill("data-analyzer")
   → Returns: { token, command, skill, version }

2. Claude runs:
   Claude.ai/Desktop: bash <(curl -sf .../install.sh) <token> --package
   Claude Code:       bash <(curl -sf .../install.sh) <token>

3. Script:
   - Redeems token via REST API
   - Writes files
   - Creates .skill zip (if --package)

4. Claude.ai/Desktop: present_files → "Click Copy to your skills"
   Claude Code: "Restart Claude Code to use this skill"
```

## Components to Build

| Component | Location | Purpose |
|-----------|----------|---------|
| `install_skill` MCP tool | skillport-connector | Returns token + command |
| `fetch_skill_details` MCP tool | skillport-connector | Returns SKILL.md (new tool) |
| `/api/install/:token` REST endpoint | skillport-connector | Redeems token for skill files |
| `/install.sh` served script | skillport-connector | Fetches and writes files |
| Remove `fetch_skill` | skillport-connector | Old tool that returned all files |
| `skillport-manager` update | skillport-marketplace-template | Uses `install_skill` |
| `skillport-code-manager` | skillport-marketplace-template | **NEW** skill for Claude Code |

## Deployment Strategy

**Problem:** If we remove `fetch_skill` from connector, existing `skillport-manager` v1.x breaks immediately.

**Solution:** Coordinated deployment:

1. **Deploy connector with ALL tools:**
   - Keep `fetch_skill` (deprecated, still works)
   - Add `fetch_skill_details` (new)
   - Add `install_skill` (new)

2. **Update and publish skills:**
   - `skillport-manager` v2.0 uses `install_skill`
   - `skillport-code-manager` v1.0 uses `install_skill`

3. **Wait for adoption** (optional grace period)

4. **Remove `fetch_skill`** in a later connector release

This ensures no breaking changes for existing users.

## Phases

### Phase 1: Connector Changes
- [ ] Add `install_skill` MCP tool
- [ ] Add `fetch_skill_details` MCP tool
- [ ] Keep `fetch_skill` (deprecated, for backwards compatibility)
- [ ] Add `/api/install/:token` REST endpoint  
- [ ] Add `/install.sh` served script
- [ ] Deploy and test

### Phase 2: Skills
- [ ] Update `skillport-manager` SKILL.md to use `install_skill`
- [ ] Create `skillport-code-manager` skill for Claude Code
- [ ] Test on all surfaces
- [ ] Bump versions and publish

### Phase 3: Cleanup (later)
- [ ] Remove deprecated `fetch_skill` from connector
- [ ] Update docs

## Detailed Specs

See individual spec files:
- [01-connector-changes.md](./01-connector-changes.md) - Tools and endpoints
- [02-install-script.md](./02-install-script.md) - Bash script implementation
- [03-skills-update.md](./03-skills-update.md) - Both skills

## Testing Plan

| Test | Surface | Expected Result |
|------|---------|-----------------|
| `install_skill` returns valid token | All | Token with 5 min TTL |
| Token redeemable via curl | CLI | Full skill JSON returned |
| Token single-use | CLI | Second request fails with 410 |
| Token expires | CLI | Request after 5 min fails with 404 |
| `fetch_skill_details` returns SKILL.md | All | Single file content, not all files |
| install.sh writes files | Claude Code | Files in ~/.claude/skills/ |
| install.sh --package creates zip | Claude.ai | .skill file created |
| Bootstrap skillport-manager | Claude.ai | Works via install_skill |
| Bootstrap skillport-code-manager | Claude Code | Works via install_skill |

## Success Criteria

- [ ] Install completes in <15 seconds on all surfaces
- [ ] Token usage reduced by >90%
- [ ] No regression in install success rate
- [ ] Works for bootstrap (no chicken-egg problem)
- [ ] `fetch_skill_details` useful for "tell me more about X"
