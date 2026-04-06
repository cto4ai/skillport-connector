# Local Secrets Configuration

Create the `.dev.vars` file for local development.

## Step 1: Copy the Example File

```bash
cp .dev.vars.example .dev.vars
```

## Step 2: Generate Cookie Encryption Key

Generate a random 32+ character string:

```bash
openssl rand -hex 32
```

This outputs something like:
```
a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6
```

## Step 3: Fill in All Values

Edit `.dev.vars` with your actual values:

```bash
# Google OAuth credentials (from Google Cloud Console)
GOOGLE_CLIENT_ID=123456789-abcdefghij.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-actual-secret

# GitHub Personal Access Token (for API access to marketplace repo)
GITHUB_SERVICE_TOKEN=ghp_your_actual_token_here

# Session encryption key (the one you generated above)
COOKIE_ENCRYPTION_KEY=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6
```

## Step 4: Verify .gitignore

Ensure `.dev.vars` is in `.gitignore`:

```bash
grep ".dev.vars" .gitignore
```

Should output:
```
.dev.vars
```

If not, add it:
```bash
echo ".dev.vars" >> .gitignore
```

## Checklist

Before proceeding, verify you have:

- [ ] `GOOGLE_CLIENT_ID` - From Google Cloud Console
- [ ] `GOOGLE_CLIENT_SECRET` - From Google Cloud Console
- [ ] `GITHUB_SERVICE_TOKEN` - From GitHub Settings
- [ ] `COOKIE_ENCRYPTION_KEY` - Generated with openssl
- [ ] `.dev.vars` is gitignored

## Common Issues

### "Missing environment variable" errors
- Ensure all four variables are set in `.dev.vars`
- Check for typos in variable names
- No spaces around `=` signs

### Secrets not loading
- File must be named exactly `.dev.vars` (not `.dev.vars.local` or similar)
- File must be in the project root directory
- Restart `wrangler dev` after changes

## Production Secrets

For production deployment, use Wrangler to set secrets:

```bash
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put GITHUB_SERVICE_TOKEN
wrangler secret put COOKIE_ENCRYPTION_KEY
```

Each command will prompt you to enter the secret value.
