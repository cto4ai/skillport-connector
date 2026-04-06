# Skill Surface Tagging - Implementation Plan

*Created: January 2026*

## Goal

Implement surface tagging for skills so users can discover skills appropriate for their Claude surface (CC, CD, CAI), with good UX for listing and filtering.

---

## Research Findings

### Surface Detection Methods

| Method | Can Detect | Notes |
|--------|-----------|-------|
| MCP `clientInfo.name` | CC vs CDAI (maybe) | CD and CAI both report as `"claude-ai"` |
| Tool availability | CC (has Bash), CD (has local MCPs), CAI (neither) | Most reliable |
| Official spec `compatibility` field | None (free-form text for docs) | Not machine-readable |

### Official Spec Support

- **`tags` array**: Official Plugin Marketplace field, can use for surface tags
- **`compatibility` field**: Free-form text (max 500 chars), for human documentation only
- **No structured surface detection** in official spec

### How Existing Skills Handle It

**Obsidian skill**: Detects MCP namespace
- `obsidian-local:*` tools → CD or CC (local MCP)
- `obsidian-remote:*` only → CAI (connector)

**Skillport skill**: Detects Bash availability
- Bash present → CC (use `--skill` for direct install)
- No Bash → CDAI (use `--package` for upload)

### Surface Characteristics

| Tag | Full Name | Bash | Local MCPs | Plugin Marketplace |
|-----|-----------|------|------------|-------------------|
| CC | Claude Code | Yes | Yes | Yes |
| CD | Claude Desktop | No | Yes (optional) | No |
| CAI | Claude.ai | No | No (connectors only) | No |

---

## Implementation Phases

### Phase 1: Documentation (skillport-connector)

**Commit separately for reference**

- `docs/working/skill-surface-tagging/01-surface-landscape.md`
  - Add research findings on detection methods
  - Document CD can have local MCPs (unlike CAI)
  - Add detection logic patterns

- `docs/working/skill-surface-tagging/02-tagging-convention.md`
  - Finalize tag convention
  - Document detection approach for skills

### Phase 2: API Changes (skillport-connector)

**Connector code changes**

- `src/github-client.ts`
  - Ensure `tags` field returned in skill listings
  - Add optional `surface` filter to `listSkills()`

- `src/mcp-server.ts` (list_skills tool)
  - Add `surface` param (optional)
  - Return `surface_tags` (extracted from `tags` with `surface:` prefix)

- `src/rest-api.ts` (GET /api/skills)
  - Add `?surface=CC` query param
  - Return `surface_tags` in response

### Phase 3: Skill Changes (crafty-skillport-marketplace)

**Skillport skill updates**

- `plugins/skillport/skills/skillport/SKILL.md`
  - Add section on surface detection
  - Update list skills to show "Surface" column
  - Default filter by detected surface, option for all

### Phase 4: Marketplace Data (crafty-skillport-marketplace)

**Tag existing skills**

- Add `surface:CALL` to skills that work everywhere
- Add specific tags (`surface:CC`, `surface:CDAI`) where needed

---

## UX Design

### List Skills Output

```
| Name          | Description              | Version | Surface |
|---------------|--------------------------|---------|---------|
| skillport     | Browse and install...    | 1.2.11  | CALL    |
| obsidian      | Interface with vault...  | 1.0.0   | CALL    |
| code-review   | Review PRs...            | 1.0.0   | CC      |
```

### Filtering Behavior

- **Default**: Show skills matching detected surface + CALL
- **`all_surfaces=true`**: Show all skills regardless of surface tag
- **Explicit `surface=CC`**: Filter to specific surface

---

## Verification

1. Deploy connector changes
2. Add surface tags to test skills in marketplace
3. Test `list_skills` with surface filter via Claude.ai
4. Verify surface column displays correctly
5. Test detection logic in skillport skill
