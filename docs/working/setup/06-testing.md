# Testing the Setup

Verify everything works before deploying.

## Prerequisites

Ensure you've completed:
- [x] KV namespace created and ID added to wrangler.toml
- [x] Google OAuth credentials configured
- [x] GitHub service token created
- [x] `.dev.vars` file with all secrets

## Step 1: Start Dev Server

From an **external terminal** (not VS Code integrated terminal):

```bash
cd /Users/jackivers/Projects/skillport/skillport-connector
wrangler dev
```

You should see:
```
⛅️ wrangler 4.x.x
Your worker has access to the following bindings:
- KV Namespaces:
  - OAUTH_KV: ... [simulated locally]
- Vars:
  - MARKETPLACE_REPO: "cto4ai/skillport-marketplace-template"
⎔ Starting local server...
Ready on http://localhost:8787
```

## Step 2: Test Basic Endpoints

### Health Check
```bash
curl http://localhost:8787/
```

Should return a response (might be a redirect or basic page).

### OAuth Metadata
```bash
curl http://localhost:8787/.well-known/oauth-authorization-server
```

Should return OAuth server metadata JSON.

## Step 3: Test with MCP Inspector

The MCP Inspector is a tool for testing MCP servers.

```bash
npx @anthropic-ai/mcp-inspector@latest
```

1. Enter URL: `http://localhost:8787/mcp`
2. The inspector should redirect you to Google login
3. After authenticating, you should see the available tools:
   - `list_plugins`
   - `get_plugin`
   - `fetch_skill`
   - `check_updates`

## Step 4: Test MCP Tools

In the MCP Inspector, try calling:

### list_plugins
```json
{}
```

Should return the marketplace plugin list (or empty if marketplace not populated).

### get_plugin
```json
{
  "name": "example-plugin"
}
```

Should return plugin details or an error if not found.

## Step 5: Test OAuth Flow Manually

1. Open browser to: `http://localhost:8787/authorize?client_id=test&redirect_uri=http://localhost:3000/callback&response_type=code`
2. Should redirect to Google login
3. After login, should redirect back with an authorization code

## Troubleshooting

### "Invalid OAuth request" on /authorize
- The OAuth provider expects requests from registered clients
- Use MCP Inspector which handles client registration automatically

### Google login fails with "redirect_uri_mismatch"
- Add `http://localhost:8787/callback` to Google Cloud Console authorized redirect URIs

### "Failed to fetch user info"
- Check GOOGLE_CLIENT_SECRET is correct
- Verify Google OAuth credentials haven't been regenerated

### MCP tools return "Failed to list plugins"
- Check GITHUB_SERVICE_TOKEN is valid
- Verify the marketplace repo exists and is accessible
- Check if `.claude-plugin/marketplace.json` exists in the repo

### KV errors
- For local dev, KV is simulated - these shouldn't occur
- If using `--remote`, ensure KV namespace ID is correct in wrangler.toml

## Next Steps

Once testing passes locally:
1. Deploy to Cloudflare: `wrangler deploy`
2. Add production redirect URI to Google Cloud Console
3. Set production secrets via `wrangler secret put`
4. Test the deployed version
