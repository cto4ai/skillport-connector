#!/usr/bin/env node
/**
 * Patch @cloudflare/workers-oauth-provider for audience matching fix
 *
 * This fixes GitHub issue #108: "Audience validation fails for RFC 8707
 * resource indicators with path"
 *
 * The fix will be in a future release. Until then, this patch is needed.
 * See: https://github.com/cloudflare/workers-oauth-provider/issues/108
 */

const fs = require('fs');
const path = require('path');

const OAUTH_PROVIDER_PATH = path.join(
  __dirname,
  '../node_modules/@cloudflare/workers-oauth-provider/dist/oauth-provider.js'
);

function applyPatch() {
  if (!fs.existsSync(OAUTH_PROVIDER_PATH)) {
    console.log('⚠️  OAuth provider not found, skipping patch');
    return;
  }

  let content = fs.readFileSync(OAUTH_PROVIDER_PATH, 'utf8');
  let patched = false;

  // Patch 1: Add pathname to resourceServer calculation
  // Before: const resourceServer = `${requestUrl.protocol}//${requestUrl.host}`;
  // After:  const resourceServer = `${requestUrl.protocol}//${requestUrl.host}${requestUrl.pathname}`;
  const oldResourceServer = 'const resourceServer = `${requestUrl.protocol}//${requestUrl.host}`;';
  const newResourceServer = 'const resourceServer = `${requestUrl.protocol}//${requestUrl.host}${requestUrl.pathname}`;';

  if (content.includes(oldResourceServer)) {
    content = content.split(oldResourceServer).join(newResourceServer);
    patched = true;
    console.log('✓ Patched resourceServer calculation');
  } else if (content.includes(newResourceServer)) {
    console.log('✓ resourceServer already patched');
  }

  // Patch 2: Smart audience matching (prefix match for backward compatibility)
  // Before: return resourceServerUrl === audienceValue;
  // After:  return resourceServerUrl === audienceValue || resourceServerUrl.startsWith(audienceValue);
  const oldAudienceMatch = 'return resourceServerUrl === audienceValue;';
  const newAudienceMatch = 'return resourceServerUrl === audienceValue || resourceServerUrl.startsWith(audienceValue);';

  if (content.includes(oldAudienceMatch)) {
    content = content.split(oldAudienceMatch).join(newAudienceMatch);
    patched = true;
    console.log('✓ Patched audienceMatches function');
  } else if (content.includes(newAudienceMatch)) {
    console.log('✓ audienceMatches already patched');
  }

  if (patched) {
    fs.writeFileSync(OAUTH_PROVIDER_PATH, content);
    console.log('✓ OAuth provider patched successfully');
  } else {
    console.log('ℹ️  No patches needed');
  }
}

try {
  applyPatch();
} catch (error) {
  console.error('❌ Failed to patch OAuth provider:', error.message);
  process.exit(1);
}
