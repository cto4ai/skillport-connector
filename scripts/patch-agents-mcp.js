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
 */

const fs = require('fs');
const path = require('path');

const AGENTS_MCP_PATH = path.join(
  __dirname,
  '../node_modules/agents/dist/mcp/index.js'
);

function applyPatch() {
  if (!fs.existsSync(AGENTS_MCP_PATH)) {
    console.log('⚠️  Agents MCP module not found, skipping patch');
    return;
  }

  let content = fs.readFileSync(AGENTS_MCP_PATH, 'utf8');
  let patched = false;

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

  if (content.includes(oldCode)) {
    content = content.replace(oldCode, newCode);
    patched = true;
    console.log('✓ Patched streamable HTTP transport to pass user props');
  } else if (content.includes(newCode)) {
    console.log('✓ Streamable HTTP props already patched');
  } else {
    console.log('⚠️  Could not find code to patch - agents package may have changed');
  }

  if (patched) {
    fs.writeFileSync(AGENTS_MCP_PATH, content);
    console.log('✓ Agents MCP module patched successfully');
  }
}

try {
  applyPatch();
} catch (error) {
  console.error('❌ Failed to patch agents MCP module:', error.message);
  process.exit(1);
}
