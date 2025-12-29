# Checkpoint: Official Anthropic Plugin/Skill Structure Research

**Date:** 2025-12-29
**Status:** COMPLETE - Findings documented
**Branch:** fix/expand-save-skill-scope

## Context

While implementing the `save_skill` scope expansion fix, Codex raised a concern about rejecting bare `SKILL.md` paths. This prompted research into the official Anthropic plugin marketplace structure to ensure compatibility.

---

## Research Sources

- [anthropics/skills repository](https://github.com/anthropics/skills) - Official Anthropic skills
- [Claude Code Plugin Marketplaces docs](https://code.claude.com/docs/en/plugin-marketplaces)
- [Official marketplace.json](https://raw.githubusercontent.com/anthropics/skills/main/.claude-plugin/marketplace.json)

---

## Key Finding: Official Structure Differs from Ours

### Official Anthropic Structure

```
anthropics/skills/
├── .claude-plugin/
│   └── marketplace.json
└── skills/
    ├── pdf/
    │   ├── SKILL.md           ← At skill root!
    │   ├── LICENSE.txt
    │   ├── forms.md
    │   ├── reference.md
    │   └── scripts/
    └── xlsx/
        ├── SKILL.md           ← At skill root!
        └── ...
```

**SKILL.md is at the skill root**, not in a subdirectory.

### Our Skillport Structure

```
skillport-template/
├── .claude-plugin/
│   └── marketplace.json
└── plugins/
    └── data-analyzer/
        ├── plugin.json        ← Our addition (not in official)
        └── skills/
            ├── SKILL.md       ← In subdirectory!
            ├── scripts/
            └── references/
```

**SKILL.md is in a `skills/` subdirectory**, plus we add `plugin.json`.

---

## marketplace.json Schema Differences

### Official Anthropic

Uses a `skills` array pointing to skill directories:

```json
{
  "name": "anthropic-agent-skills",
  "owner": { "name": "Keith Lazuka", "email": "klazuka@anthropic.com" },
  "plugins": [
    {
      "name": "example-skills",
      "description": "Collection of example skills...",
      "source": "./",
      "strict": false,
      "skills": [
        "./skills/pdf",
        "./skills/xlsx",
        "./skills/docx"
      ]
    }
  ]
}
```

Key points:
- Uses `skills` array with paths to skill directories
- `source: "./"` points to repo root
- `strict: false` means no plugin.json required
- No `skillPath` field
- Multiple skills per "plugin" entry

### Our Skillport Structure

Uses `skillPath` for single skill per plugin:

```json
{
  "name": "skillport-marketplace",
  "plugins": [
    {
      "name": "data-analyzer",
      "source": "./plugins/data-analyzer",
      "skillPath": "skills/SKILL.md",
      "version": "1.1.0"
    }
  ]
}
```

Key points:
- Uses `skillPath` field (not in official schema)
- One skill per plugin entry
- `source` points to plugin directory
- We track `version` in marketplace.json
- We require `plugin.json` at plugin root

---

## plugin.json Comparison

### Official Approach

- Located at `.claude-plugin/plugin.json` (if used)
- Only required when `strict: true` in marketplace entry
- Most official skills use `strict: false` (no plugin.json)

### Our Approach

- Located at plugin root: `plugins/{name}/plugin.json`
- Always required (for version tracking, author info)
- Used by `bump_version` tool

---

## Implications

### Codex Was Right

The guard rejecting bare `SKILL.md` paths would break compatibility with the official Anthropic structure where SKILL.md is at skill root.

### We Are Already Divergent

Our structure differs significantly from official:
1. We use `skillPath` instead of `skills` array
2. We require `plugin.json` (official doesn't)
3. We nest SKILL.md under `skills/` subdirectory
4. We have one skill per plugin (official has multiple)

### Options

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| 1. Remove bare path guard | Allow any valid path | Full flexibility | Lose helpful error for misplaced files |
| 2. Check skillPath from entry | Allow SKILL.md if plugin's skillPath is root-level | Smart, contextual | More complex logic |
| 3. Keep our structure | Stay divergent, document differences | Consistent | Not compatible with official |
| 4. Align with official | Restructure to match Anthropic | Compatible | Breaking change, lose plugin.json benefits |

### Recommendation

**Option 1: Remove the bare path guard** for now.

Rationale:
- We're already significantly divergent from official
- The guard adds complexity without clear benefit
- Let callers use whatever structure they want
- Can add smarter validation later if needed

---

## Schema Alignment Considerations (Future)

If we want better alignment with official structure:

1. **Support `skills` array** - Allow multiple skills per plugin
2. **Make plugin.json optional** - Support `strict: false` mode
3. **Support root-level SKILL.md** - Don't require `skills/` subdirectory
4. **Keep version tracking** - But maybe move to marketplace.json only

This would be a larger refactor for a future version.

---

## Action Items

| Item | Priority | Status |
|------|----------|--------|
| Remove bare path guard from save_skill | High | Pending decision |
| Document our structure vs official | Medium | Not started |
| Consider official schema alignment | Low | Future consideration |

---

**Last Updated:** 2025-12-29
