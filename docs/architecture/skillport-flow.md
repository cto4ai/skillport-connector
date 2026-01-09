# Skillport Architecture Flow

How the MCP connector, skill, and REST API work together.

## Components

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Skillport System                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐     ┌──────────────────┐     ┌─────────────────┐ │
│  │   MCP Layer  │     │   Skill Layer    │     │   REST API      │ │
│  │  (1 tool)    │     │  (instructions)  │     │  (all logic)    │ │
│  │              │     │                  │     │                 │ │
│  │ skillport_   │     │ SKILL.md         │     │ /api/skills     │ │
│  │ auth         │────▶│ + references/    │────▶│ /api/whoami     │ │
│  │              │     │                  │     │ /api/check-...  │ │
│  │ Returns:     │     │ Teaches Claude   │     │                 │ │
│  │ - token      │     │ how to use API   │     │ All CRUD ops    │ │
│  │ - base_url   │     │ via curl         │     │ live here       │ │
│  └──────────────┘     └──────────────────┘     └─────────────────┘ │
│         │                      │                        │          │
│         └──────────────────────┼────────────────────────┘          │
│                                │                                    │
│                    ┌───────────▼───────────┐                       │
│                    │   Code Execution      │                       │
│                    │   (bash/curl)         │                       │
│                    │                       │                       │
│                    │ - Makes API calls     │                       │
│                    │ - Processes results   │                       │
│                    │ - Only output hits    │                       │
│                    │   context             │                       │
│                    └───────────────────────┘                       │
└─────────────────────────────────────────────────────────────────────┘
```

## Why This Architecture

### The Problem with Rich MCP

Traditional MCP approach with many tools:
```
Claude → MCP (list_skills) → [large response into context]
Claude → MCP (fetch_skill) → [large response into context]
Claude → MCP (save_skill) → [response into context]
```

Every tool result consumes context tokens. With 17 skills, listing them all dumps ~4KB into context.

### The Solution: Minimal MCP + Code Execution

```
Claude → MCP (skillport_auth) → token (~50 tokens)
Claude → Code Execution:
    skills = curl ... /api/skills
    matching = [filter for what user wants]
    print(f"Found {len(matching)} matching skills")
    # Only this output hits context
```

API responses processed in code, never hit context.

## The Flow (Example: Install a Skill)

```
User: "Install the proofread skill"
                │
                ▼
┌─────────────────────────────────────┐
│ 1. Skill instructions loaded        │
│    (~100 lines from SKILL.md)       │
└─────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────┐
│ 2. Claude calls skillport_auth MCP  │
│    → { token, base_url, 15min TTL } │
└─────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────┐
│ 3. Code Execution: curl to API      │
│    GET /api/skills/proofread/install│
│    → { install_token, command }     │
└─────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────┐
│ 4. Execute install command          │
│    curl ... | bash -s -- {token}    │
│    → Downloads .skill package       │
└─────────────────────────────────────┘
                │
        ┌───────┴───────┐
        ▼               ▼
┌──────────────┐ ┌──────────────┐
│ Claude Code  │ │ Claude.ai/   │
│              │ │ Desktop      │
│ unzip to     │ │              │
│ ~/.claude/   │ │ present_     │
│ skills/      │ │ files()      │
└──────────────┘ └──────────────┘
                │
                ▼
┌─────────────────────────────────────┐
│ 5. User starts new conversation     │
│    → Skill now available            │
└─────────────────────────────────────┘
```

## REST API Endpoints

### Browse

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/skills` | List all skills |
| GET | `/api/skills?refresh=true` | Force cache refresh |
| GET | `/api/skills/{name}` | Get skill details + SKILL.md |

### Install

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/skills/{name}/install` | Get install token + command |
| POST | `/api/check-updates` | Check installed versions |

### Author (requires write access)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/skills/{name}/edit` | Download skill for editing |
| POST | `/api/skills/{name}` | Create/update skill |
| DELETE | `/api/skills/{name}?confirm=true` | Delete skill |
| POST | `/api/skills/{name}/bump` | Bump version |
| POST | `/api/skills/{name}/publish` | Publish to marketplace |

### Identity

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/whoami` | Get authenticated user info |
| GET | `/api/debug/plugins` | Raw GitHub API response (debug) |

## What Makes This Work

1. **MCP is minimal** - One tool, returns token, ~50 tokens of context
2. **Skill is documentation** - Loaded just-in-time when user asks about skills
3. **REST API is the product** - All logic server-side, easy to maintain
4. **Code Execution processes results** - API responses don't bloat context
5. **Install tokens are separate** - Short-lived, single-purpose (security)

## Why Not Eliminate MCP Entirely?

The MCP connector provides frictionless OAuth:
- One-click install (Settings > Connectors > Add URL)
- OAuth flow handled by the platform
- Token persistence managed server-side
- Works across Claude.ai, Desktop, Mobile

Without MCP, alternatives are worse:
- API key copy-paste (fiddly)
- OAuth device flow (complex)
- Magic links (how does Claude receive it?)

The single auth tool is worth the MCP overhead for the install UX it enables.

## Skill Structure

```
~/.claude/skills/skillport/
├── SKILL.md                      # Main instructions
├── .claude-plugin/
│   └── plugin.json               # Version, metadata
└── references/
    ├── authoring-skills.md       # For skill authors
    └── skill-best-practices.md   # Best practices
```

## Current Friction Points

1. **Branching install paths** - Claude Code (unzip) vs Claude.ai/Desktop (present_files)
2. **Token management** - Claude must call `skillport_auth` first
3. **401 handling** - Token expires after 15min, needs refresh

## Potential Improvements

1. **Token refresh helper** - Skill could include auto-refresh on 401
2. **Unified install** - Abstract the Claude Code vs Claude.ai difference
3. **Programmatic Tool Calling** - Define API as tools callable from code (but adds MCP definitions back)
