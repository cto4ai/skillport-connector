# Checkpoint: Skill Creator/Editor Architecture Discussion

**Date:** 2025-12-27
**Status:** IN PROGRESS - Awaiting Decision
**Branch:** main

## Context

Currently Skillport Connector serves **skill users** (read-only) via Remote MCP with Google OAuth. We explored supporting **skill creators/editors** with write access.

## Key Questions Explored

1. How to identify editors vs readers?
2. How to support multiple marketplace repos?
3. What OAuth provider(s) to support?

---

## Research Findings

### Claude Team Connector Permissions
- Admins add connectors at org level
- Individual users choose which to enable via OAuth
- **No granular per-user connector restrictions** in Claude Team
- Permissions come from the OAuth flow to the underlying service

### GitHub API Capabilities
- Can check repo permissions: `GET /repos/{owner}/{repo}/collaborators/{username}/permission`
- Returns: `admin`, `write`, `read`, or `none`
- **Requires GitHub username, NOT email**
- Email → username lookup only works for **public emails** (~50% reliable)

### Claude Code Plugin Marketplace
- Users add marketplaces via `/plugin marketplace add owner/repo`
- Access based on user's Git credentials reaching the repo
- Enterprise can enforce `strictKnownMarketplaces` allowlists

---

## Two Architectural Approaches Identified

### Option A: GitHub OAuth + Multi-Repo

**Insight:** GitHub repo access = role/permission model

```
Finance Team repo    →  Only finance team GitHub collaborators see these skills
Engineering repo     →  Only engineering team members
Company-wide repo    →  Everyone in the org
Editors              →  Those with write access to a repo
```

**Benefits:**
- Editor detection built-in (write permission on repo)
- Multi-marketplace for free (user sees all accessible repos)
- No separate role management - GitHub is source of truth
- Natural team isolation via private repos

**Trade-offs:**
- Requires GitHub accounts for all users
- Loses Google domain gating (can check GitHub org membership instead)
- GitHub Enterprise SSO costs $$$ (but basic GitHub OAuth is free)

**Architecture:**
```
User authenticates via GitHub OAuth
         ↓
Connector gets user's GitHub token
         ↓
list_repos: Find all repos user can access with .claude-plugin/marketplace.json
         ↓
For each repo, check permission level:
  - read  → can browse/fetch skills
  - write → can edit skills, update manifests
  - admin → can manage marketplace config
```

### Option B: IdP OAuth + Single Repo + ACLs

**Insight:** Use corporate directory attributes for access control

```
┌─────────────────────────────────────────────────────────────┐
│                   Single Marketplace Repo                    │
├─────────────────────────────────────────────────────────────┤
│  plugins/                                                    │
│    company-wide/          ← No access control, everyone      │
│    finance-tools/         ← access: ["finance-team"]         │
│    engineering/           ← access: ["engineering"]          │
│    admin-only/            ← access: ["admins"], edit: true   │
└─────────────────────────────────────────────────────────────┘
```

**How it works:**
1. IdP OAuth (Google/Entra/Okta) provides user identity + directory attributes
2. Skill metadata defines access requirements:
   ```json
   {
     "name": "finance-tools",
     "access": {
       "read": ["group:finance", "group:executives"],
       "write": ["group:finance-admins"]
     }
   }
   ```
3. Connector evaluates user's directory attributes against skill access rules

**Benefits:**
- Single repo = simpler mental model, less cognitive load
- Uses existing corporate directory (no GitHub accounts needed)
- Fine-grained: per-skill access, not per-repo
- Works with customer's existing IdP (Entra, Okta, etc.)

