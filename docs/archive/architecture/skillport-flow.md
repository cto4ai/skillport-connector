# Skillport Architecture Flow

How the MCP connector, skill, and REST API work together.

## Code Execution Capabilities

Understanding what code execution can do is essential to this architecture.

### Evolution Timeline

| Date | Capability |
|------|------------|
| May 2025 | Python sandbox launched across all Claude surfaces |
| August 2025 | Bash support added (shell scripts, package installation, file manipulation) |
| October 2025 | Network egress controls for enterprise |

### Network Access by Surface

| Surface | Code Execution | Network Access |
|---------|---------------|----------------|
| **Claude Code** | Native bash/Python | Full (user's machine) |
| **Claude.ai/Desktop (Enterprise)** | Sandboxed bash/Python | Configurable egress (see below) |
| **Claude.ai/Desktop (Consumer)** | Sandboxed bash/Python | Package managers only |
| **API** | Sandboxed bash/Python | None (completely disabled) |

### Enterprise Egress Controls

Admins can configure three levels:
1. **Package managers only** - pip, npm, etc. (most restricted)
2. **Allowlisted domains** - Specific URLs approved by admin
3. **Full internet access** - Unrestricted HTTP/HTTPS

This means Claude.ai/Desktop users with appropriate egress settings **can make HTTP requests** directly from code execution (Python `requests`, bash `curl`).

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
│  │ - base_url   │     │ (bash + Python)  │     │ live here       │ │
│  └──────────────┘     └──────────────────┘     └─────────────────┘ │
│         │                      │                        │          │
│         └──────────────────────┼────────────────────────┘          │
│                                │                                    │
│                    ┌───────────▼───────────┐                       │
│                    │   Code Execution      │                       │
│                    │   (bash + Python)     │                       │
│                    │                       │                       │
│                    │ - Makes API calls     │                       │
│                    │ - Processes results   │                       │
│                    │ - Only output hits    │                       │
│                    │   context             │                       │
│                    └───────────────────────┘                       │
└─────────────────────────────────────────────────────────────────────┘
```

### Why Both Bash and Python?

| Surface | Primary Language | Notes |
|---------|-----------------|-------|
| Claude Code | Bash | Native terminal access, curl preferred |
| Claude.ai/Desktop | Python | Code execution sandbox, `requests` library available |

The skill should document both approaches so Claude can use the appropriate one for each surface.

## Programmatic Tool Calling

A November 2024 breakthrough changed how tools should be designed. Instead of Claude calling MCP tools directly (which dumps results into context), Claude now **writes code** that calls tools programmatically.

### The Old Way (Context-Heavy)
```
Claude → MCP tool → result (into context) → Claude processes → MCP tool → result (into context) → ...
```
Each tool result consumes tokens. Five tools with 1KB responses = 5KB of context consumed.

### The New Way (Code-Based)
```
Claude → writes code that calls tools → code executes → only final output hits context
```
Claude writes a script that makes multiple API calls, filters results, and returns only what's needed.

### Why This Matters for Skillport

Our architecture already follows this pattern:
1. **Minimal MCP** - One auth tool, ~50 tokens
2. **Code Execution** - Claude writes bash/Python to call REST API
3. **Filtering in code** - API responses processed before hitting context

This is why we have one MCP tool instead of many.

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

**Bash (Claude Code):**
```
Claude → MCP (skillport_auth) → token (~50 tokens)
Claude → Code Execution (bash):
    response=$(curl -sf "${base_url}/api/skills" -H "Authorization: Bearer ${token}")
    echo "$response" | jq '[.skills[] | select(.name | contains("pdf"))] | length'
    # Only the filtered count hits context
```

**Python (Claude.ai/Desktop):**
```
Claude → MCP (skillport_auth) → token (~50 tokens)
Claude → Code Execution (Python):
    import requests
    response = requests.get(f"{base_url}/api/skills", headers={"Authorization": f"Bearer {token}"})
    skills = response.json()["skills"]
    matching = [s for s in skills if "pdf" in s["name"]]
    print(f"Found {len(matching)} PDF-related skills")
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

1. **Add Python examples to skill** - Currently skill only documents bash/curl; should add Python `requests` examples for Claude.ai/Desktop users
2. **Token refresh helper** - Skill could include auto-refresh on 401
3. **Unified install** - Abstract the Claude Code vs Claude.ai difference
4. **Programmatic Tool Calling** - Define API as tools callable from code (but adds MCP definitions back)

## Current Skill Gap

### Where Claude Gets Instructions

Claude receives instructions from two places:

1. **Skill (SKILL.md)** - Documents how to call the REST API
2. **REST API responses** - Returns executable commands (e.g., install endpoint returns `curl ... | bash`)

### Current State

**Both places only document bash/curl.** No Python examples exist for Claude to use.

| Source | What It Provides | Python? |
|--------|-----------------|---------|
| Skill SKILL.md | API call examples | No, bash/curl only |
| REST API `/install` response | `command` field | No, returns bash command |
| REST API `/edit` response | `command` field | No, returns bash command |

### Note: Embedded Python vs API Call Examples

The `install.sh` script contains **embedded Python** for file operations:

```bash
python3 << 'PYTHON_SCRIPT'
import json
data = json.load(open('/tmp/skillport_response.json'))
# ... writes files ...
PYTHON_SCRIPT
```

This is **implementation detail** of the installer, not instructions for Claude. Claude doesn't write this Python - it just runs the bash command that contains it.

What's missing is **Python examples for Claude to write** when calling the API:

```python
# This doesn't exist in the skill yet - Claude.ai/Desktop users need this
import requests
response = requests.get(f"{base_url}/api/skills",
                        headers={"Authorization": f"Bearer {token}"})
skills = response.json()
```

### TODO (skillport-marketplace repo)

Add Python examples alongside bash/curl in SKILL.md so Claude.ai/Desktop users can use Python's `requests` library instead of curl.
