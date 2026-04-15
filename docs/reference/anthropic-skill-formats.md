# Anthropic Plugin Marketplace Format

*Last updated: April 2026*
*Sources: [Plugin Marketplaces](https://code.claude.com/docs/en/plugin-marketplaces), [Plugins Reference](https://code.claude.com/docs/en/plugins-reference), [Discover Plugins](https://code.claude.com/docs/en/discover-plugins), [knowledge-work-plugins](https://github.com/anthropics/knowledge-work-plugins)*

---

## Overview

Anthropic's **Plugin Marketplace** format is the standard for distributing Claude Code plugins. A marketplace is a catalog (`marketplace.json`) that lists plugins and where to find them. Plugins can live in the same repo as the marketplace, in separate GitHub repos, in git subdirectories, or on npm.

Key concepts:
- **Marketplace** — a `marketplace.json` catalog listing available plugins
- **Plugin** — a self-contained directory with skills, commands, agents, hooks, MCP servers, and/or LSP servers
- **Plugin manifest** (`plugin.json`) — per-plugin metadata and configuration (optional)

---

## Directory Structure

### Marketplace with co-located plugins (relative-path)

```
marketplace-repo/
├── .claude-plugin/
│   └── marketplace.json          # Marketplace catalog
└── plugins/
    └── plugin-name/
        ├── .claude-plugin/
        │   └── plugin.json       # Plugin manifest (optional)
        ├── skills/
        │   └── skill-name/
        │       ├── SKILL.md
        │       ├── scripts/      # Optional
        │       └── references/   # Optional
        ├── commands/             # Slash commands (.md files)
        ├── agents/               # Subagent definitions (.md files)
        ├── hooks/
        │   └── hooks.json        # Hook configuration
        ├── output-styles/        # Output style definitions
        ├── bin/                   # Executables added to PATH
        ├── scripts/              # Hook and utility scripts
        ├── .mcp.json             # MCP server definitions
        ├── .lsp.json             # LSP server configurations
        ├── settings.json         # Default plugin settings
        └── README.md
```

### Marketplace as pure catalog (external sources)

A marketplace can be just a catalog — no plugins in the repo itself:

```
marketplace-repo/
└── .claude-plugin/
    └── marketplace.json    # Points to GitHub repos, npm packages, etc.
```

---

## marketplace.json

### Required fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Marketplace identifier (kebab-case). Users see this when installing: `plugin-name@marketplace-name` |
| `owner` | object | `{ name: string, email?: string }` |
| `plugins` | array | List of plugin entries |

### Optional metadata

| Field | Type | Description |
|-------|------|-------------|
| `metadata.description` | string | Brief marketplace description |
| `metadata.version` | string | Marketplace-level version |
| `metadata.pluginRoot` | string | Base directory prepended to relative plugin source paths (e.g. `"./plugins"`) |

### Plugin entry fields

Each entry in the `plugins` array:

**Required:**

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Plugin identifier (kebab-case) |
| `source` | string or object | Where to fetch the plugin (see [Plugin Sources](#plugin-sources)) |

**Optional (can override plugin.json):**

| Field | Type | Description |
|-------|------|-------------|
| `description` | string | Plugin description |
| `version` | string | Plugin version (see [Version Resolution](#version-resolution)) |
| `author` | object | `{ name: string, email?: string }` |
| `homepage` | string | Documentation URL |
| `repository` | string | Source code URL |
| `license` | string | SPDX license identifier |
| `keywords` | array | Discovery tags |

**Marketplace-only fields (not in plugin.json):**

| Field | Type | Description |
|-------|------|-------------|
| `category` | string | Plugin category for organization |
| `tags` | array | Tags for searchability |
| `strict` | boolean | Whether plugin.json is the authority for component definitions (default: `true`) |

**Component configuration fields (can supplement or replace plugin.json):**

| Field | Type | Description |
|-------|------|-------------|
| `commands` | string or array | Custom paths to command files/directories |
| `agents` | string or array | Custom paths to agent files |
| `hooks` | string or object | Hooks configuration or path |
| `mcpServers` | string or object | MCP server configurations |
| `lspServers` | string or object | LSP server configurations |

### Example

```json
{
  "name": "company-tools",
  "owner": {
    "name": "DevTools Team",
    "email": "devtools@example.com"
  },
  "plugins": [
    {
      "name": "code-formatter",
      "source": "./plugins/formatter",
      "description": "Automatic code formatting",
      "version": "2.1.0"
    },
    {
      "name": "deployment-tools",
      "source": {
        "source": "github",
        "repo": "company/deploy-plugin"
      },
      "description": "Deployment automation tools"
    },
    {
      "name": "linter",
      "source": {
        "source": "npm",
        "package": "@company/claude-linter",
        "version": "^1.0.0"
      }
    }
  ]
}
```

---

## Plugin Sources

Each plugin entry's `source` field determines where Claude Code fetches the plugin from. A single marketplace can mix source types.

### Relative path

Plugin lives in the marketplace repo:

```json
{ "source": "./plugins/my-plugin" }
```

Paths resolve relative to the marketplace root (the directory containing `.claude-plugin/`). Must start with `./`. Only works when the marketplace is added via git (not URL).

### GitHub repository

```json
{
  "source": {
    "source": "github",
    "repo": "owner/plugin-repo",
    "ref": "v2.0.0",
    "sha": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0"
  }
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `repo` | Yes | `owner/repo` format |
| `ref` | No | Branch or tag (defaults to repo default branch) |
| `sha` | No | Full 40-char commit SHA for exact pinning |

### Git URL

```json
{
  "source": {
    "source": "url",
    "url": "https://gitlab.com/team/plugin.git",
    "ref": "main",
    "sha": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0"
  }
}
```

### Git subdirectory

For plugins in a subdirectory of a git repo (sparse clone):

```json
{
  "source": {
    "source": "git-subdir",
    "url": "https://github.com/acme-corp/monorepo.git",
    "path": "tools/claude-plugin",
    "ref": "v2.0.0"
  }
}
```

### npm package

```json
{
  "source": {
    "source": "npm",
    "package": "@acme/claude-plugin",
    "version": "^2.0.0",
    "registry": "https://npm.example.com"
  }
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `package` | Yes | Package name or scoped package |
| `version` | No | Semver version or range (`^2.0.0`, `~1.5.0`, `2.1.0`) |
| `registry` | No | Custom npm registry URL |

---

## plugin.json (Plugin Manifest)

The `.claude-plugin/plugin.json` file defines a plugin's metadata and configuration. It is optional — if omitted, Claude Code auto-discovers components in default locations and derives the name from the directory name.

### Required fields

Only `name` is required if you include a manifest:

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Plugin identifier (kebab-case). Used for namespacing: `plugin-name:command-name` |

### Metadata fields

| Field | Type | Description |
|-------|------|-------------|
| `version` | string | Semantic version. If also set in marketplace entry, plugin.json takes priority. |
| `description` | string | Brief plugin description |
| `author` | object | `{ name: string, email?: string, url?: string }` |
| `homepage` | string | Documentation URL |
| `repository` | string | Source code URL |
| `license` | string | SPDX license identifier |
| `keywords` | array | Discovery tags |

### Component path fields

Custom paths **replace** the default directory for that component type. To keep the default and add more, include both: `"commands": ["./commands/", "./extras/"]`.

| Field | Type | Default location | Description |
|-------|------|------------------|-------------|
| `commands` | string or array | `commands/` | Slash command files (.md) |
| `agents` | string or array | `agents/` | Subagent definitions (.md) |
| `skills` | string or array | `skills/` | Skill directories (each with SKILL.md) |
| `hooks` | string, array, or object | `hooks/hooks.json` | Hook configuration |
| `mcpServers` | string, array, or object | `.mcp.json` | MCP server definitions |
| `lspServers` | string, array, or object | `.lsp.json` | LSP server configurations |
| `outputStyles` | string or array | `output-styles/` | Output style definitions |
| `userConfig` | object | — | User-configurable values prompted at enable time |
| `channels` | array | — | Channel declarations for message injection |

### Example

```json
{
  "name": "enterprise-tools",
  "version": "2.1.0",
  "description": "Enterprise workflow automation",
  "author": {
    "name": "Enterprise Team",
    "email": "enterprise@example.com"
  },
  "license": "MIT",
  "keywords": ["enterprise", "workflow"],
  "mcpServers": {
    "enterprise-db": {
      "command": "${CLAUDE_PLUGIN_ROOT}/servers/db-server",
      "args": ["--config", "${CLAUDE_PLUGIN_ROOT}/config.json"]
    }
  }
}
```

### Environment variables

| Variable | Description |
|----------|-------------|
| `${CLAUDE_PLUGIN_ROOT}` | Absolute path to plugin's installation directory. Changes on update. |
| `${CLAUDE_PLUGIN_DATA}` | Persistent directory for plugin state that survives updates. Located at `~/.claude/plugins/data/{id}/`. |

---

## Version Resolution

Version can be declared in either `plugin.json` or the marketplace entry in `marketplace.json`:

- **plugin.json always wins silently** if both are set
- **For relative-path plugins** (co-located in marketplace repo): set version in marketplace entry, omit from plugin.json
- **For external sources** (GitHub, npm, git URL): set version in plugin.json

Claude Code uses the version to determine whether to update a plugin. If you change code but don't bump the version, existing users won't see changes due to caching.

### Release channels

Support stable/latest channels by creating two marketplace catalogs pointing to different refs:

```json
{
  "name": "stable-tools",
  "plugins": [{
    "name": "formatter",
    "source": { "source": "github", "repo": "acme/formatter", "ref": "stable" }
  }]
}
```

```json
{
  "name": "latest-tools",
  "plugins": [{
    "name": "formatter",
    "source": { "source": "github", "repo": "acme/formatter", "ref": "latest" }
  }]
}
```

The plugin's `plugin.json` must declare a different version at each ref. Same version = Claude Code skips the update.

---

## Auto-Updates

- **Official Anthropic marketplaces**: auto-update enabled by default
- **Third-party marketplaces**: auto-update disabled by default (can be toggled per marketplace)
- When plugins update, user sees notification to run `/reload-plugins`
- Set `DISABLE_AUTOUPDATER` to disable all auto-updates
- Set `FORCE_AUTOUPDATE_PLUGINS=1` with `DISABLE_AUTOUPDATER` to keep plugin updates while disabling Claude Code updates

### Private repos

Background auto-updates need token-based auth (interactive credential helpers can't prompt at startup):

| Provider | Environment variables |
|----------|----------------------|
| GitHub | `GITHUB_TOKEN` or `GH_TOKEN` |
| GitLab | `GITLAB_TOKEN` or `GL_TOKEN` |
| Bitbucket | `BITBUCKET_TOKEN` |

### Known issues (as of April 2026)

- Third-party marketplace plugins [don't always auto-update](https://github.com/anthropics/claude-code/issues/26744) on session start
- Plugin updates sometimes [don't fetch new versions](https://github.com/anthropics/claude-code/issues/21995) until the marketplace itself is updated
- No built-in way for users to [see available updates with changelogs](https://github.com/anthropics/claude-code/issues/31462)
- No mechanism to [refresh/pull latest](https://github.com/anthropics/claude-code/issues/38271) for already-installed plugins

---

## Strict Mode

The `strict` field in a marketplace plugin entry controls authority over component definitions:

| Value | Behavior |
|-------|----------|
| `true` (default) | plugin.json is the authority. Marketplace entry can supplement with additional components (both merged). |
| `false` | Marketplace entry is the entire definition. If plugin.json also declares components, the plugin fails to load. |

Use `strict: false` when the marketplace operator wants full control over which components are exposed, overriding the plugin author's layout.

---

## Plugin Caching

Plugins installed from marketplaces are copied to `~/.claude/plugins/cache/`. Each version gets its own directory. Old versions are marked as orphaned and removed after 7 days.

Implications:
- Plugins cannot reference files outside their directory (`../` paths won't work after install)
- Use symlinks to include external files (symlinks are followed during copy)
- `${CLAUDE_PLUGIN_ROOT}` changes on each update; use `${CLAUDE_PLUGIN_DATA}` for persistent state

---

## Installation Scopes

| Scope | Settings file | Use case |
|-------|---------------|----------|
| `user` | `~/.claude/settings.json` | Personal plugins across all projects (default) |
| `project` | `.claude/settings.json` | Team plugins shared via version control |
| `local` | `.claude/settings.local.json` | Project-specific, gitignored |
| `managed` | Managed settings (read-only) | Admin-controlled |

---

## SKILL.md Format

Skills are the most common plugin component. Each skill is a directory with a `SKILL.md` file.

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
- `user-invocable` — if `false`, skill auto-activates as background context when relevant (Claude decides when to load it). If `true` or omitted, skill appears as a `/plugin:skill` slash command.
- `disable-model-invocation` — if `true`, skill can only be invoked by user (not auto-triggered by Claude)
- `license`
- `compatibility`
- `metadata`
- `allowed-tools`

Skills can include supporting files alongside SKILL.md: `scripts/`, `references/`, `assets/`.

Non-skill assets (e.g. HTML dashboards, templates) can be bundled alongside skill directories and referenced at runtime via `${CLAUDE_PLUGIN_ROOT}`. For example, a skill can copy a bundled `dashboard.html` to the working directory on first use.

---

## Team Distribution

### extraKnownMarketplaces

Auto-prompt team members to install a marketplace when they trust the project folder:

```json
// .claude/settings.json
{
  "extraKnownMarketplaces": {
    "company-tools": {
      "source": {
        "source": "github",
        "repo": "your-org/claude-plugins"
      }
    }
  },
  "enabledPlugins": {
    "code-formatter@company-tools": true
  }
}
```

### strictKnownMarketplaces (managed settings)

Restrict which marketplaces users can add:

| Value | Behavior |
|-------|----------|
| Undefined | No restrictions |
| `[]` | Complete lockdown — no new marketplaces |
| List of sources | Only matching marketplaces allowed |

Supports exact matching on source fields, plus `hostPattern` and `pathPattern` for regex matching.

### Pre-populated containers

Set `CLAUDE_CODE_PLUGIN_SEED_DIR` to a pre-built plugins directory for offline/container environments. Seed directories are read-only and cannot be updated at runtime.

---

## CLI Commands

| Command | Description |
|---------|-------------|
| `claude plugin marketplace add <source>` | Add marketplace (GitHub, git URL, local path, remote URL) |
| `claude plugin marketplace list` | List configured marketplaces |
| `claude plugin marketplace update [name]` | Refresh marketplace data |
| `claude plugin marketplace remove <name>` | Remove marketplace (also uninstalls its plugins) |
| `claude plugin install <plugin>` | Install plugin (`name@marketplace`) |
| `claude plugin uninstall <plugin>` | Remove plugin (`--keep-data` to preserve state) |
| `claude plugin enable <plugin>` | Enable a disabled plugin |
| `claude plugin disable <plugin>` | Disable without uninstalling |
| `claude plugin update <plugin>` | Update to latest version |
| `claude plugin validate .` | Validate plugin.json, frontmatter, hooks.json |

All commands support `--scope user|project|local`.

---

## Official Anthropic Marketplaces

Anthropic maintains multiple marketplaces, each targeting a different audience:

| Marketplace | Repo | Purpose | Auto-update |
|-------------|------|---------|-------------|
| `claude-plugins-official` | [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official) | Curated plugins for Claude Code (LSP, integrations, dev workflows) | Yes |
| `knowledge-work-plugins` | [anthropics/knowledge-work-plugins](https://github.com/anthropics/knowledge-work-plugins) | Role-specialized plugins for Cowork (also work in Claude Code) | Yes |
| `claude-plugins-community` | [anthropics/claude-plugins-community](https://github.com/anthropics/claude-plugins-community) | Community-contributed plugins (read-only mirror, submit via form) | Yes |
| `financial-services-plugins` | [anthropics/financial-services-plugins](https://github.com/anthropics/financial-services-plugins) | Industry-specific plugins for investment banking, equity research, etc. | Yes |

The `claude-plugins-official` marketplace is automatically available in Claude Code. Others must be added manually via `/plugin marketplace add`.

### Mixed source types in practice

Anthropic's own marketplaces mix source types in a single `marketplace.json`. For example, `knowledge-work-plugins` uses:

- **Relative paths** for Anthropic-built plugins: `"source": "./productivity"`
- **Git URLs with SHA pinning** for third-party plugins:
  ```json
  {
    "name": "planetscale",
    "source": {
      "source": "url",
      "url": "https://github.com/planetscale/claude-plugin.git",
      "sha": "f1066cac5bb956bbbb05918f5b07fe0e873d44ea"
    },
    "category": "database",
    "homepage": "https://planetscale.com/"
  }
  ```
- **Git subdirectories** for plugins nested in monorepos:
  ```json
  {
    "source": {
      "source": "git-subdir",
      "url": "organization/repo-name",
      "path": "plugins/plugin-name",
      "ref": "main",
      "sha": "commit_hash"
    }
  }
  ```

This demonstrates the catalog model: the marketplace repo doesn't need to contain the plugins — it can point to any combination of local paths and external repos.

---

## Knowledge Work Plugins: Patterns Worth Noting

The [knowledge-work-plugins](https://github.com/anthropics/knowledge-work-plugins) repo (47 plugins, 11 Anthropic-built) introduces several patterns relevant to marketplace design.

### Role-specialized plugins

Each plugin targets a specific job function and bundles skills, commands, and MCP connectors together:

| Plugin | Skills | Connectors |
|--------|--------|------------|
| `productivity` | task-management, memory-management, start, update | Slack, Notion, Asana, Linear, Jira, Microsoft 365 |
| `sales` | methodology, research, pipeline | HubSpot, Close, Clay, ZoomInfo, Fireflies |
| `data` | SQL, statistics, dashboards | Snowflake, Databricks, BigQuery, Hex |
| `legal` | contract review, compliance, risk | Box, Egnyte, Jira, Microsoft 365 |

### Auto-activating background skills

Skills with `user-invocable: false` load automatically when Claude determines they're relevant — no slash command needed. The productivity plugin uses this for `memory-management` and `task-management`: they're always-on context that shapes how Claude handles tasks and decodes workplace shorthand.

### File-based memory and task management

The productivity plugin's memory and task systems are **not harness features** — they're pure skill instructions that teach Claude file conventions:

**Memory** — two-tier lookup:
1. CLAUDE.md (hot cache, ~100 lines: top 30 people, 30 terms, active projects)
2. `memory/` directory (deep storage: `glossary.md`, `people/*.md`, `projects/*.md`, `context/`)

Claude checks CLAUDE.md first, falls back to memory/ files, and asks the user only if both miss. This enables shorthand decoding ("ask todd to do the PSR for oracle" → full expansion) with zero clarifying questions.

**Tasks** — TASKS.md with sections (Active, Waiting On, Someday, Done) that Claude reads/writes via standard file I/O.

**Dashboard** — a static `dashboard.html` bundled at `${CLAUDE_PLUGIN_ROOT}/skills/dashboard.html`, copied to the working directory on first run. Reads TASKS.md client-side with filesystem watch for bi-directional sync. No server component.

All of this is emergent from skill instructions + Claude's existing Read/Write tools. The plugin.json is minimal (name, version, description, author) with no special fields.

### Cowork compatibility

These plugins are designed for Cowork (Anthropic's agentic desktop app) but also work in Claude Code. There are [active bugs](https://github.com/anthropics/claude-code/issues/39400) with marketplace plugins in Cowork as of April 2026 — plugins not loading, being removed on sync, or lost after restart.

---

## Skillport's Approach

Skillport uses the Plugin Marketplace format with **relative-path sources** — all plugins co-located in the marketplace repo under `plugins/`. This provides:

1. **Per-plugin versioning** — each plugin has its own version in plugin.json
2. **Full plugin components** — skills, commands, agents, hooks
3. **Cross-surface distribution** — Skillport's REST API proxies GitHub, making plugins available on Claude.ai and Desktop where native marketplace access doesn't exist
4. **Synthesized skill-level manifests** — when downloading individual skills, Skillport generates a skill-level plugin.json from the plugin-level version, enabling version tracking on surfaces that lack native update detection

---

## Surface Support

| Capability | Claude Code | Claude.ai | Claude Desktop |
|-----------|-------------|-----------|----------------|
| Native marketplace (`/plugin`) | Yes | No | No |
| Auto-update installed plugins | Yes (official: on, third-party: off) | No | No |
| Version tracking | Yes (via plugin cache) | No native mechanism | No native mechanism |
| Install from private repo | Via credential helpers + tokens | No | No |

This is the primary gap that Skillport fills: Claude.ai and Desktop have no native mechanism for marketplace browsing, installation, or version tracking from private repositories.

---

## References

- [Plugin Marketplaces](https://code.claude.com/docs/en/plugin-marketplaces) — creating and distributing marketplaces
- [Plugins Reference](https://code.claude.com/docs/en/plugins-reference) — full schema and CLI commands
- [Discover and Install Plugins](https://code.claude.com/docs/en/discover-plugins) — user-facing guide
- [Create Plugins](https://code.claude.com/docs/en/plugins) — building plugins
- [Agent Skills Specification](https://agentskills.io/specification) — simpler skill-only format
- [claude-plugins-official](https://github.com/anthropics/claude-plugins-official) — official Claude Code marketplace
- [knowledge-work-plugins](https://github.com/anthropics/knowledge-work-plugins) — Cowork role-specialized plugins (47 plugins)
- [claude-plugins-community](https://github.com/anthropics/claude-plugins-community) — community plugin marketplace (read-only mirror)
- [financial-services-plugins](https://github.com/anthropics/financial-services-plugins) — financial services industry plugins
- [claude.com/plugins](https://claude.com/plugins) — browse and submit plugins via web
