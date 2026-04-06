# Wrangler Multi-Account Authentication Bug

**Date:** 2026-01-19
**Status:** Known issue, workarounds available

## Problem

When deploying with `wrangler deploy`, you may encounter:

```
✘ [ERROR] A request to the Cloudflare API (/accounts/XXXXXX/workers/services/...) failed.

  Authentication error [code: 10000]
```

The error occurs when:
- Your Cloudflare profile has multiple accounts
- Wrangler sends requests to the correct account but authenticates against a different one
- The account ID in the error URL doesn't match the account ID shown in `wrangler whoami`

## Root Cause

This is a known bug in Wrangler's OAuth handling with multiple accounts. When a profile has multiple accounts, wrangler can get confused about which account's credentials to use, even after logging out and back in.

Users report:
- Error occurs 50-90% of the time
- Logout/login cycles don't reliably fix it
- The bug has persisted across multiple wrangler versions (2023-2026)

## Workarounds

### 1. Retry (Sometimes Works)

Simply retry the deploy command multiple times. Some users report success after 2-3 attempts.

### 2. Use API Token Instead of OAuth (Recommended)

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens)
2. Create token using **"Edit Cloudflare Workers"** template
3. Add additional permissions if needed (R2, D1, KV, etc.)
4. Create `.env` file in project root:
   ```
   CLOUDFLARE_API_TOKEN=your_token_here
   ```
5. Run `wrangler deploy` - it will use the token instead of OAuth

### 3. Clear Cached Credentials

```bash
rm -rf ~/Library/Preferences/.wrangler
rm -rf node_modules/.cache
wrangler logout
wrangler login
```

This works inconsistently but worth trying before setting up API tokens.

### 4. Specify Account ID Explicitly

Add to `wrangler.toml`:
```toml
account_id = "your_correct_account_id_here"
```

This ensures wrangler targets the right account, though may not fix the auth mismatch.

## References

- [GitHub Issue #8956](https://github.com/cloudflare/workers-sdk/issues/8956) - Authentication error when profile has multiple accounts (April 2025)
- [GitHub Issue #10364](https://github.com/cloudflare/workers-sdk/issues/10364) - Random deployment failures due to auth error (August 2025)
- [GitHub Issue #2678](https://github.com/cloudflare/workers-sdk/issues/2678) - Original authentication error bug report
- [GitHub Issue #3977](https://github.com/cloudflare/workers-sdk/issues/3977) - Related auth error reports
- [Cloudflare Community Thread](https://community.cloudflare.com/t/wranger-deploy-authentication-error-code-10000/844629) - Community discussion and workarounds
- [AnswerOverflow Thread](https://www.answeroverflow.com/m/1398272506590138388) - Random auth errors when listing workflows

## Notes for This Project

The skillport-connector project uses account `4af1c4653be7ce0e6e628dc6b3dd870a` (Jack.ivers@gmail.com). If you encounter this error, the API token workaround is the most reliable solution.
