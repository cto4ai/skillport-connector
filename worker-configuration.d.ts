interface Env {
  // KV namespace for OAuth tokens and cache
  OAUTH_KV: KVNamespace;

  // Google OAuth credentials
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;

  // GitHub service token for API access
  GITHUB_SERVICE_TOKEN: string;

  // Marketplace repository (e.g., "cto4ai/skillport-template")
  MARKETPLACE_REPO: string;

  // Cookie encryption key (32+ characters)
  COOKIE_ENCRYPTION_KEY: string;
}
