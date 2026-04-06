# Create KV Namespace

The OAuth provider stores tokens and grants in a Cloudflare KV namespace.

## Create the Namespace

Run this command from your terminal (not through VS Code's integrated terminal due to Node version issues):

```bash
cd /Users/jackivers/Projects/skillport/skillport-connector
wrangler kv namespace create OAUTH_KV
```

You'll see output like:

```
🌀 Creating namespace with title "skillport-connector-OAUTH_KV"
✨ Success!
Add the following to your configuration file in your kv_namespaces array:
[[kv_namespaces]]
binding = "OAUTH_KV"
id = "abc123def456..."
```

## Update wrangler.toml

Copy the `id` value and update `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "OAUTH_KV"
id = "abc123def456..."  # Replace with your actual ID
```

## Preview Namespace (Optional)

For development, you can also create a preview namespace:

```bash
wrangler kv namespace create OAUTH_KV --preview
```

Then add it to wrangler.toml:

```toml
[[kv_namespaces]]
binding = "OAUTH_KV"
id = "abc123def456..."
preview_id = "xyz789..."  # Optional: for wrangler dev --remote
```

## Local Development Note

When running `wrangler dev` locally, Miniflare simulates KV storage automatically. The namespace ID in wrangler.toml is only used for:
- `wrangler dev --remote` (runs against real Cloudflare)
- `wrangler deploy` (production deployment)

## Verify

After updating wrangler.toml, the dev server should show:

```
Your worker has access to the following bindings:
- KV Namespaces:
  - OAUTH_KV: abc123def456... [simulated locally]
```
