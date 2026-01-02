# Architecture Decisions

This document captures the key architectural decisions made during the design of Skillport.

## Decision 1: Use Claude Code Plugin Marketplace Format

**Context:** We needed a format for organizing and distributing Skills.

**Options Considered:**
1. Create a custom Skillport-specific format
2. Use Claude Code's existing Plugin Marketplace format
3. Create a new format that could become a standard

**Decision:** Use Claude Code's Plugin Marketplace format.

**Rationale:**
- Claude Code already has a working plugin system with marketplace support
- Using their format means Claude Code works natively (no bridge needed)
- We only need to bridge for Claude.ai/Desktop
- Future-proof if Anthropic expands the format

**Consequences:**
- Must stay compatible with Claude Code's schema
- One marketplace serves all surfaces

## Decision 2: MCP Connector as Bridge

**Context:** Claude.ai and Claude Desktop can't consume Plugin Marketplaces directly.

**Options Considered:**
1. Web scraping / file hosting
2. Custom API server
3. MCP Connector (Remote MCP Server)

**Decision:** Build an MCP Connector deployed on Cloudflare Workers.

**Rationale:**
- MCP is Anthropic's official protocol for tool integration
- Claude.ai already supports custom MCP connectors
- Cloudflare Workers provides free hosting with OAuth support
- Tools Connectors provide callable tools, not just content attachment

**Consequences:**
- Users must add connector in Claude.ai settings
- Requires OAuth setup for authentication
- Connector must be deployed and maintained

## Decision 3: Google OAuth for Authentication

**Context:** Need to authenticate users accessing the connector.

**Options Considered:**
1. No authentication (public access)
2. Simple token/API key
3. GitHub OAuth
4. Google OAuth
5. Auth0 or other identity provider

**Decision:** Google OAuth.

**Rationale:**
- Provides stable user IDs (`google:{uid}`) for access control
- Works well with organizational Google accounts
- Most users already have Google accounts
- Supports Dynamic Client Registration (DCR) which Claude.ai uses

**Consequences:**
- Users authenticate with Google when adding connector
- Connector knows user identity for audit/access control
- User IDs are stable across sessions (unlike emails which can change)

## Decision 4: Cloudflare Workers for Hosting

**Context:** Need to host the MCP Connector somewhere.

**Options Considered:**
1. AWS Lambda + API Gateway
2. Vercel/Railway/Render
3. Self-hosted server
4. Cloudflare Workers

**Decision:** Cloudflare Workers.

**Rationale:**
- Generous free tier (100K requests/day)
- Built-in KV storage for OAuth tokens
- Official Cloudflare MCP templates with OAuth support
- Global edge deployment
- Simple deployment (`wrangler deploy`)

**Consequences:**
- Must use Cloudflare's tooling (Wrangler)
- Some Cloudflare-specific patterns in code
- Free tier sufficient for org use

## Decision 5: Skill-Centric User Experience

**Context:** Users need to discover and install capabilities.

**Options Considered:**
1. Plugin-centric (users install plugins, get all skills inside)
2. Skill-centric (users browse/install individual skills)
3. Both equally

**Decision:** Skill-centric as primary model.

**Rationale:**
- Skills are the actual capability users want
- Plugins (skill groups) are an implementation detail
- Easier to discover specific skills than dig through plugins
- Aligns with how Claude.ai Skills work natively

**Consequences:**
- Primary tools are `list_skills` and `fetch_skill`
- Plugin tools (`list_plugins`, `get_plugin`) kept for admin/legacy use
- Skills inherit version from parent plugin (skill group)

## Decision 6: Skills in Named Subdirectories

**Context:** Where should SKILL.md files live within a plugin?

**Options Considered:**
1. Single skill per plugin: `plugins/<name>/skills/SKILL.md`
2. Multiple skills per plugin: `plugins/<group>/skills/<skill>/SKILL.md`
3. Flat structure: `skills/<name>/SKILL.md` at marketplace root

**Decision:** Multiple skills per plugin at `plugins/<group>/skills/<skill>/SKILL.md`.

**Rationale:**
- Allows grouping related skills together
- Each skill has its own directory for resources (templates, scripts)
- Aligns with official Claude Code plugin structure
- Skill groups share versioning (bump once, all skills update)

**Consequences:**
- Connector discovers skills via `plugins/*/skills/*/SKILL.md` pattern
- Skill name comes from directory name, not filename
- Each skill can have additional files alongside SKILL.md

## Decision 7: Role-Based Access Control

**Context:** Need to control who can read vs write skills.

**Options Considered:**
1. Public read, authenticated write
2. GitHub org membership
3. Custom access control file
4. No access control

**Decision:** Custom access control via `.skillport/access.json`.

**Rationale:**
- Flexible per-skill permissions
- Supports two clear roles: users (read) and editors (write)
- Uses stable OAuth user IDs, not emails
- Can restrict specific skills to specific users

**Consequences:**
- Marketplace maintainers manage `.skillport/access.json`
- Users need to use `whoami` tool to get their ID
- Default: everyone reads, only editors write

## Decision 8: Connector Configured Per-Marketplace

**Context:** Should one connector serve multiple marketplaces?

**Options Considered:**
1. One connector per marketplace (simple)
2. Multi-tenant connector (complex)
3. Connector discovers marketplace from user's org

**Decision:** One connector deployment per marketplace.

**Rationale:**
- Simpler to implement and understand
- Clear ownership and access control
- Can evolve to multi-tenant later if needed

**Configuration:**
```toml
[vars]
MARKETPLACE_REPO = "your-org/your-marketplace"
```

**Consequences:**
- Each org deploys their own connector
- Connector URL is org-specific

## Decision 9: Unified Save Tool

**Context:** Editor workflow for creating and updating skills.

**Options Considered:**
1. Separate `create_skill` and `update_skill` tools
2. Unified `save_skill` that handles both
3. Direct file manipulation tools

**Decision:** Unified `save_skill` tool.

**Rationale:**
- Simpler mental model (one tool for all edits)
- Tool auto-detects if skill exists or needs creation
- Handles skill group creation automatically for new skills
- Paths are relative to skill directory (user doesn't manage full paths)

**Consequences:**
- Creating a new skill auto-creates skill group if needed
- Only editors can create new skills
- Write access checked against skill group

## Decision 10: Project Name "Skillport"

**Context:** Needed a name for the overall solution.

**Options Considered:**
- `claude-plugin-bridge`
- `plugin-anywhere`
- `skillhub`
- `skillport`

**Decision:** `skillport`

**Rationale:**
- Short and memorable
- Implies "portal" (access) and "transport" (moving between surfaces)
- Works as noun: "our skillport"
- Not Claude-specific (future-proof)

**Repo naming:**
- `skillport-connector` - the MCP bridge
- `skillport-marketplace` - marketplace template
