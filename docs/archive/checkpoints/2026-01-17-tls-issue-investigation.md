# TLS Issue Investigation - 2026-01-17

## Problem

Intermittent TLS certificate verification failures when Claude.ai and Claude Desktop connect to the Skillport connector via Anthropic's MCP proxy infrastructure.

## Error Pattern

```
upstream connect error or disconnect/reset before headers.
reset reason: remote connection failure,
transport failure reason: TLS_error:|268435581:SSL
routines:OPENSSL_internal:CERTIFICATE_VERIFY_FAILED:verify cert failed: verify SAN list
```

## Observations

### What Works vs Fails

| Client | Path | Status |
|--------|------|--------|
| Claude Code (direct curl) | Direct → Cloudflare | ✅ Works |
| Claude Desktop | Anthropic proxy → Cloudflare | ⚠️ Intermittent |
| Claude.ai | Anthropic proxy → Cloudflare | ⚠️ Intermittent |

### Endpoint-specific behavior (from Desktop testing)

| Endpoint | Without --insecure | With --insecure |
|----------|-------------------|-----------------|
| POST /api/check-updates | ✅ Worked | ✅ Worked |
| POST /api/skills/surface-detect | ❌ TLS error | ✅ Worked |
| GET /api/skills/surface-detect | ❌ TLS error | ❌ TLS error |
| GET /api/skills?refresh=true | ❌ TLS error | ❌ TLS error |

Key insight: GET requests failed even WITH `--insecure`, meaning the TLS failure was **upstream** (Worker → GitHub), not client-side.

### Certificate Info

Certificate is valid:
- Subject: CN=jack-ivers.workers.dev
- SAN: *.jack-ivers.workers.dev (matches skillport-connector.jack-ivers.workers.dev)
- Issuer: Google Trust Services (WE1)
- Valid: Dec 27 2025 - Mar 27 2026
- Chain verifies OK from local machine

## Hypotheses

1. **Cloudflare edge propagation during deployment** - Edge workers restart during deployment, causing brief certificate/connection issues

2. **Worker → GitHub API TLS issues** - Some endpoints make fresh GitHub API calls (when cache is cold), and GitHub connections fail intermittently

3. **Anthropic proxy caching** - Stale connection pools or certificate caching in Anthropic's MCP proxy infrastructure

4. **Connection reuse after re-auth** - User reported issues after re-authenticating connector without restarting Claude Desktop

## Affected Code Paths

### Endpoints that call GitHub

- `GET /api/skills` - calls `listSkills()` (5-min cache)
- `GET /api/skills/:name` - calls `getSkill()`, `fetchSkillMd()`, `listSkillFiles()`
- `GET /api/skills/:name/install` - calls `getAccessControl()`, `getSkill()`
- All write operations - call GitHub for reads then writes

### GitHub client fetch

```typescript
// src/github-client.ts
private async fetchFile(path: string): Promise<string> {
  const response = await fetch(
    `${GITHUB_API}/repos/${this.repo}/contents/${path}`,
    {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/vnd.github.v3.raw",
        "User-Agent": "Skillport-Connector/1.0",
      },
    }
  );
  // ...
}
```

No retry logic currently implemented.

## Potential Fixes

1. **Add retry logic to GitHub client** - Retry failed fetches with exponential backoff

2. **Increase cache TTL** - Reduce frequency of cold GitHub fetches (currently 5min for skills)

3. **Add connection timeouts** - Explicit timeouts on fetch() calls

4. **Warm cache on deploy** - Hit key endpoints after deployment to populate cache

## User Workaround

Claude.ai/Desktop can work around `/install` failures by:
1. Fetching skill content via `/api/skills/:name` (often cached)
2. Manually creating the .skill package
3. Using "Copy to your skills" button

## Status

- [ ] Root cause confirmed
- [x] Fix implemented (retry logic added)
- [x] Fix deployed (7c108a1)
- [ ] Fix verified
- [ ] TSIP account checked for stale deployments

## Error Detection & Logging

### Current Logging

The `fetchWithRetry` helper logs warnings on retry:
```
[fetchWithRetry] Attempt 1 failed: <error message>, retrying...
```

Visible via `wrangler tail`, but error messages for TLS failures are often generic.

### What We CAN Log (Worker → GitHub)

| Option | Description |
|--------|-------------|
| Enhanced context | Log full URL path, error type, stack trace on final failure |
| Error categorization | Detect TLS errors by keywords: `TLS`, `SSL`, `certificate`, `CERT` |
| Response headers | Add `X-Skillport-Retries`, `X-Skillport-Error-Type` to responses |
| Analytics Engine | Track error patterns over time with structured events |

Example categorization:
```typescript
const isTlsError = msg.includes('TLS') || msg.includes('SSL') ||
                   msg.includes('certificate') || msg.includes('CERT');
```

### What We CANNOT Log (Upstream)

**Anthropic proxy → Worker TLS errors cannot be logged by our code.**

These errors happen before the request reaches our Worker:
- Only visible in Claude client UI (the error messages user sees)
- Anthropic's MCP proxy infrastructure handles this connection
- We have no visibility into proxy connection pools, caching, or TLS handshakes

### Two Distinct Failure Points

```
Claude.ai/Desktop → [Anthropic Proxy] → [Our Worker] → [GitHub API]
                         ↑                    ↑
                    Can't log             Can log
                    (upstream)         (fetchWithRetry)
```

## Next Steps

1. ~~Add retry logic to GitHub client~~ ✅ Done
2. Check TSIP account for stale skillport-connector deployment
3. Consider caching access.json longer
4. Monitor if issue persists or was deployment-related
5. Consider enhanced error logging if issues persist
