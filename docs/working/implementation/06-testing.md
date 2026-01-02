# Phase 5: Testing

## Objective

Verify the connector works correctly through multiple testing methods, including having Claude test it directly.

## Testing Levels

1. **Unit Tests** - Individual functions
2. **Local Development** - Full server locally
3. **MCP Inspector** - Official MCP testing tool
4. **Claude.ai Integration** - End-to-end with Claude
5. **Claude Self-Test** - Claude verifies the MCP tools work

## 1. Unit Tests

### GitHub Client Tests

```typescript
// tests/github-client.test.ts
import { describe, it, expect } from "vitest";

describe("GitHubClient", () => {
  it("fetches marketplace.json", async () => {
    // Mock or use real token for integration test
  });

  it("filters plugins by surface", async () => {
    // Test filtering logic
  });

  it("handles 404 errors gracefully", async () => {
    // Test error handling
  });
});
```

Run: `npm test`

## 2. Local Development

### Setup

```bash
# Create .dev.vars with your credentials
cp .dev.vars.example .dev.vars
# Edit .dev.vars with real values

# Start local server
npm run dev
```

Server runs at `http://localhost:8788`

### Test Endpoints Manually

```bash
# Health check (should return something)
curl http://localhost:8788/

# OAuth discovery
curl http://localhost:8788/.well-known/oauth-protected-resource

# Start OAuth flow (will redirect to Google)
open http://localhost:8788/authorize
```

## 3. MCP Inspector

The official tool for testing MCP servers.

### Install and Run

```bash
npx @modelcontextprotocol/inspector@latest
```

Opens browser at `http://localhost:5173`

### Test Steps

1. Enter server URL: `http://localhost:8788/mcp`
2. Click Connect
3. Complete Google OAuth flow
4. View available tools in the inspector
5. Test each tool:

**Test list_plugins:**
```json
{}
```
Expected: List of plugins from your marketplace

**Test list_plugins with filter:**
```json
{ "surface": "claude-ai" }
```
Expected: Only plugins targeting Claude.ai

**Test get_plugin:**
```json
{ "name": "example-skill" }
```
Expected: Plugin details

**Test fetch_skill:**
```json
{ "name": "example-skill" }
```
Expected: SKILL.md content

**Test check_updates:**
```json
{
  "installed": [
    { "name": "example-skill", "version": "0.9.0" }
  ]
}
```
Expected: Update available (if marketplace has 1.0.0)

## 4. Claude.ai Integration

### Deploy to Cloudflare

```bash
# Create KV namespace
wrangler kv namespace create OAUTH_KV
# Copy the ID to wrangler.toml

# Set secrets
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put GITHUB_SERVICE_TOKEN
wrangler secret put COOKIE_ENCRYPTION_KEY

# Deploy
npm run deploy
```

### Add to Claude.ai

1. Go to Settings > Connectors
2. Click "Add custom connector"
3. Enter MCP Server URL: `https://skillport-connector.your-account.workers.dev/mcp`
4. Click Add
5. Complete Google OAuth
6. Enable in conversation via "Search and tools"

### Test in Conversation

Ask Claude:
- "What plugins are available in my skillport?"
- "Tell me about the example-skill plugin"
- "Fetch the skill files for example-skill"

## 5. Claude Self-Test

**Important:** Once deployed and connected, Claude can test the MCP tools directly.

### Self-Test Prompts

Have Claude run these tests:

```
Test the Skillport connector:

1. Call list_plugins and verify it returns plugins
2. Call get_plugin with name "example-skill"
3. Call fetch_skill with name "example-skill"
4. Call check_updates with installed: [{"name": "example-skill", "version": "0.0.1"}]

Report results for each test.
```

### Expected Results

Claude should report:
- ✅ list_plugins returns plugin array
- ✅ get_plugin returns plugin details
- ✅ fetch_skill returns SKILL.md content
- ✅ check_updates shows update available (version mismatch)

### Troubleshooting Self-Test

If Claude can't call the tools:
1. Check connector is enabled in "Search and tools"
2. Verify OAuth completed successfully
3. Check Cloudflare Worker logs for errors

## Debugging

### Cloudflare Worker Logs

```bash
wrangler tail
```

Shows real-time logs from your deployed worker.

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| OAuth redirect fails | Wrong callback URL | Update Google Cloud Console |
| Tools not visible | Connector not enabled | Enable in conversation |
| GitHub API 401 | Invalid token | Regenerate PAT |
| GitHub API 403 | Rate limited | Wait or check token scope |
| KV errors | Namespace not created | Run `wrangler kv namespace create` |

### Log User Actions

Add logging to track usage:

```typescript
// In tool implementation
console.log(`[${new Date().toISOString()}] ${this.props.email} called list_plugins`);
```

## Test Checklist

- [ ] Local server starts without errors
- [ ] OAuth flow completes successfully
- [ ] MCP Inspector connects and shows tools
- [ ] list_plugins returns marketplace data
- [ ] get_plugin returns specific plugin
- [ ] fetch_skill returns SKILL.md content
- [ ] check_updates identifies outdated plugins
- [ ] Deployed to Cloudflare successfully
- [ ] Claude.ai can connect via custom connector
- [ ] Claude can call all four tools
- [ ] Error handling works (test with invalid plugin name)

## Performance Benchmarks

| Operation | Target | Notes |
|-----------|--------|-------|
| list_plugins (cached) | < 100ms | KV read |
| list_plugins (cold) | < 500ms | GitHub API + KV write |
| fetch_skill (cached) | < 100ms | KV read |
| fetch_skill (cold) | < 1s | GitHub API + KV write |

## Security Verification

- [ ] Tokens are not logged
- [ ] CSRF protection works (test state mismatch)
- [ ] Only authorized users can access tools
- [ ] GitHub service token is not exposed to users
