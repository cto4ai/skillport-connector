# Checkpoint: Skillport Skill Planning

**Date:** 2025-12-25 16:00
**Branch:** `feature/testing-setup` (merged) → `main`
**Status:** Authless connector deployed and working, ready to implement Skillport Skill

---

## Summary

The authless MCP connector is fully deployed and tested in Claude.ai. The next step is creating the **Skillport Skill** - a skill that allows Claude.ai users to browse and install skills from the Plugin Marketplace.

---

## Current State

### What's Working

| Component | Status | URL |
|-----------|--------|-----|
| OAuth Connector | ✅ Deployed | https://skillport-connector.jack-ivers.workers.dev |
| Authless Connector | ✅ Deployed | https://skillport-connector-authless.jack-ivers.workers.dev |
| Claude.ai Integration | ✅ Tested | 4 MCP tools available |
| API Key Auth | ✅ Working | `sk_craftycto_*` mapped to craftycto.com |

### MCP Tools Available

1. `list_plugins` - List plugins with optional filters
2. `get_plugin` - Get plugin details
3. `fetch_skill` - Fetch SKILL.md content for installation
4. `check_updates` - Check for plugin updates

---

## Skillport Skill Requirements

### Purpose

Allow Claude.ai users to:
1. Browse available skills in the marketplace
2. Select skills they want to install
3. Get the skill content "ported" to their local skill library

### Challenge

On Claude.ai, we cannot write files to the user's system. The skill needs to work within Claude.ai's constraints while still enabling skill installation.

---

## Open Questions

### 1. Installation Method

**Question:** On Claude.ai, we can't write files. How should the skill help users install skills?

**Options:**
- **A) Generate downloadable ZIP**: Create a .skill or .zip file the user can download
- **B) Display and instruct**: Show SKILL.md content with manual installation instructions
- **C) Clipboard workflow**: Copy-to-clipboard functionality (if available)
- **D) Claude Desktop only**: Target Desktop where file writing is possible

**Context from skill-creator:**
```markdown
## Installation Process (Recommended Workflow)

1. Create the skill folder structure
2. Write SKILL.md with proper frontmatter
3. Add any resource files
4. Upload via Settings > Capabilities > Skills
```

### 2. Where Should This Skill Live?

**Question:** Which repository should contain the Skillport Skill?

**Options:**
- **A) skillport-connector**: Keep with the MCP server code
- **B) skillport-template**: Include in the marketplace template
- **C) Separate repo**: New `skillport-skill` repository
- **D) Anthropic skills repo**: PR to anthropics/skills

**Considerations:**
- The skill needs the MCP connector URL configured
- Different marketplaces would need their own connector URLs
- The skill is specific to Skillport, not a generic Anthropic tool

### 3. User Identity Handling

**Question:** The workaround strategy mentioned passing user email for audit logging. Should we still implement this?

**Options:**
- **A) Memory-based email**: Skill instructs Claude to remember user's email
- **B) Simplify**: Skip email tracking for MVP, add later if needed
- **C) Prompt each time**: Ask user for email when first using tools

**Context:**
- `user_email` parameter is now available on all MCP tools
- Original purpose was audit logging for per-user tracking
- Marketplace data is read-only and public

---

## Research Completed

### Anthropic's skill-creator Skill

Located at: `github.com/anthropics/skills/skill-creator/SKILL.md`

Key learnings:
- Skills use YAML frontmatter with `name`, `description`, `instructions`
- Can include resource files referenced in instructions
- Progressive disclosure pattern - overview first, details as needed
- Installation via Settings > Capabilities > Skills

### Skill Format

```yaml
---
name: skill-name
description: What the skill does
instructions: |
  Core instructions for Claude
---

# Skill Title

## Overview
Brief description

## Usage
How to use the skill

## Resources
Files included with the skill
```

---

## Proposed Implementation

### Skill Structure

```
skillport-skill/
├── SKILL.md              # Main skill definition
├── resources/
│   ├── connector-url.txt # Pre-configured connector URL
│   └── api-key.txt       # (Optional) Org-specific API key
```

### Core Functionality

The Skillport Skill would:

1. **Browse**: Use `list_plugins` to show available skills
2. **Preview**: Use `get_plugin` to show skill details
3. **Fetch**: Use `fetch_skill` to get SKILL.md content
4. **Guide**: Provide installation instructions

### Example User Flow

```
User: "Show me available skills"
Claude: [Uses list_plugins MCP tool]
        "Here are 12 skills available:
         1. sales-pitch - Generate compelling sales presentations
         2. code-review - Review code for bugs and best practices
         ..."

User: "Tell me more about sales-pitch"
Claude: [Uses get_plugin MCP tool]
        "sales-pitch v1.2.0 by CraftyCTO
         Category: Sales
         Surfaces: claude-ai, claude-desktop
         ..."

User: "I want to install it"
Claude: [Uses fetch_skill MCP tool]
        "Here's the skill content:
         [SKILL.md content displayed]

         To install on Claude.ai:
         1. Copy the content above
         2. Go to Settings > Capabilities > Skills
         3. Create new skill folder 'sales-pitch'
         4. Paste as SKILL.md
         5. Upload"
```

---

## Next Steps

Once open questions are answered:

1. Create SKILL.md for Skillport Skill
2. Configure with authless connector URL
3. Test in Claude.ai
4. Document installation process

---

## References

- [Authless Workaround Strategy](../workaround/authless-workaround-strategy.md)
- [Code Review](../workaround/code-review-authless-implementation.md)
- [Anthropic Skills Repo](https://github.com/anthropics/skills)
- [MCP Inspector Testing](./2025-12-24-1042-mcp-testing-verified.md)
