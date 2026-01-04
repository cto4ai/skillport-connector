# Checkpoint: Experiential Learning from Skillport Usage

**Date:** 2025-12-29
**Status:** IN PROGRESS - Collecting Observations
**Branch:** main

## Context

First real-world testing of Skillport skill creation and editing tools from Claude Desktop. Capturing learnings, friction points, and potential improvements.

---

## Observations

### 1. Missing plugin.json on Skill Creation

**Issue:** The `soil-data-analyzer` skill was created without a `plugin.json` file at the plugin root.

**What was created:**
```
plugins/soil-data-analyzer/
└── skills/
    ├── SKILL.md              ✅
    ├── references/
    │   ├── soil_parameters.md  ✅
    │   └── supported_formats.md ✅
    └── scripts/
        ├── analyze_soil_data.py  ✅
        └── soil_quality_check.py ✅
```

**What was missing:**
```
plugins/soil-data-analyzer/
├── plugin.json               ❌ MISSING
└── skills/
    └── ...
```

**Impact:**
- `bump_version` tool won't work (expects plugin.json)
- No author attribution or license info
- Inconsistent with other plugins in marketplace

**Root Cause:**
1. Claude Desktop used `save_skill` to create files in `skills/` subdirectory
2. Model didn't know `plugin.json` is required at plugin root
3. `publish_plugin` added entry to marketplace.json but doesn't validate/create plugin.json

**Proposed Fixes:**

| Option | Description | Complexity |
|--------|-------------|------------|
| A. Validate in publish_plugin | Check plugin.json exists before adding to marketplace | Low |
| B. Auto-create in publish_plugin | Create plugin.json from publish params if missing | Medium |
| C. Document in save_skill | Add tool description guidance about required files | Low |
| D. Create scaffolding tool | New `init_plugin` tool that creates proper structure | Medium |

**Recommended:** Option A + C
- `publish_plugin` should validate plugin.json exists and return helpful error if missing
- `save_skill` tool description should mention plugin.json requirement

**Claude Desktop's Attempted Fix:**

When informed of the missing plugin.json, Claude tried:
```json
{
  "name": "soil-data-analyzer",
  "files": [{ "path": "../plugin.json", "content": "..." }]
}
```

Got error: `Path "../plugin.json" is invalid. Paths must be relative and cannot contain ".." segments.`

Claude correctly diagnosed: "The Skillport MCP server's save_skill tool only allows paths within the skills subdirectory... it doesn't have a way to create or update files at the plugin root level."

Claude's proposed solutions:
1. New tool like `save_plugin_file` that can write to plugin root
2. Use `create_plugin` first to scaffold, then `save_skill` for content

**Insight:** The path validation is working correctly (security), but we lack a way to write to plugin root after initial creation. Current `save_skill` assumes all files go under `plugins/{name}/skills/`.

**Technical Fix Options:**

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| 1. Expand `save_skill` scope | Change base path from `plugins/{name}/skills/` to `plugins/{name}/` | Single tool, simple mental model | Breaking change for existing callers |
| 2. New `save_plugin_file` tool | Separate tool for plugin root files | No breaking change, clear separation | More tools to learn |
| 3. Require `create_plugin` first | Enforce workflow: create_plugin → save_skill → publish_plugin | Uses existing tools | Workflow complexity, doesn't help after-the-fact |

**Recommendation:** Option 1 (Expand `save_skill` scope)

Rationale:
- Single tool is easier for Claude to learn and use
- Path like `skills/SKILL.md` is self-documenting
- `plugin.json` at root becomes natural: just use `plugin.json` as path
- Existing callers using `SKILL.md` would need to change to `skills/SKILL.md`
- Can validate `..` segments to maintain security

---

### 2. Tool Caching in Claude Desktop

**Issue:** Claude Desktop caches the MCP tool list from initial connection. After deploying new editor tools (Phase 5), Claude Desktop couldn't see them until manually reconnecting.

**Impact:** Users who connected before an update won't see new tools.

**Potential Solutions:**
| Option | Approach | Pros | Cons |
|--------|----------|------|------|
| Version the connector | Expose version in MCP metadata | Could detect staleness | Doesn't auto-refresh |
| Document reconnect | Tell users to disconnect/reconnect | Simple, no code | Manual friction |
| Tool discovery endpoint | `get_server_info` tool with version | Claude could poll | Extra tool call |
| SSE version heartbeat | Include version in keepalive | Client detects changes | Requires client support |

**Status:** Exploring options, no decision yet.

---

### 2. Multiple Commits Per Skill Creation

**Observation:** Creating `soil-data-analyzer` skill produced 6 commits:
- 5 "Initial creation" commits (one per file)
- 1 "Add to marketplace" commit

**Root Cause:** GitHub Contents API only supports single-file operations.

**User Reaction:** Understood after explanation, acceptable for now.

**Future Option:** GitHub Trees API for atomic multi-file commits (V2 enhancement).

---

### 3. OAuth Context in MCP Tools

**Observation:** Calling `whoami` from Claude Code (without OAuth session) returned `undefined:undefined` for user ID.

**Root Cause:** MCP tools called directly don't have OAuth session props populated.

**Implication:** Tools must gracefully handle missing auth context, or clearly indicate when OAuth is required.

---

## Questions to Explore

- [ ] How do other MCP servers handle tool list versioning?
- [ ] What's the Claude Desktop reconnection UX like?
- [ ] Should we expose a "check for updates" flow in the connector?
- [ ] How often do we expect to add/change tools?

---

## Successes

- Skill creation from Claude Desktop works end-to-end
- Editor tools (save_skill, publish_plugin) functioning correctly
- Access control properly identifying authorized editors
- Commit messages include user attribution

---

## Next Testing

- [ ] Test editing existing skill (fetch_skill -> modify -> save_skill)
- [ ] Test in Claude.ai with OAuth
- [ ] Test with non-editor user (verify access denied)
- [ ] Test version bumping workflow

---

## Action Items

| Item | Priority | Status |
|------|----------|--------|
| Add plugin.json validation to publish_plugin | High | Not started |
| Update save_skill description with required files guidance | High | Not started |
| Fix soil-data-analyzer (add missing plugin.json) | High | Not started |
| Decide on tool versioning approach | Low | Exploring |
| Document reconnect requirement | Medium | Not started |
| Create Editor Skill (guided workflow) | Medium | Not started |

---

**Last Updated:** 2025-12-29