**Trade-offs:**
- Need pluggable OAuth providers (more code complexity)
- Access rules maintained in repo (chicken-egg for first editor)
- Service token still needed for GitHub API (users don't have GitHub access)
- Lose GitHub's natural permission inheritance

---

## Role Identification Options Considered

| Approach | Mechanism | Pros | Cons |
|----------|-----------|------|------|
| **Email allowlist in KV** | Store `email → role` in Cloudflare KV | Simple, explicit control | Manual maintenance |
| **Email-to-GitHub mapping** | Store `email → github_username`, then check repo perms | Uses real GitHub perms | Two-step lookup, still need mapping |
| **Marketplace config** | List editors in `marketplace.json` itself | Self-documenting, version controlled | Chicken-egg: need write access to add yourself |
| **Separate Connectors** | Two workers: reader + editor | Clear security boundary | Users need two connections |
| **Domain-only** | All `craftycto.com` = editor | Zero maintenance | Too coarse, no fine-grained control |
| **GitHub OAuth** | User's token determines access | 100% reliable, multi-repo | Requires GitHub accounts |

---

## Multi-Marketplace Options

Currently: `MARKETPLACE_REPO` is a single env var.

Options discussed:
1. **URL parameter**: `/sse?repo=org/repo-name` - user selects at connection time
2. **Per-user config in KV**: User's connected repos stored in KV
3. **Tool parameter**: Each tool call specifies `repo` param
4. **Multiple connector deployments**: One worker per marketplace
5. **GitHub OAuth discovery**: User sees all repos they can access (Option A)

---

## User Requirements Captured

- Direct commits (not PRs) for editor operations
- No GitHub OAuth initially preferred, but reconsidered
- Want to understand Claude Team connector permissioning
- Interest in multi-marketplace repo support
- Target customers include MS Entra and Okta users
- Strong cognitive load benefit from single repo approach

---

## Proposed MCP Tools (if GitHub OAuth approach)

**Discovery:**
- `list_repos` - List all accessible marketplace repos with permission level
- `list_plugins` - List plugins in a specific repo (requires repo param)
- `get_plugin` - Get plugin details
- `fetch_skill` - Download skill files

**Editor tools (requires write permission on repo):**
- `update_skill` - Edit SKILL.md content
- `update_manifest` - Modify plugin.json
- `bump_version` - Increment version
- `create_plugin` - Scaffold new plugin

---

## Implementation Phases (if GitHub OAuth approach)

### Phase 1: GitHub OAuth Migration
- Replace Google OAuth with GitHub OAuth in `src/index.ts`
- Update `src/google-handler.ts` → `src/github-handler.ts`
- Store GitHub access token in session props
- Update user identity to use GitHub username/email

### Phase 2: Multi-Repo Discovery
- New tool: `list_repos` - discover accessible marketplace repos
- Add `repo` parameter to existing tools
- Use user's GitHub token (not service token) for API calls
- Cache repo list per user session

### Phase 3: Permission-Based Tool Access
- Check user's permission level on each repo
- Conditionally expose editor tools based on write access
- Direct commits using user's token (not service PAT)

### Phase 4: Editor Tools
- Implement `update_skill`, `update_manifest`, `bump_version`
- Implement `create_plugin` scaffolding
- Git operations via GitHub API (not local git)

---

## Key Files (if implementing)

| File | Changes |
|------|---------|
| `src/index.ts` | GitHub OAuth flow instead of Google |
| `src/google-handler.ts` | Replace with `src/github-handler.ts` |
| `src/mcp-server.ts` | Add repo param, permission checks, new tools |
| `src/github-client.ts` | Use user token, add write operations |
| `wrangler.toml` | GitHub OAuth secrets |

---

## Open Questions

1. **GitHub OAuth vs IdP OAuth + ACLs?** Trade-off between simplicity (GitHub) and flexibility (IdP)
2. **Single repo vs multi-repo?** Cognitive load vs natural permission inheritance
3. **Phased approach?** Start with GitHub OAuth, add IdP support later?
4. **Keep Google OAuth as fallback?** Or fully replace?
5. **Repo discovery scope?** All user repos, or limit to specific orgs?

---

## Decision Status

**PENDING** - User needs more time to think through the architectural choice between:
- Option A: GitHub OAuth + multi-repo (simpler, requires GitHub accounts)
- Option B: IdP OAuth + single repo + ACLs (more flexible, more complex)
- Option C: Phased approach starting with GitHub OAuth

---

## Sources

- [Claude Team Connector Docs](https://support.claude.com/en/articles/11175166-getting-started-with-custom-connectors-using-remote-mcp)
- [GitHub Collaborators API](https://docs.github.com/en/rest/collaborators/collaborators)
- [GitHub Search Users API](https://docs.github.com/en/github/searching-for-information-on-github/searching-on-github/searching-users)
- [Claude Code Plugin Marketplaces](https://code.claude.com/docs/en/plugin-marketplaces)

---

**Last Updated:** 2025-12-27
