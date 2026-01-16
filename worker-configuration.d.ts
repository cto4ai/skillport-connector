interface Env {
  // KV namespace for OAuth tokens and cache
  OAUTH_KV: KVNamespace;

  // Google OAuth credentials
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;

  // Optional: Restrict to specific Google Workspace domains (comma-separated)
  // If not set, all authenticated Google users are allowed
  GOOGLE_ALLOWED_DOMAINS?: string;

  // GitHub service token for API access (read-only)
  GITHUB_SERVICE_TOKEN: string;

  // GitHub write token for editor operations (optional)
  GITHUB_WRITE_TOKEN?: string;

  // Marketplace repository (e.g., "your-org/your-marketplace")
  MARKETPLACE_REPO: string;

  // Your deployed connector URL (required for install script generation)
  CONNECTOR_URL?: string;
}
