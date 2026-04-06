# Optimized Skill Installation via Programmatic Tool Calling

**Created:** 2025-12-31
**Updated:** 2025-01-01
**Status:** Phase 1 Complete, Phase 2 In Progress
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
| `fetch_skill` | Returns ALL files (~11k tokens) | **REMOVED** |
| `fetch_skill_details` | N/A | **NEW**: Returns SKILL.md content (~500-2k tokens) |
| `install_skill` | N/A | **NEW**: Returns token + command (~100 tokens) |
| `check_updates` | Compare versions | Unchanged |

**`fetch_skill` has been removed.** The `install_skill` tool now handles all installation via PTC.

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

| Component | Location | Status |
|-----------|----------|--------|
| `install_skill` MCP tool | skillport-connector | ✅ Done |
| `fetch_skill_details` MCP tool | skillport-connector | ✅ Done |
| `/api/install/:token` REST endpoint | skillport-connector | ✅ Done |
| `/install.sh` served script | skillport-connector | ✅ Done |
| Remove `fetch_skill` | skillport-connector | ✅ Done |
| `skillport-manager` update | skillport-marketplace-template | 🔄 Pending |
| `skillport-code-manager` | skillport-marketplace-template | 🔄 Pending (may not be needed) |

## Deployment Strategy

**Executed:** We removed `fetch_skill` immediately since the PTC approach is better and the old skillport-manager wasn't widely deployed yet.

**Requirement for Claude.ai:** Users must add the connector domain to their allowed domains:

1. Go to **Settings > Code execution and file creation**
2. Enable **Allow network egress**
3. Under **Additional allowed domains**, add: `skillport-connector.jack-ivers.workers.dev`

This is required because the install script needs to fetch skill files from the connector's REST API. Without this, curl requests from Claude.ai's sandbox will be blocked with "host not allowed".

## Phases

### Phase 1: Connector Changes ✅ COMPLETE
- [x] Add `install_skill` MCP tool
- [x] Add `fetch_skill_details` MCP tool
- [x] Add `/api/install/:token` REST endpoint
- [x] Add `/install.sh` served script
- [x] Remove `fetch_skill` (not deprecated, removed)
- [x] Deploy and test
- [x] Test bootstrap on Claude.ai (works with domain allowlist)
- [x] Test bootstrap on Claude Code (works)

### Phase 2: Skills 🔄 IN PROGRESS
- [ ] Update `skillport-manager` SKILL.md to use `install_skill`
- [ ] Test skillport-manager using new flow
- [ ] Bump version and publish
- [ ] (Optional) Create `skillport-code-manager` for Claude Code

### Phase 3: Documentation
- [ ] Update connector README
- [ ] Update checkpoint document
- [ ] Clean up working docs

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

- [x] Install completes in <15 seconds on all surfaces
- [x] Token usage reduced by >90% (~11k → ~100 tokens)
- [x] Works for bootstrap (no chicken-egg problem)
- [x] `fetch_skill_details` useful for "tell me more about X"
- [ ] skillport-manager updated to use new flow
