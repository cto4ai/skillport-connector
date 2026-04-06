# Skillport Editor Solution: Architecture

## Overview

Enable skill creators/editors to modify skills via the Skillport Connector while maintaining security through:
- Enterprise IdP OAuth (Google/Entra/Okta) for user identity
- Email-based access control defined in `.skillport/access.json`
- Two GitHub PATs (read + write) for defense in depth

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Skillport Connector                        │
│                   (Enterprise IdP OAuth)                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  User authenticates via IdP (Google/Entra/Okta)              │
│           ↓                                                  │
│  Connector gets user email from OAuth                        │
│           ↓                                                  │
│  Fetch .skillport/access.json (using READ PAT)               │
│           ↓                                                  │
│  Determine user role:                                        │
│    - Is email in "editors" list? → Can use WRITE PAT         │
│    - Check per-skill access rules                            │
│           ↓                                                  │
│  Expose tools based on permissions:                          │
│    - All users: list, get, fetch (filtered by skill access)  │
│    - Editors: update, create, bump_version                   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Repository Structure

```
marketplace-repo/
├── .claude-plugin/
│   └── marketplace.json        # Standard Claude plugin marketplace
├── .skillport/
│   └── access.json             # Skillport access control (new)
└── plugins/
    ├── company-wide-tool/      # Available to everyone
    ├── finance-tools/          # Restricted to finance team
    └── admin-only/             # Restricted to admins
```

---

## Access Control Schema

**.skillport/access.json:**

```json
{
  "$schema": "https://skillport.dev/schemas/access.json",
  "version": "1.0",

  "editors": [
    { "id": "google:110248495921238986420", "label": "jack@craftycto.com" },
    { "id": "google:998877665544332211", "label": "alice@craftycto.com" }
  ],

  "skills": {
    "finance-tools": {
      "read": [
        { "id": "google:111222333444", "label": "alice@finance.acme.com" },
        { "id": "google:555666777888", "label": "cfo@acme.com" }
      ],
      "write": [
        { "id": "google:111222333444", "label": "alice@finance.acme.com" }
      ]
    },
    "admin-only": {
      "read": [
        { "id": "google:110248495921238986420", "label": "jack@craftycto.com" }
      ],
      "write": "editors"
    }
  },

  "defaults": {
    "read": "*",
    "write": "editors"
  }
}
```

### Field Definitions

| Field | Description |
|-------|-------------|
| `editors` | List of user objects that can edit skills (global editors) |
| `skills.<name>.read` | Who can see/fetch this skill. Array of user objects, or `"*"` |
| `skills.<name>.write` | Who can edit this skill. Array of user objects or `"editors"` |
| `defaults.read` | Default read access. `"*"` = everyone authenticated |
| `defaults.write` | Default write access. `"editors"` = use editors list |

### User Object Format

```json
{ "id": "{provider}:{uid}", "label": "human-readable description" }
```

| Field | Description |
|-------|-------------|
| `id` | **Authoritative.** Unique identifier from IdP. Format: `{provider}:{uid}` |
| `label` | **Informational only.** For human readability. Never used for matching. |

### Provider Prefixes

| Provider | Prefix | Example `id` |
|----------|--------|--------------|
| Google | `google:` | `google:110248495921238986420` |
| Microsoft Entra | `entra:` | `entra:a1b2c3d4-e5f6-7890-abcd-ef1234567890` |
| Okta | `okta:` | `okta:00u1234567890abcdef` |

### Special Values

- `"*"` - Everyone (any authenticated user)
- `"editors"` - Reference to the editors list

---

## Two-PAT Security Model

### Why Two PATs?

Defense in depth. Even if Connector code has a bug, non-editors cannot write.

| PAT | Permissions | Used When |
|-----|-------------|-----------|
| `GITHUB_READ_TOKEN` | Read-only repo access | Default for all operations |
| `GITHUB_WRITE_TOKEN` | Read + write repo access | Only after editor verification |

### Flow

```
User makes request
        ↓
Fetch access.json (READ PAT)
        ↓
Is user email in editors list?
        │
        ├── No  → Continue with READ PAT only
        │         Reject any write operations
        │
        └── Yes → Unlock WRITE PAT for this session
                  Allow write operations
```

---

## MCP Tools

### Reader Tools (all authenticated users, filtered by skill access)

| Tool | Description |
|------|-------------|
| `list_plugins` | List plugins user can see (filtered by access.json) |
| `get_plugin` | Get plugin details (if user has read access) |
| `fetch_skill` | Download skill files (if user has read access) |
| `check_updates` | Check for version updates |

### Editor Tools (requires editor role)

| Tool | Description | Status |
|------|-------------|--------|
| `save_skill` | Create/update multiple skill files (upsert) | ✅ Implemented |
| `publish_plugin` | Add plugin to marketplace.json | ✅ Implemented |
| `bump_version` | Increment version (major/minor/patch) | ✅ Implemented |
| `whoami` | Show user's stable ID for access.json | ✅ Implemented |
| `create_plugin` | Scaffold a new plugin (legacy) | ✅ Implemented |
| `update_skill` | Edit SKILL.md only | ⚠️ Deprecated (use `save_skill`) |

---

## Commit Attribution

When editors make changes:

1. Commit made via GitHub API using WRITE PAT
2. Commit message includes user email for audit trail
3. Option: Use GitHub's `author` parameter to attribute commits

```
Author: Skillport Bot <bot@skillport.dev>
Committer: Skillport Bot <bot@skillport.dev>

Updated finance-tools SKILL.md

Requested by: alice@craftycto.com
```

---

## Future Extensibility

### IdP Group Support (Phase 2)

Replace email lists with IdP group references:

```json
{
  "editors": ["group:skill-editors"],
  "skills": {
    "finance-tools": {
      "read": ["group:finance-team", "group:executives"],
      "write": ["group:finance-admins"]
    }
  }
}
```

Requires:
- Fetching group claims from IdP OAuth token
- Group resolution logic in Connector

### Multi-Marketplace (Phase 2)

Support multiple repos via:
- Connector config listing allowed repos
- User selects active repo via tool parameter
- Each repo has its own `.skillport/access.json`
