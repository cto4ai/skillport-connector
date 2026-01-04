# Deployment to Cloudflare Workers

Deploy the Skillport Connector to production.

## Prerequisites

- Local testing completed (steps 01-06)
- Wrangler CLI authenticated (`wrangler login`)
- Cloudflare account with Workers enabled

## Step 1: Set Production Secrets

Set each secret via Wrangler (you'll be prompted to paste the value):

```bash
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put GITHUB_SERVICE_TOKEN
wrangler secret put COOKIE_ENCRYPTION_KEY
```

Use the same values from your `.dev.vars` file.

## Step 2: Update Google OAuth Redirect URI

After deployment, you'll get a production URL like:
```
https://skillport-connector.<your-subdomain>.workers.dev
```

Add this to Google Cloud Console:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **APIs & Services > Credentials**
3. Click your OAuth 2.0 Client ID
4. Under **Authorized redirect URIs**, add:
   ```
   https://skillport-connector.<your-subdomain>.workers.dev/callback
   ```
5. Click **Save**

## Step 3: Deploy

```bash
npm run deploy
```

Or directly:
```bash
wrangler deploy
```

Expected output:
```
Deployed skillport-connector (1.00 sec)
  https://skillport-connector.<subdomain>.workers.dev
```

## Step 4: Verify Deployment

### Check the worker is running
```bash
curl https://skillport-connector.<subdomain>.workers.dev/
```

Should redirect to Google OAuth or return the MCP endpoint info.

### Test with MCP Inspector

1. Open [MCP Inspector](https://modelcontextprotocol.io/inspector)
2. Set the SSE URL to your production endpoint:
   ```
   https://skillport-connector.<subdomain>.workers.dev/sse
   ```
3. Complete OAuth flow
4. Verify `list_plugins` returns the marketplace data

## KV Namespace Notes

The `wrangler.toml` uses a single KV namespace ID for both local and production. This means:
- OAuth tokens are shared between environments
- Simpler configuration

For production isolation, create a separate namespace:
```bash
wrangler kv namespace create OAUTH_KV_PROD
```
Then update `wrangler.toml` with environment-specific bindings.

## Custom Domain (Optional)

To use a custom domain instead of `workers.dev`:

1. Go to Cloudflare Dashboard > Workers & Pages
2. Select your worker
3. Click **Settings > Triggers**
4. Add a custom domain (must be on Cloudflare DNS)
5. Update Google OAuth redirect URIs accordingly

## Troubleshooting

### "Missing environment variable" errors
- Verify all secrets are set: `wrangler secret list`
- Re-set any missing secrets

### OAuth redirect errors
- Ensure the production callback URL is added in Google Cloud Console
- Check the URL matches exactly (including https://)

### 500 errors
- Check worker logs: `wrangler tail`
- Look for missing bindings or configuration issues

## Rollback

If something goes wrong:
```bash
wrangler rollback
```

This reverts to the previous deployment.
