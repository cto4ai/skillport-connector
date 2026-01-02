# Phase 1: Scaffold from Cloudflare Template

## Objective

Set up the project structure based on Cloudflare's `remote-mcp-github-oauth` template, preserving our existing docs and configuration.

## Source Template

```
https://github.com/cloudflare/ai/tree/main/demos/remote-mcp-github-oauth
```

## Steps

### 1. Install Dependencies

```bash
npm install @cloudflare/workers-oauth-provider @modelcontextprotocol/sdk hono
npm install -D @cloudflare/workers-types wrangler typescript
```

### 2. Update package.json

```json
{
  "name": "skillport-connector",
  "version": "0.1.0",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "cf-typegen": "wrangler types"
  },
  "dependencies": {
    "@cloudflare/workers-oauth-provider": "^0.0.4",
    "@modelcontextprotocol/sdk": "^1.0.0",
    "hono": "^4.0.0"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20241205.0",
    "typescript": "^5.3.0",
    "wrangler": "^3.99.0"
  }
}
```

### 3. Update wrangler.toml

```toml
name = "skillport-connector"
main = "src/index.ts"
compatibility_date = "2024-12-01"
compatibility_flags = ["nodejs_compat"]

[vars]
MARKETPLACE_REPO = "cto4ai/skillport-marketplace-template"

[[kv_namespaces]]
binding = "OAUTH_KV"
id = "create-via-wrangler"

# Create KV namespace:
# wrangler kv namespace create OAUTH_KV
```

### 4. Create tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
```

### 5. Create worker-configuration.d.ts

```typescript
interface Env {
  OAUTH_KV: KVNamespace;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GITHUB_SERVICE_TOKEN: string;
  MARKETPLACE_REPO: string;
  COOKIE_ENCRYPTION_KEY: string;
}
```

### 6. Create .dev.vars.example

```bash
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GITHUB_SERVICE_TOKEN=ghp_your_token_here
COOKIE_ENCRYPTION_KEY=generate-32-char-random-string
```

### 7. Update .gitignore

Add:
```
.dev.vars
.wrangler/
```

## File Structure After Scaffold

```
skillport-connector/
├── src/
│   ├── index.ts              # Main entry point
│   ├── google-handler.ts     # Google OAuth (Phase 2)
│   └── github-client.ts      # GitHub API client (Phase 3)
├── docs/
│   └── (existing docs)
├── .claude/
│   └── (existing config)
├── package.json
├── wrangler.toml
├── tsconfig.json
├── worker-configuration.d.ts
├── .dev.vars.example
├── .gitignore
├── CLAUDE.md
└── README.md
```

## Verification

```bash
# Install dependencies
npm install

# Generate types
npm run cf-typegen

# Should start without errors (will fail on auth, but server runs)
npm run dev
```

## Notes

- Keep existing `docs/`, `.claude/`, `CLAUDE.md`, `README.md`
- The scaffold provides infrastructure; business logic comes in later phases
- KV namespace must be created before deploy
