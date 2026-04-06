# Checkpoint: marketplace.json Maintenance Research

**Date:** 2025-12-27
**Status:** RESEARCH COMPLETE
**Branch:** main

## Question

How does Anthropic expect `.claude-plugin/marketplace.json` to be maintained?

## Finding

**Anthropic expects marketplace.json to be maintained manually** through direct editing and version control. No automation tooling is provided.

## Key Details

### Two Approaches with `strict` Field

- `strict: true` (default) - marketplace fields merge with the plugin's own `plugin.json`
  - Plugin's manifest is authoritative for version/description
  - Marketplace entry can be minimal (just source + marketplace-specific fields)

- `strict: false` - marketplace defines everything
  - Plugin doesn't need its own manifest
  - All metadata lives in marketplace.json

### Validation Tooling

```bash
claude plugin validate .
# or within Claude Code:
/plugin validate .
```

### Update Propagation

Changes propagate when users run `/plugin marketplace update` - it's git-based.

## Implications for Skillport

### Current State (Duplication)

We're duplicating data:
- `marketplace.json` has version: "1.1.1"
- `plugins/data-analyzer/plugin.json` has version: "1.1.1"

Both need manual updates when releasing.

### Potential Improvement

We could simplify by using `strict: true` and letting plugin manifests define version/description:

```json
// marketplace.json - minimal entry
{
  "name": "data-analyzer",
  "source": "./plugins/data-analyzer",
  "category": "examples",
  "tags": ["data", "csv", "json"],
  "surfaces": ["claude-desktop", "claude-ai"],
  "skillPath": "skills/SKILL.md"
  // version, description, author come from plugin.json
}
```

### However - Skillport Connector Consideration

Our MCP connector reads `marketplace.json` directly via GitHub API. If we rely on merging with plugin.json:
1. We'd need to fetch both files and merge them
2. More API calls, more complexity
3. Current approach (explicit in marketplace.json) is simpler for our use case

**Decision:** Keep version explicit in marketplace.json for now. The duplication is manageable and simplifies the connector logic.

## Sources

- [Create and distribute a plugin marketplace - Claude Code Docs](https://code.claude.com/docs/en/plugin-marketplaces)
- [Anthropic's Official Plugin Repository](https://github.com/anthropics/claude-plugins-official)

---

**Last Updated:** 2025-12-27
