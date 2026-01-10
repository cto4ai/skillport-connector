#!/usr/bin/env node
/**
 * Patch agents package for streamable HTTP props fix
 *
 * This fixes missing user props in the streamable HTTP transport (.serve()).
 * The SSE transport (.mount()) correctly calls doStub._init(ctx.props),
 * but the streamable HTTP transport was missing this call, causing
 * user identity (uid, provider, email, name) to be undefined.
 *
 * Bug found: 2026-01-09
 * Package version: agents@0.0.72
 *
 * If this patch fails, check if:
 * 1. The agents package version changed - verify if bug is fixed upstream
 * 2. The package structure changed - update AGENTS_MCP_PATH
 * 3. The code pattern changed - update oldCode/newCode patterns
 */

const fs = require('fs');
const path = require('path');

const AGENTS_MCP_PATH = path.join(
  __dirname,
  '../node_modules/agents/dist/mcp/index.js'
);

function applyPatch() {
  // Fail if agents module not found - required dependency
  if (!fs.existsSync(AGENTS_MCP_PATH)) {
    console.error('❌ Agents MCP module not found at:', AGENTS_MCP_PATH);
    console.error('   This is a required dependency. Run: npm install');
    process.exit(1);
  }

  let content = fs.readFileSync(AGENTS_MCP_PATH, 'utf8');

  // Patch: Add _init(ctx.props) call in streamable HTTP transport
  // The SSE transport has this at line ~398, but streamable HTTP was missing it
  //
  // Before:
  //   if (isInitializationRequest) {
  //     await doStub.setInitialized();
  //   }
  //
  // After:
  //   if (isInitializationRequest) {
  //     await doStub._init(ctx.props);
  //     await doStub.setInitialized();
  //   }

  const oldCode = `if (isInitializationRequest) {
            await doStub.setInitialized();
          }`;

  const newCode = `if (isInitializationRequest) {
            await doStub._init(ctx.props);
            await doStub.setInitialized();
          }`;

  if (content.includes(newCode)) {
    console.log('✓ Streamable HTTP props already patched');
    return;
  }

  if (!content.includes(oldCode)) {
    console.error('❌ Could not find code to patch in agents package');
    console.error('   The agents package may have changed. Check if:');
    console.error('   1. Bug is fixed upstream in newer agents version');
    console.error('   2. Code structure changed - update patch patterns');
    console.error('   See: docs/working/sse-to-streamable-http-migration/plan.md');
    process.exit(1);
  }

  // Apply patch
  content = content.replace(oldCode, newCode);
  fs.writeFileSync(AGENTS_MCP_PATH, content);

  // Verify patch persisted
  const verifyContent = fs.readFileSync(AGENTS_MCP_PATH, 'utf8');
  if (!verifyContent.includes(newCode)) {
    console.error('❌ Patch failed to persist to disk');
    process.exit(1);
  }

  console.log('✓ Patched streamable HTTP transport to pass user props');
  console.log('✓ Agents MCP module patched successfully');
}

try {
  applyPatch();
} catch (error) {
  console.error('❌ Failed to patch agents MCP module:', error.message);
  process.exit(1);
}
