# Phase 2: Google OAuth Handler

## Objective

Replace the GitHub OAuth handler with Google Workspace OAuth while keeping the same OAuth provider infrastructure.

## Google OAuth Endpoints

| Purpose | URL |
|---------|-----|
| Authorization | `https://accounts.google.com/o/oauth2/v2/auth` |
| Token Exchange | `https://oauth2.googleapis.com/token` |
| User Info | `https://www.googleapis.com/oauth2/v2/userinfo` |

## Scopes

```
openid email profile
```

- `openid` - Required for ID token
- `email` - User's email address
- `profile` - User's name and picture

## Google Cloud Console Setup

### 1. Create OAuth 2.0 Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select/create project
3. Navigate to APIs & Services > Credentials
4. Create OAuth 2.0 Client ID
5. Application type: Web application
6. Authorized redirect URIs:
   - `https://your-worker.workers.dev/callback`
   - `http://localhost:8788/callback` (for dev)

### 2. Configure OAuth Consent Screen

1. Navigate to OAuth consent screen
2. User type: Internal (for Workspace) or External
3. Add scopes: `openid`, `email`, `profile`
4. For Workspace: restrict to your domain

## Implementation: src/google-handler.ts

```typescript
import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import {
  OAuthHelpers,
  AuthRequest,
} from "@cloudflare/workers-oauth-provider";

const app = new Hono<{ Bindings: Env }>();

// Google OAuth endpoints
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

/**
 * GET /authorize
 * Shows approval dialog (or auto-approves) and redirects to Google
 */
app.get("/authorize", async (c) => {
  const oauthReqInfo = await OAuthHelpers.parseAuthRequest(c.req.raw, c.env);

  if (!oauthReqInfo.clientId) {
    return c.text("Invalid OAuth request", 400);
  }

  // For simplicity, auto-approve all requests
  // (Add approval UI here if needed)

  // Generate state for CSRF protection
  const state = crypto.randomUUID();

  // Store OAuth request info in KV, keyed by state
  await c.env.OAUTH_KV.put(
    `oauth_state:${state}`,
    JSON.stringify({
      oauthReqInfo,
      timestamp: Date.now(),
    }),
    { expirationTtl: 600 } // 10 minutes
  );

  // Set state cookie for verification
  setCookie(c, "oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    maxAge: 600,
  });

  // Build Google OAuth URL
  const googleAuthUrl = new URL(GOOGLE_AUTH_URL);
  googleAuthUrl.searchParams.set("client_id", c.env.GOOGLE_CLIENT_ID);
  googleAuthUrl.searchParams.set("redirect_uri", `${new URL(c.req.url).origin}/callback`);
  googleAuthUrl.searchParams.set("response_type", "code");
  googleAuthUrl.searchParams.set("scope", "openid email profile");
  googleAuthUrl.searchParams.set("state", state);
  googleAuthUrl.searchParams.set("access_type", "offline"); // Get refresh token
  googleAuthUrl.searchParams.set("prompt", "consent"); // Force consent to get refresh token

  return c.redirect(googleAuthUrl.toString());
});

/**
 * GET /callback
 * Handles Google's redirect after user authorization
 */
app.get("/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const error = c.req.query("error");

  if (error) {
    return c.text(`OAuth error: ${error}`, 400);
  }

  if (!code || !state) {
    return c.text("Missing code or state", 400);
  }

  // Verify state matches cookie
  const cookieState = getCookie(c, "oauth_state");
  if (state !== cookieState) {
    return c.text("State mismatch - possible CSRF attack", 400);
  }

  // Retrieve stored OAuth request info
  const storedData = await c.env.OAUTH_KV.get(`oauth_state:${state}`);
  if (!storedData) {
    return c.text("OAuth session expired", 400);
  }

  const { oauthReqInfo } = JSON.parse(storedData) as {
    oauthReqInfo: AuthRequest;
  };

  // Clean up state from KV
  await c.env.OAUTH_KV.delete(`oauth_state:${state}`);

  // Exchange code for tokens
  const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: c.env.GOOGLE_CLIENT_ID,
      client_secret: c.env.GOOGLE_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: `${new URL(c.req.url).origin}/callback`,
    }),
  });

  if (!tokenResponse.ok) {
    const error = await tokenResponse.text();
    return c.text(`Token exchange failed: ${error}`, 500);
  }

  const tokens = await tokenResponse.json() as {
    access_token: string;
    refresh_token?: string;
    id_token?: string;
    expires_in: number;
  };

  // Fetch user info
  const userResponse = await fetch(GOOGLE_USERINFO_URL, {
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
    },
  });

  if (!userResponse.ok) {
    return c.text("Failed to fetch user info", 500);
  }

  const user = await userResponse.json() as {
    id: string;
    email: string;
    name: string;
    picture?: string;
    hd?: string; // Workspace domain
  };

  // Optional: Verify user is from allowed domain
  // if (user.hd !== "your-domain.com") {
  //   return c.text("Unauthorized domain", 403);
  // }

  // Complete the OAuth flow
  // The userId is the Google user ID, props contain user data
  const { redirectTo } = await OAuthHelpers.completeAuthorization(
    c.env,
    oauthReqInfo,
    user.id,
    {
      email: user.email,
      name: user.name,
      picture: user.picture,
      domain: user.hd,
    }
  );

  return c.redirect(redirectTo);
});

export default app;
```

## Integration in src/index.ts

```typescript
import { OAuthProvider } from "@cloudflare/workers-oauth-provider";
import googleHandler from "./google-handler";
import { SkillportMCP } from "./mcp-server";

export default new OAuthProvider({
  apiRoute: ["/sse", "/mcp"],
  apiHandler: SkillportMCP.mount("/"),
  defaultHandler: googleHandler,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
});
```

## User Props Available to MCP Tools

After authentication, the MCP server can access user info:

```typescript
// In tool implementation
async ({ params }, { props }) => {
  const userEmail = props.email;
  const userName = props.name;
  const userDomain = props.domain; // Workspace domain

  // Use for audit logging, access control, etc.
}
```

## Testing the OAuth Flow

### 1. Local Development

```bash
# Create .dev.vars with Google credentials
npm run dev
```

### 2. MCP Inspector

```bash
npx @modelcontextprotocol/inspector@latest
# Connect to http://localhost:8788/mcp
# Should redirect to Google login
```

### 3. Verify Token Storage

Check KV namespace for stored tokens (hashed, not raw).

## Security Considerations

- Tokens stored as hashes in KV
- State parameter prevents CSRF
- Cookie is httpOnly and secure
- Optional domain restriction for Workspace
- Short-lived state (10 minutes)
