/**
 * Google OAuth handler for Skillport Connector
 * Handles user authentication via Google Workspace
 */

import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { AuthRequest, OAuthHelpers } from "@cloudflare/workers-oauth-provider";

// Extend Env to include OAuth provider helpers injected by OAuthProvider
type EnvWithOAuth = Env & { OAUTH_PROVIDER: OAuthHelpers };

const app = new Hono<{ Bindings: EnvWithOAuth }>();

/**
 * GET /.well-known/oauth-protected-resource
 * RFC 9728 - Required for Claude.ai to discover the authorization server
 *
 * IMPORTANT: This must return HTTP 200 (not 401) for Claude.ai to work correctly.
 * See: https://www.buildwithmatija.com/blog/oauth-mcp-server-claude
 */
app.get("/.well-known/oauth-protected-resource", (c) => {
  const origin = new URL(c.req.url).origin;
  return c.json({
    resource: origin,
    authorization_servers: [origin],
    // Required fields per MCP OAuth spec
    scopes_supported: ["mcp:read"],
    bearer_methods_supported: ["header"],
  });
});

/**
 * GET / - Root endpoint
 * Returns basic server info for Claude.ai discovery
 */
app.get("/", (c) => {
  return c.json({
    name: "Skillport Connector",
    version: "1.0.0",
    mcp: {
      endpoint: "/sse",
      version: "2025-06-18",
    },
  });
});

// Google OAuth endpoints
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in: number;
  token_type: string;
}

interface GoogleUserInfo {
  id: string;
  email: string;
  name: string;
  picture?: string;
  hd?: string; // Workspace domain
}

/**
 * GET /authorize
 * Initiates OAuth flow by redirecting to Google
 */
app.get("/authorize", async (c) => {
  const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);

  if (!oauthReqInfo.clientId) {
    return c.text("Invalid OAuth request", 400);
  }

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
  const redirectUri = `${new URL(c.req.url).origin}/callback`;
  const googleAuthUrl = new URL(GOOGLE_AUTH_URL);
  googleAuthUrl.searchParams.set("client_id", c.env.GOOGLE_CLIENT_ID);
  googleAuthUrl.searchParams.set("redirect_uri", redirectUri);
  googleAuthUrl.searchParams.set("response_type", "code");
  googleAuthUrl.searchParams.set("scope", "openid email profile");
  googleAuthUrl.searchParams.set("state", state);
  googleAuthUrl.searchParams.set("access_type", "offline");
  googleAuthUrl.searchParams.set("prompt", "consent");

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

  let oauthReqInfo: AuthRequest;
  try {
    const parsed = JSON.parse(storedData) as { oauthReqInfo: AuthRequest };
    oauthReqInfo = parsed.oauthReqInfo;
  } catch (e) {
    console.error("[AUDIT] Failed to parse stored OAuth state:", e);
    return c.text("Invalid OAuth session data", 400);
  }

  // Clean up state from KV
  await c.env.OAUTH_KV.delete(`oauth_state:${state}`);

  // Exchange code for tokens
  const redirectUri = `${new URL(c.req.url).origin}/callback`;
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
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    console.error("Token exchange failed:", errorText);
    return c.text(`Token exchange failed: ${tokenResponse.status}`, 500);
  }

  const tokens = (await tokenResponse.json()) as GoogleTokenResponse;

  // Fetch user info
  const userResponse = await fetch(GOOGLE_USERINFO_URL, {
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
    },
  });

  if (!userResponse.ok) {
    const errorText = await userResponse.text();
    console.error("[AUDIT] Failed to fetch user info:", userResponse.status, errorText);
    return c.text("Failed to fetch user info", 500);
  }

  const user = (await userResponse.json()) as GoogleUserInfo;

  // Optional: Restrict to specific Google Workspace domains
  // Set GOOGLE_ALLOWED_DOMAINS env var to comma-separated list (e.g., "acme.com,acme.io")
  // If not set, all authenticated Google users are allowed
  const allowedDomains = c.env.GOOGLE_ALLOWED_DOMAINS;
  if (allowedDomains) {
    const domains = allowedDomains.split(",").map((d) => d.trim().toLowerCase()).filter((d) => d);
    const userDomain = user.hd?.toLowerCase();
    if (!userDomain || !domains.includes(userDomain)) {
      const domainList = domains.join(", ");
      console.warn(`[AUDIT] Domain rejected: user=${user.email} domain=${user.hd || "none"} allowed=${domainList}`);
      return c.text(
        `Access restricted to these Google Workspace domains: ${domainList}`,
        403
      );
    }
  }

  // Complete the OAuth flow
  try {
    const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
      request: oauthReqInfo,
      userId: user.id,
      metadata: {
        label: user.name || user.email,
      },
      scope: oauthReqInfo.scope,
      props: {
        uid: user.id, // Stable unique identifier from IdP
        provider: "google", // For constructing full id
        email: user.email, // For display only
        name: user.name,
        picture: user.picture,
        domain: user.hd,
      },
    });

    console.log(`[AUDIT] OAuth completed: user=${user.email} domain=${user.hd || "none"}`);
    return c.redirect(redirectTo);
  } catch (e) {
    console.error("[AUDIT] OAuth completion failed:", e);
    return c.text("Failed to complete authorization", 500);
  }
});

// Export as ExportedHandler for compatibility with OAuthProvider
export default {
  fetch: app.fetch,
} as ExportedHandler;
