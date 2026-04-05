interface Env {
  // KV namespace for OAuth tokens, CLI codes, and CLI bundle
  OAUTH_KV: KVNamespace;

  // Google OAuth credentials
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;

  // Optional: Restrict to specific Google Workspace domains
  GOOGLE_ALLOWED_DOMAINS?: string;

  // GitHub service token for API access (read-only)
  GITHUB_SERVICE_TOKEN: string;

  // GitHub write token for editor operations (optional)
  GITHUB_WRITE_TOKEN?: string;

  // Marketplace repository (e.g., "your-org/your-marketplace")
  MARKETPLACE_REPO: string;

  // Deployed connector URL
  CONNECTOR_URL?: string;

  // Durable Object binding for MCP
  MCP_OBJECT: DurableObjectNamespace;
}
