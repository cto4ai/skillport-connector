# GitHub Service Token

Create a Personal Access Token (PAT) for accessing the marketplace repository.

## Why a Service Token?

The Skillport Connector uses a single GitHub service token to access the marketplace repo on behalf of all users. This means:
- Users don't need GitHub accounts
- Users don't need repository access
- All API calls are made with this token

## Step 1: Create Personal Access Token

1. Go to [GitHub Settings > Developer settings > Personal access tokens](https://github.com/settings/tokens)
2. Click **Generate new token (classic)** or use Fine-grained tokens

### Classic Token (Simpler)

1. Click **Generate new token (classic)**
2. Note: `Skillport Marketplace Access`
3. Expiration: Choose based on your needs (or "No expiration" for service accounts)
4. Select scopes:
   - For **public** marketplace repo: `public_repo`
   - For **private** marketplace repo: `repo` (full access)
5. Click **Generate token**
6. Copy the token immediately (you won't see it again)

### Fine-grained Token (More Secure)

1. Click **Generate new token** under Fine-grained tokens
2. Token name: `Skillport Marketplace Access`
3. Expiration: Set as needed
4. Repository access: **Only select repositories**
   - Select your marketplace repo (e.g., `cto4ai/skillport-template`)
5. Permissions:
   - Contents: **Read-only**
6. Click **Generate token**

## Step 2: Store Token

Add to your `.dev.vars` file:

```
GITHUB_SERVICE_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Or for fine-grained tokens:
```
GITHUB_SERVICE_TOKEN=github_pat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

## Step 3: Verify Access

Test that the token works:

```bash
curl -H "Authorization: token YOUR_TOKEN_HERE" \
  https://api.github.com/repos/cto4ai/skillport-template/contents/.claude-plugin/marketplace.json
```

You should see the marketplace.json content (or a 404 if it doesn't exist yet).

## Security Best Practices

1. **Use a dedicated service account**: Create a GitHub account specifically for this purpose
2. **Minimal permissions**: Use fine-grained tokens with read-only access
3. **Token rotation**: Set expiration and rotate regularly
4. **Never commit tokens**: Keep in `.dev.vars` (gitignored) or use `wrangler secret put`

## Rate Limits

GitHub API has rate limits:
- **Authenticated requests**: 5,000/hour
- **Unauthenticated**: 60/hour

The GitHubClient implements caching to minimize API calls:
- Marketplace data cached for 5 minutes
- Individual plugin files cached for 5 minutes

## Production Deployment

For production, set the secret via Wrangler:

```bash
wrangler secret put GITHUB_SERVICE_TOKEN
# Paste your token when prompted
```
