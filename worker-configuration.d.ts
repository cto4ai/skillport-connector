interface Env {
  // KV namespace for OAuth tokens and cache
  OAUTH_KV: KVNamespace;

  // KV namespace for API keys (authless mode)
  API_KEYS: KVNamespace;

  // Google OAuth credentials
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;

  // GitHub service token for API access (read-only)
  GITHUB_SERVICE_TOKEN: string;

  // GitHub write token for editor operations (optional)
  GITHUB_WRITE_TOKEN?: string;

  // Marketplace repository (e.g., "cto4ai/skillport-marketplace-template")
  MARKETPLACE_REPO: string;

  // Cookie encryption key (32+ characters)
  COOKIE_ENCRYPTION_KEY: string;
}
