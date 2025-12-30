# Google OAuth Setup

Configure Google Cloud Console for user authentication.

## Step 1: Create or Select a Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Note the project name for reference

## Step 2: Configure OAuth Consent Screen

1. Navigate to **APIs & Services > OAuth consent screen**
   <!-- 2. Choose user type: -->
   - **Internal**: Only users in your Google Workspace org (recommended for enterprise)
   - **External**: Any Google account (requires verification for production)
2. Fill in required fields:
   - App name: `Skillport Connector`
   - User support email: Your email
   - Developer contact: Your email
3. Scopes: Skip or leave defaults (scopes are requested at runtime in the code)
4. Save and continue

## Step 3: Create OAuth 2.0 Credentials

1. Navigate to **APIs & Services > Credentials**
2. Click **Create Credentials > OAuth client ID**
3. Application type: **Web application**
4. Name: `Skillport Connector`
5. Add Authorized redirect URIs:

### For Local Development

```
http://localhost:8787/callback
```

### For Production (after deployment)

```
https://skillport-connector.<your-subdomain>.workers.dev/callback
```

6. Click **Create**
7. Copy the **Client ID** and **Client Secret**

## Step 4: Store Credentials

Add to your `.dev.vars` file:

```
GOOGLE_CLIENT_ID=123456789-abcdefg.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-secret-here
```

## Domain Restriction (Optional)

To restrict access to users from a specific Google Workspace domain, uncomment and modify this code in `src/google-handler.ts`:

```typescript
// Verify user is from allowed domain
if (user.hd !== "your-domain.com") {
  return c.text("Unauthorized domain", 403);
}
```

## Troubleshooting

### "redirect_uri_mismatch" Error

- Ensure the redirect URI in Google Console exactly matches your callback URL
- Check for trailing slashes
- For local dev, use `http://localhost:8787/callback` (not https)

### "Access Denied" Error

- For Internal apps: User must be in your Workspace org
- For External apps: Add test users in OAuth consent screen during development

### Token Exchange Fails

- Verify client secret is correct
- Check that credentials haven't been regenerated
