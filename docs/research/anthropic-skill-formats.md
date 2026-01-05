# Anthropic Skill & Plugin Formats

*Research conducted January 2026*

Anthropic supports **two official formats** for sharing Skills and Plugins with Claude Code. Both work with the `/plugin` command but serve different purposes.

---

## 1. Agent Skills Format (Simpler)

**Specification:** https://agentskills.io/specification

**Example repo:** https://github.com/anthropics/skills

### Structure

Minimal structure requires just one file:

```
skill-name/
└── SKILL.md          # Required
```

Optional directories:
```
skill-name/
├── SKILL.md
├── scripts/          # Helper scripts
├── references/       # Reference documentation
└── assets/           # Images, templates, etc.
```

### SKILL.md Format

```markdown
---
name: my-skill-name
description: A clear description of what this skill does and when to use it.
---

# My Skill Name

[Instructions that Claude will follow when this skill is active]
```

**Required frontmatter:**
- `name` — 1-64 characters, lowercase, hyphens allowed
- `description` — 1-1024 characters explaining purpose and triggers

**Optional frontmatter:**
- `license`
- `compatibility`
- `metadata`
- `allowed-tools`

### Marketplace Integration

A marketplace using this format has skills directly under a `skills/` directory:

```
marketplace-repo/
├── .claude-plugin/
│   └── marketplace.json
└── skills/
    ├── skill-one/
    │   └── SKILL.md
    ├── skill-two/
    │   └── SKILL.md
    └── ...
```

The `marketplace.json` groups skills into logical plugins:

```json
{
  "name": "my-marketplace",
  "plugins": [
    {
      "name": "plugin-group",
      "source": "./",
      "skills": ["skill-one", "skill-two"]
    }
  ]
}
```

### Use Case

Best for: Simple skill collections focused purely on teaching Claude specialized tasks. No versioning per-skill, no commands/agents/hooks.

---

## 2. Plugin Marketplace Format (Full)

**Documentation:** https://code.claude.com/docs/en/plugin-marketplaces

**Example repo:** https://github.com/anthropics/claude-plugins-official

### Structure

```
marketplace-repo/
├── .claude-plugin/
│   └── marketplace.json
└── plugins/
    └── plugin-name/
        ├── .claude-plugin/
        │   └── plugin.json      # Required per-plugin manifest
        ├── skills/
        │   └── skill-name/
        │       └── SKILL.md
        ├── commands/            # Slash commands
        ├── agents/              # Custom agents
        └── README.md
```

### plugin.json Format

```json
{
  "name": "plugin-name",
  "version": "1.0.0",
  "description": "What this plugin does",
  "author": {
    "name": "Author Name",
    "email": "author@example.com"
  },
  "license": "MIT"
}
```

### Additional Plugin Types

Beyond skills, plugins can include:

| Field | Type | Description |
|-------|------|-------------|
| `commands` | string\|array | Custom slash commands |
| `agents` | string\|array | Custom agents |
| `hooks` | string\|object | Hooks configuration |
| `mcpServers` | string\|object | MCP server configurations |
| `lspServers` | string\|object | LSP server configurations |

**Example with MCP and LSP servers:**

```json
{
  "name": "enterprise-tools",
  "mcpServers": {
    "enterprise-db": {
      "command": "${CLAUDE_PLUGIN_ROOT}/servers/db-server",
      "args": ["--config", "${CLAUDE_PLUGIN_ROOT}/config.json"]
    }
  },
  "lspServers": {
    "custom-lsp": {
      "command": "${CLAUDE_PLUGIN_ROOT}/lsp-server"
    }
  }
}
```

Note: `${CLAUDE_PLUGIN_ROOT}` references files within the plugin's installation directory.

*Source: [Plugin Marketplaces Documentation](https://code.claude.com/docs/en/plugin-marketplaces)*

### marketplace.json Format

```json
{
  "name": "my-marketplace",
  "owner": {
    "name": "Organization",
    "email": "contact@example.com"
  },
  "plugins": [
    {
      "name": "plugin-name",
      "source": "./plugins/plugin-name",
      "description": "Plugin description",
      "version": "1.0.0"
    }
  ]
}
```

### Use Case

Best for: Full-featured plugin marketplaces with:
- Per-plugin versioning via `plugin.json`
- Slash commands
- Custom agents
- Hooks
- MCP servers
- LSP servers
- Organized plugin groups

---

## Comparison

| Feature | Agent Skills Format | Plugin Marketplace Format |
|---------|--------------------|-----------------------|
| Minimum files | `SKILL.md` only | `plugin.json` + `SKILL.md` |
| Versioning | At marketplace level | Per-plugin |
| Slash commands | No | Yes |
| Custom agents | No | Yes |
| Hooks | No | Yes |
| MCP servers | No | Yes |
| Directory depth | Flat (`skills/name/`) | Nested (`plugins/group/skills/name/`) |
| Complexity | Simple | Full-featured |

---

## Skillport's Approach

Skillport Marketplace uses the **Plugin Marketplace Format** because:

1. **Per-plugin versioning** — Users can check/update individual skill groups
2. **Organized groups** — Skills can be logically grouped (sales, engineering, etc.)
3. **Future extensibility** — Can add commands, agents, hooks later
4. **Enterprise features** — Access control, audit logging work better with structured groups

Both formats work with Claude Code's `/plugin` command, but the Plugin Marketplace format provides the structure needed for organizational skill libraries.

---

## Q&A: Why Plugin Marketplace Format?

**Q: If skill versioning is important, did we choose the right format?**

**A: Yes.** The key difference for versioning:

| Format | Versioning |
|--------|------------|
| Agent Skills | Marketplace level only |
| Plugin Marketplace | **Per-plugin** via `.claude-plugin/plugin.json` |

With the simpler Agent Skills format, you can only version the entire marketplace as a unit. With Plugin Marketplace format:

- Each plugin has its own version in `plugin.json`
- `check-updates` API can tell users which specific skills have updates
- `bump_version` API can increment individual plugins
- Users can update selectively

The trade-off is more structure (the extra `plugin.json` files), but that's minimal overhead for the versioning capability.

---

## References

- [Agent Skills Specification](https://agentskills.io/specification)
- [Plugin Marketplaces Documentation](https://code.claude.com/docs/en/plugin-marketplaces)
- [anthropics/skills](https://github.com/anthropics/skills) — Agent Skills format example
- [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official) — Plugin Marketplace format example
