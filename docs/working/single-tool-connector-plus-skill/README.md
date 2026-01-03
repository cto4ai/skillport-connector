# Single-Tool Connector + Skill Architecture

## Problem Statement

The current Skillport Connector exposes 10 MCP tools, which creates two problems:

1. **Context overhead**: ~3,000-5,000 tokens loaded on every message, whether or not the user needs Skillport
2. **Claude bypasses Skills**: MCP tools are immediately callable, so Claude reaches for them directly instead of using installed Skills with their progressive disclosure pattern

## Proposed Solution

Reduce the MCP Connector to a **single authentication tool**, and move all operational guidance into a **Skillport Skill** that Claude must read and follow.

```
┌─────────────────────────────────────────────────────────┐
│                      Claude                              │
│                                                          │
│  1. User asks to install a skill                        │
│  2. Claude sees "skillport" in available_skills         │
│  3. Claude reads /mnt/skills/user/skillport/SKILL.md    │
│  4. Skill says: "First call skillport_auth MCP tool"    │
│  5. Claude calls skillport_auth → gets token            │
│  6. Claude follows Skill instructions using token       │
│                                                          │
│   ┌─────────┐        ┌──────────┐                       │
│   │  bash   │   or   │  python  │                       │
│   │  curl   │        │ requests │                       │
│   └────┬────┘        └────┬─────┘                       │
│        │                  │                             │
└────────┼──────────────────┼─────────────────────────────┘
         │                  │
         │   HTTP + Bearer Token
         ▼                  ▼
┌─────────────────────────────────────────────────────────┐
│              Skillport REST API                          │
│                                                          │
│   GET  /api/skills           - List all skills          │
│   GET  /api/skills/:name     - Get skill details        │
│   POST /api/skills/:name     - Save/update skill        │
│   DELETE /api/skills/:name   - Delete skill             │
│   POST /api/skills/:name/publish - Publish skill        │
│   POST /api/skills/:name/bump    - Bump version         │
│   GET  /install.sh           - Install script           │
│   GET  /edit.sh              - Edit script              │
│   GET  /api/whoami           - User identity            │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

## Benefits

| Benefit | How |
|---------|-----|
| **~90% reduction in context overhead** | 1 tool (~300 tokens) vs 10 tools (~3,000-5,000 tokens) |
| **Claude must use the Skill** | MCP tool only provides auth; Skill provides instructions |
| **Progressive disclosure** | Skill content loads only when triggered |
| **Code Mode patterns** | Skill teaches curl/Python, enabling multi-step orchestration |
| **OAuth stays clean** | MCP still handles authentication via Claude.ai's OAuth flow |
| **Logic stays centralized** | All business logic remains in the Connector's REST API |

## Architecture Components

### 1. MCP Connector (Minimal)

See [connector.md](./connector.md) for implementation details.

The MCP exposes only **one tool**:

```typescript
skillport_auth({}) → { token, base_url, expires_in }
```

Optionally, a `bootstrap` operation for first-time setup.

### 2. REST API (All Logic)

See [rest-api.md](./rest-api.md) for endpoint specifications.

The existing MCP handler logic moves to HTTP endpoints. The code stays nearly identical — only the invocation method changes.

### 3. Skillport Skill (Instructions for Claude)

See [skill.md](./skill.md) for the full SKILL.md content.

The Skill teaches Claude:
- How to get an auth token
- What API endpoints are available
- How to call them (curl for simple ops, Python for complex orchestration)
- Response formats and error handling

## Token Flow

```
User: "Install the soil-analyzer skill"
                ↓
Claude: Sees "skillport" in available_skills, triggers it
                ↓
Claude: Reads /mnt/skills/user/skillport/SKILL.md
                ↓
Claude: Sees it needs auth token, calls skillport_auth MCP tool
                ↓
MCP: Validates OAuth session, generates short-lived token (5 min TTL)
                ↓
MCP: Returns { token: "sk_...", base_url: "https://...", expires_in: 300 }
                ↓
Claude: Follows Skill instructions, executes:
        curl -sf "${base_url}/install.sh" | bash -s -- ${token} soil-analyzer --package
                ↓
Claude: Calls present_files with downloaded skill package
```

## Bootstrap Problem

The user needs the Skillport Skill installed to use Skillport... but Skillport is how you install skills.

### Solutions

**Option A: Manual first-time install**
- User downloads skill zip from GitHub/website
- Uploads via Claude Settings > Skills

**Option B: MCP bootstrap operation**
```typescript
skillport_auth({ bootstrap: true })
→ Returns instructions + curl command to download and install the skill
```

**Option C: Hardcoded bootstrap in MCP**
```typescript
this.server.tool("skillport_auth", ..., {
  operation: z.enum(["auth", "bootstrap"]).default("auth")
})
```

## Migration Path

1. **Add REST API endpoints** alongside existing MCP tools
2. **Create the Skillport Skill** and test it works with new endpoints
3. **Add `skillport_auth` tool** to MCP
4. **Deprecate old tools** (keep them temporarily for backward compatibility)
5. **Remove old tools** once users have migrated

## Files in This Directory

- `README.md` - This overview document
- `connector.md` - MCP Connector implementation details
- `rest-api.md` - REST API endpoint specifications
- `skill.md` - The Skillport Skill content (SKILL.md)

## References

- [Anthropic: Code Execution with MCP](https://www.anthropic.com/engineering/code-execution-with-mcp)
- [Anthropic: Advanced Tool Use (PTC)](https://www.anthropic.com/engineering/advanced-tool-use)
- [Cloudflare: Code Mode](https://blog.cloudflare.com/code-mode/)
- [Anthropic: Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)
