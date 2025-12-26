# OAuth Implementation Checklist for Claude.ai MCP Connectors

This checklist documents the **specific technical requirements** that people have found make their OAuth MCP server implementations work with Claude.ai and Claude Desktop. These findings are compiled from GitHub issues, blog posts, and official Anthropic documentation.

> **Note:** As of December 2025, there are still open bugs with Claude's OAuth proxy that affect some implementations. This checklist represents best practices that have worked for others, but success is not guaranteed.

---

## Primary Sources

This document was compiled from research conducted on December 26, 2025. Key sources:

### Working Implementation Guides
- **buildwithmatija.com** - [OAuth for MCP Server: Complete Guide to Protecting Claude](https://www.buildwithmatija.com/blog/oauth-mcp-server-claude) - December 2025, Next.js/Vercel implementation with detailed troubleshooting
- **George Vetticaden on Medium** - [The Missing MCP Playbook: Deploying Custom Agents on Claude.ai](https://medium.com/@george.vetticaden/the-missing-mcp-playbook-deploying-custom-agents-on-claude-ai-and-claude-mobile-05274f60a970) - November 2025, Auth0 + Google Cloud Run implementation

### Official Documentation
- **Claude Help Center** - [Building Custom Connectors via Remote MCP Servers](https://support.claude.com/en/articles/11503834-building-custom-connectors-via-remote-mcp-servers) - Confirms OAuth support, DCR, callback URLs
- **Cloudflare** - [Build a Remote MCP Server](https://developers.cloudflare.com/agents/guides/remote-mcp-server/) - Working Cloudflare Workers implementation with OAuth

### GitHub Issues with Technical Details
- [#5826](https://github.com/anthropics/claude-code/issues/5826) - "Claude Desktop doesn't connect to Custom MCPs" - Main tracking issue, marked `oncall`
- [#11814](https://github.com/anthropics/claude-code/issues/11814) - "about:blank loop" - Detailed spec-compliant implementation that fails
- [#3515](https://github.com/anthropics/claude-code/issues/3515) - "Production deployments fail with step=start_error"
- [#2527](https://github.com/anthropics/claude-code/issues/2527) - "Azure AD/Entra ID integration complex" - DCR requirements explained
- [#1674](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1674) - "Claude.ai MCP Connection Issue" - Shows successful OAuth flow but token not sent

### GitHub Discussions
- [Discussion #587](https://github.com/orgs/modelcontextprotocol/discussions/587) - "Does Claude.ai support MCP OAuth authorization?" - CORS header requirements

### FastMCP Issues
- [#1787](https://github.com/jlowin/fastmcp/issues/1787) - "OAuth Proxy Registration step fails from Claude.ai" - Shows working vs failing request patterns
- [#972](https://github.com/jlowin/fastmcp/issues/972) - "OAuth works with MCP Inspector but not Claude"

---

## Critical Requirements

### 1. ✅ `/.well-known/oauth-protected-resource` MUST return HTTP 200

**This is the most commonly missed requirement.**

```python
# CORRECT - Returns 200
@app.get("/.well-known/oauth-protected-resource")
async def oauth_protected_resource():
    return JSONResponse({
        "resource": "https://your-server.com/mcp",
        "authorization_servers": ["https://your-server.com"],
        "scopes_supported": ["read", "write"],
        "bearer_methods_supported": ["header"]
    }, status_code=200)
```

```python
# WRONG - Returns 401
# Claude Web gets confused by this and fails to proceed
```

**Source:** [buildwithmatija.com](https://www.buildwithmatija.com/blog/oauth-mcp-server-claude) - "I want to highlight something important here. This endpoint should return 200, not 401. Some OAuth implementations return 401 from the protected resource metadata, but Claude Web gets confused by this and fails to proceed with the authorization flow."

---

### 2. ✅ Use `www` subdomain if your domain redirects to it

If your domain redirects `example.com` → `www.example.com`, use `www.example.com` as your MCP server URL.

**Why:** A redirect from non-www to www can strip headers and break the OAuth flow.

**Source:** [buildwithmatija.com](https://www.buildwithmatija.com/blog/oauth-mcp-server-claude) - "Important: Use the www subdomain if your domain redirects to it."

---

### 3. ✅ CORS: Expose the `WWW-Authenticate` header

```python
# Required CORS headers
Access-Control-Allow-Origin: *  # or specific origins
Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, MCP-Session-Id
Access-Control-Expose-Headers: WWW-Authenticate  # CRITICAL
```

Without `Access-Control-Expose-Headers: WWW-Authenticate`, the browser can't read the authentication challenge from cross-origin responses.

**Source:** [Discussion #587](https://github.com/orgs/modelcontextprotocol/discussions/587) - Shows CORS headers in working implementation

---

### 4. ✅ Authorization endpoint must redirect via GET, not POST

If you see "Cannot POST /oauth/callback", your authorization approval is using form POST instead of GET redirect.

**Fix:** Change the approval flow to use links that redirect via GET with query parameters.

```html
<!-- CORRECT -->
<a href="https://your-server.com/oauth/callback?code=xxx&state=yyy">Authorize</a>

<!-- WRONG -->
<form method="POST" action="/oauth/callback">...</form>
```

**Source:** [buildwithmatija.com](https://www.buildwithmatija.com/blog/oauth-mcp-server-claude) - "If you see 'Cannot POST /oauth/callback', your authorization approval is using form POST instead of GET redirect."

---

### 5. ✅ Vercel: Disable Security Checkpoint for OAuth endpoints

Vercel's Security Checkpoint can block requests to your OAuth endpoints, treating them as bot traffic. When this happens, Claude receives an HTML challenge page instead of JSON metadata, and the OAuth flow fails silently.

**Fix:** Configure Vercel firewall to allow `.well-known/*` and `/oauth/*` endpoints.

**Source:** [buildwithmatija.com](https://www.buildwithmatija.com/blog/oauth-mcp-server-claude) - "Vercel's Security Checkpoint can block requests to your OAuth endpoints, treating them as bot traffic. When this happens, Claude Web gets an HTML challenge page instead of JSON metadata, and the OAuth flow fails silently."

---

### 6. ✅ i18n routing: Exclude OAuth paths from locale prefixing

If using next-intl or similar i18n routing, OAuth routes get prefixed with locale codes (`/en/oauth/authorize` instead of `/oauth/authorize`), causing 404s.

**Fix (Next.js middleware):**
```typescript
// src/middleware.ts
export const config = {
  matcher: '/((?!api|trpc|_next|_vercel|oauth|\\.well-known|.*\\..*).*)' 
}
```

**Source:** [buildwithmatija.com](https://www.buildwithmatija.com/blog/oauth-mcp-server-claude) - "If you are using next-intl or similar i18n routing, your OAuth routes will get prefixed with locale codes."

---

## OAuth Endpoints Required

Claude expects these endpoints:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/.well-known/oauth-protected-resource` | GET | Resource metadata (returns 200) |
| `/.well-known/oauth-authorization-server` | GET | Authorization server metadata |
| `/oauth/register` | POST | Dynamic Client Registration |
| `/oauth/authorize` | GET | Authorization endpoint |
| `/oauth/token` | POST | Token exchange |

### Example: Authorization Server Metadata

```json
{
  "issuer": "https://your-server.com",
  "authorization_endpoint": "https://your-server.com/oauth/authorize",
  "token_endpoint": "https://your-server.com/oauth/token",
  "registration_endpoint": "https://your-server.com/oauth/register",
  "code_challenge_methods_supported": ["S256"],
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "response_types_supported": ["code"]
}
```

### Example: Protected Resource Metadata

```json
{
  "resource": "https://your-server.com/mcp",
  "authorization_servers": ["https://your-server.com"],
  "scopes_supported": ["read", "write"],
  "bearer_methods_supported": ["header"]
}
```

---

## Claude-Specific Configuration

### Claude's OAuth Callback URL
```
https://claude.ai/api/mcp/auth_callback
```

> **Future change:** This may change to `https://claude.com/api/mcp/auth_callback`. Allowlist both if you restrict redirect URIs.

### Claude's OAuth Client Name
```
Claude
```

### Claude's IP Addresses
See [Anthropic docs](https://docs.anthropic.com/en/api/ip-addresses#ipv4-2) for IP addresses used for inbound/outbound MCP connections.

### Supported Auth Specs
- ✅ [3/26 auth spec](https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization)
- ✅ [6/18 auth spec](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization) (as of July 2025)

### Dynamic Client Registration (DCR)
Claude supports and prefers DCR. If your OAuth provider doesn't support DCR (e.g., Azure AD, Google), as of July 2025 users can specify a custom client ID and client secret in Advanced Settings.

---

## MCP Endpoint Authentication

The MCP endpoint (`/mcp`) should:

1. **Return 401 with WWW-Authenticate header** for unauthenticated requests
2. **Return 200 with SSE stream** for authenticated requests

```python
@app.get("/mcp")
async def mcp_endpoint(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        return Response(
            status_code=401,
            headers={
                "WWW-Authenticate": 'Bearer resource_metadata="https://your-server.com/.well-known/oauth-protected-resource"',
                "Content-Type": "application/json",
            },
            content='{"error": "unauthorized"}'
        )
    
    # Validate token and return SSE stream
    token = authorization.split(" ", 1)[1]
    user = validate_token(token)
    if not user:
        return Response(status_code=401, ...)
    
    return EventSourceResponse(mcp_stream(user))
```

---

## Testing Your Implementation

### 1. Use MCP Inspector
```bash
npx @modelcontextprotocol/inspector
```

### 2. Test endpoints with curl

```bash
# Test protected resource metadata (should return 200)
curl -i https://your-server.com/.well-known/oauth-protected-resource

# Test authorization server metadata (should return 200)
curl -i https://your-server.com/.well-known/oauth-authorization-server

# Test MCP endpoint without auth (should return 401 with WWW-Authenticate)
curl -i https://your-server.com/mcp

# Test Dynamic Client Registration
curl -X POST https://your-server.com/oauth/register \
  -H "Content-Type: application/json" \
  -d '{"client_name":"Test","redirect_uris":["https://claude.ai/api/mcp/auth_callback"]}'
```

### 3. Test with Cloudflare AI Playground
https://playground.ai.cloudflare.com/

---

## Common Failure Patterns

### "There was an error connecting... Please check your server URL"
- Check that `/.well-known/oauth-protected-resource` returns 200 (not 401)
- Check CORS headers, especially `Access-Control-Expose-Headers: WWW-Authenticate`
- Check for domain redirects (www vs non-www)
- Check Vercel/Cloudflare security settings

### `about:blank` loop in Claude Desktop
- This is often a Claude-side bug, not your server
- Check server logs - if no requests are received, the bug is in Claude's OAuth proxy
- Try Claude Code CLI as a workaround: `claude mcp add --transport http`

### OAuth flow starts but `step=start_error`
- Claude's OAuth proxy is failing before reaching your server
- May be related to production vs preview deployments
- Check that all URLs in metadata use HTTPS and match exactly

### "invalid_client" errors
- DCR may not be working correctly
- Check that `/oauth/register` endpoint is accessible and returns proper response
- Try specifying client ID/secret manually in Advanced Settings

---

## Working Examples & Resources

See [Primary Sources](#primary-sources) at the top of this document for the key references.

### Additional Resources
- [MCP Auth Specification](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization) - Official spec
- [Cloudflare workers-oauth-provider](https://blog.cloudflare.com/remote-model-context-protocol-servers-mcp/) - Cloudflare's OAuth provider library
- [MCP Inspector](https://github.com/modelcontextprotocol/inspector) - Official testing tool

---

## Platform Support Matrix

| Platform | OAuth Support | Notes |
|----------|--------------|-------|
| Claude.ai (web) | ✅ Yes | Add via Settings → Connectors |
| Claude Desktop | ✅ Yes | Add via Settings → Connectors (not config file) |
| Claude Mobile | ✅ Yes | Uses servers added via claude.ai |
| Claude Code CLI | ✅ Yes | `claude mcp add --transport http` |
| MCP Inspector | ✅ Yes | Best for testing |

---

## Last Updated
December 26, 2025

## Contributing
If you find additional requirements or fixes, please update this document.
