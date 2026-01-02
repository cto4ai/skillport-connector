# Skillport Connector - Development Details

This document contains development-specific context for the Skillport Connector. It lives in the `development` branch and should not be included in main.

## Production Instance

This is the Crafty CTO production instance:

| Component | Value |
|-----------|-------|
| Worker URL | https://skillport-connector.jack-ivers.workers.dev/sse |
| Marketplace Repo | cto4ai/crafty-skillport-marketplace |
| Sibling Repo (local) | ../skillport-marketplace/ |

## Branch Strategy

- **main**: Clean, template-ready code for open source distribution
- **development**: Working branch with dev docs, research, and checkpoints

### Syncing Changes

To sync main changes to development:
```bash
git checkout development
git merge main
git push
```

To cherry-pick specific commits from development to main:
```bash
git checkout main
git cherry-pick <commit-hash>
git push
```

## Documentation (Development Branch)

### Research
- `docs/research/claude-connectors-research.md` - Research on Claude.ai connectors
- `docs/research/skills-system-research.md` - Research on Claude's Skills system

### Working Documents
- `docs/working/checkpoints/` - Session checkpoints
- `docs/working/` - Various working documents, plans, and explorations

## Implementation Status

Current state: **Production**

- [x] MCP server structure
- [x] Tool definitions with schemas
- [x] Google OAuth handler
- [x] GitHub API client for marketplace
- [x] Tool implementations
- [x] KV storage setup
- [x] Audit logging via `logAction()` (uses OAuth email)
- [ ] Rate limiting
- [ ] Unit tests

## User Email & Audit Logging

User email is captured from Google OAuth and stored in `this.props.email` via the McpAgent session. This is the authoritative source for user identity.

**Implementation:** `logAction()` method uses `this.props.email` from OAuth session. View logs via `wrangler tail` or Cloudflare dashboard.

## Testing Notes

**Important:** Cannot test MCP tools directly from Claude Code due to OAuth requirements. Use one of these methods:

1. **Claude.ai with connector enabled** - Add the connector in Settings, test tools in conversation
2. **MCP Inspector** - `npx @anthropic-ai/mcp-inspector` with the SSE URL
3. **Wrangler tail for logs** - `node node_modules/wrangler/bin/wrangler.js tail` to see audit logs

## Wrangler Notes

Wrangler v4 requires Node v20+. The VS Code extension runs Node v19.3.0, so run wrangler directly:
```bash
node node_modules/wrangler/bin/wrangler.js dev
node node_modules/wrangler/bin/wrangler.js deploy
node node_modules/wrangler/bin/wrangler.js tail
```

## Git Workflow Reminders

- Use conventional commits
- **ALWAYS use a branch/PR process for code changes** - never commit code directly to main
- Create a feature branch before making any code changes
- Testing will often take place before a PR is issued for the branch
- Updates direct to main for documentation-only changes are ok
- "save our work" means add, commit, push
