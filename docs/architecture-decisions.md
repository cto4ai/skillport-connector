# Architecture Decisions

This document captures the key architectural decisions made during the design of Skillport.

## Decision 1: Use Claude Code Plugin Marketplace Format

**Context:** We needed a format for organizing and distributing Skills.

**Options Considered:**
1. Create a custom Skillport-specific format
2. Use Claude Code's existing Plugin Marketplace format
3. Create a new format that could become a standard

**Decision:** Use Claude Code's Plugin Marketplace format with extensions.

**Rationale:**
- Claude Code already has a working plugin system with marketplace support
- Using their format means Claude Code works natively (no bridge needed)
- We only need to bridge for Claude.ai/Desktop
- "Extend, don't fork" — Claude Code ignores fields it doesn't recognize
- Future-proof if Anthropic expands the format

**Consequences:**
- Must stay compatible with Claude Code's schema
- Extensions are namespaced (e.g., `_skillport`, `surfaces`)
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

## Decision 3: GitHub OAuth for Authentication

**Context:** Need to authenticate users accessing the connector.

**Options Considered:**
1. No authentication (public access)
2. Simple token/API key
3. GitHub OAuth
4. Google Workspace OAuth
5. Auth0 or other identity provider

**Decision:** GitHub OAuth as default, with architecture supporting alternatives.

**Rationale:**
- Marketplace repos are on GitHub — natural fit
- Can verify org membership for access control
- Users likely have GitHub accounts
- Supports Dynamic Client Registration (DCR) which Claude.ai uses
- Token auth doesn't provide user identity

**Consequences:**
- Users authenticate with GitHub when adding connector
- Connector knows user identity for audit/access control
- Can be swapped for other OAuth providers if needed

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

## Decision 5: Surfaces as Plugin Metadata

**Context:** Some plugins work on all surfaces, others only on Claude Code.

**Options Considered:**
1. Separate marketplaces per surface
2. Metadata field indicating target surfaces
3. Directory structure convention

**Decision:** Add `surfaces` array to plugin entries.

**Rationale:**
- Single marketplace, single source of truth
- Connector can filter by surface when listing plugins
- Claude Code ignores the field (doesn't break anything)
- Explicit is better than implicit

**Example:**
```json
{
  "name": "sales-pitch",
  "surfaces": ["claude-code", "claude-desktop", "claude-ai"]
}
```

**Consequences:**
- Must document the `surfaces` convention
- Connector filters plugins by surface
- Plugins without `surfaces` field assumed to work everywhere

## Decision 6: Skills Live Inside Plugins

**Context:** Where should SKILL.md files live?

**Options Considered:**
1. Separate `/skills` directory at marketplace root
2. Skills embedded in plugin directories
3. Skills as standalone marketplace entries

**Decision:** Skills are a component of plugins, located at `plugins/<name>/skills/SKILL.md`.

**Rationale:**
- Aligns with Claude Code plugin structure
- A plugin can have skills AND commands AND agents
- Single plugin.json manifest covers all components
- `skillPath` extension tells connector where to find SKILL.md

**Consequences:**
- Skills aren't first-class marketplace entries
- Plugin is the unit of installation
- Connector extracts skills from plugins for Claude.ai/Desktop

## Decision 7: Template Repository Pattern

**Context:** How should organizations create their own marketplaces?

**Options Considered:**
1. Fork a reference implementation
2. GitHub Template Repository
3. CLI scaffolding tool
4. Documentation only

**Decision:** GitHub Template Repository (`skillport-template`).

**Rationale:**
- GitHub's "Use this template" is one-click
- No tooling required
- Easy to keep template updated
- Organizations own their instance completely

**Consequences:**
- Must maintain template repo
- Updates don't automatically propagate to instances
- Documentation must be comprehensive

## Decision 8: Connector Configured Per-Marketplace

**Context:** Should one connector serve multiple marketplaces?

**Options Considered:**
1. One connector per marketplace (simple)
2. Multi-tenant connector (complex)
3. Connector discovers marketplace from user's org

**Decision:** One connector deployment per marketplace (initially).

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
- Multi-tenant could be a future enhancement

## Decision 9: Project Name "Skillport"

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
- `skillport-connector` — the MCP bridge
- `skillport-template` — marketplace template
- `<org>-skillport` — org marketplace instances
