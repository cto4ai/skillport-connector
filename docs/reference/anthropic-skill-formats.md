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

The per-plugin manifest defines the plugin's identity and configuration.

**Required fields:**
| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Plugin identifier (kebab-case) |
| `description` | string | Brief plugin description |
| `version` | string | Semantic version (e.g., "1.0.0") |

**Optional metadata fields:**
| Field | Type | Description |
|-------|------|-------------|
| `author` | object | `{name: string, email?: string}` |
| `homepage` | string | Documentation URL |
| `repository` | string | Source code repository URL |
| `license` | string | SPDX license identifier (e.g., MIT) |
| `keywords` | array | Tags for discovery |

**Component configuration fields:**
| Field | Type | Description |
|-------|------|-------------|
| `commands` | string\|array | Paths to command files/directories |
| `agents` | string\|array | Paths to agent files |
| `hooks` | string\|object | Hooks configuration or path |
| `mcpServers` | string\|object | MCP server configurations |
| `lspServers` | string\|object | LSP server configurations |

**Example:**
```json
{
  "name": "plugin-name",
  "version": "1.0.0",
  "description": "What this plugin does",
  "author": {
    "name": "Author Name",
    "email": "author@example.com"
  },
  "homepage": "https://docs.example.com/plugin",
  "repository": "https://github.com/org/plugin",
  "license": "MIT",
  "keywords": ["workflow", "automation"]
}
```

### Component Configuration

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

The marketplace manifest defines the registry and its plugins.

**Root fields:**
| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Marketplace identifier (kebab-case) |
| `owner` | object | `{name: string, email?: string}` |
| `plugins` | array | List of plugin entries |
| `metadata` | object | Optional: description, version, pluginRoot |

```json
{
  "name": "my-marketplace",
  "owner": {
    "name": "Organization",
    "email": "contact@example.com"
  },
  "plugins": [...]
}
```

### Plugin Entry Fields

Each entry in the `plugins` array supports:

**Required fields:**
| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Plugin identifier (kebab-case) |
| `source` | string\|object | Path or remote source config |

**Metadata fields** (can override plugin.json):
| Field | Type | Description |
|-------|------|-------------|
| `description` | string | Plugin description |
| `version` | string | Semantic version |
| `author` | object | Author info |
| `homepage` | string | Documentation URL |
| `repository` | string | Source code URL |
| `license` | string | SPDX license identifier |
| `keywords` | array | Discovery tags |

**Marketplace-only fields** (NOT in plugin.json):
| Field | Type | Description |
|-------|------|-------------|
| `category` | string | Plugin category for organization |
| `tags` | array | Tags for searchability |
| `strict` | boolean | Whether plugin.json is required (default: true) |

**Category values** used in the official repo:
- `development`, `productivity`, `testing`, `security`, `learning`, `database`, `deployment`, `design`, `monitoring`

**Example:**
```json
{
  "name": "my-plugin",
  "source": "./plugins/my-plugin",
  "category": "productivity",
  "tags": ["community-managed"],
  "keywords": ["workflow", "automation"]
}
```

*Source: [Plugin Marketplaces Documentation](https://code.claude.com/docs/en/plugin-marketplaces), [claude-plugins-official](https://github.com/anthropics/claude-plugins-official)*

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

## Surface Detection

Skills may need to detect which Claude surface they're running on (Claude Code, Claude Desktop, Claude.ai) to adapt behavior. This section documents what's officially available and possible workarounds.

### Official Spec Support

**`compatibility` field** (Agent Skills Spec):
- Free-form text, max 500 characters
- For human documentation only, not machine-readable
- Example: `compatibility: Designed for Claude Code (or similar products)`
- Most skills don't need it

**No structured surface detection** exists in the official spec.

### MCP Protocol Detection

The MCP protocol includes `clientInfo.name` in the initialize handshake:

| Client | `clientInfo.name` | Notes |
|--------|------------------|-------|
| Claude Desktop | `"claude-ai"` | Same as Claude.ai |
| Claude.ai | `"claude-ai"` | Same as Desktop |
| Claude Code | TBD | Needs verification |

**Limitation:** Claude Desktop and Claude.ai report the same `clientInfo.name`, making them indistinguishable via MCP protocol alone.

*Source: [apify/mcp-client-capabilities](https://github.com/apify/mcp-client-capabilities)*

### Tool Availability Detection

The most reliable detection method is checking available tools at runtime:

| Surface | Bash Tool | Local MCPs | Remote MCPs (Connectors) |
|---------|-----------|------------|--------------------------|
| Claude Code (CC) | Yes | Yes | Yes |
| Claude Desktop (CD) | No | Yes (optional) | Yes |
| Claude.ai (CAI) | No | No | Yes |

**Detection logic:**
```
IF Bash tool available:
  → Claude Code
ELSE IF any *-local MCP tools available:
  → Claude Desktop (with local MCP)
ELSE:
  → Claude.ai or Desktop without local MCPs
```

### How Existing Skills Handle Detection

**Obsidian skill** — MCP namespace detection:
```
obsidian-local:* tools → CD or CC (local MCP installed)
obsidian-remote:* only → CAI (connector)
```

**Skillport skill** — Bash detection:
```
Bash available → CC (direct install to ~/.claude/skills/)
No Bash → CDAI (create .skill package for upload)
```

### Open Questions

- [ ] What `clientInfo.name` does Claude Code report?
- [ ] Can MCP servers access `clientInfo` after initialization?
- [ ] Are there other MCP session properties useful for detection?
- [ ] Will Anthropic add official surface detection in the future?

---

## References

- [Agent Skills Specification](https://agentskills.io/specification)
- [Plugin Marketplaces Documentation](https://code.claude.com/docs/en/plugin-marketplaces)
- [anthropics/skills](https://github.com/anthropics/skills) — Agent Skills format example
- [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official) — Plugin Marketplace format example
- [apify/mcp-client-capabilities](https://github.com/apify/mcp-client-capabilities) — MCP client identification database
