/**
 * Skillport Connector - MCP Server for Plugin Marketplaces
 *
 * This is a Cloudflare Worker that exposes a Plugin Marketplace
 * to Claude.ai and Claude Desktop via the MCP protocol.
 *
 * Architecture:
 * - Google OAuth for user authentication
 * - GitHub service token for marketplace access
 * - MCP tools for browsing and fetching plugins
 * - REST API for token-based skill installation (PTC pattern)
 */

import { OAuthProvider } from "@cloudflare/workers-oauth-provider";
import googleHandler from "./google-handler";
import { SkillportMCP } from "./mcp-server";
import { GitHubClient } from "./github-client";

// Export the MCP server class for Durable Objects
export { SkillportMCP };

// Create the OAuth provider
const oauthProvider = new OAuthProvider({
  apiRoute: ["/sse", "/sse/message", "/mcp"],
  apiHandler: SkillportMCP.mount("/sse"),
  defaultHandler: googleHandler,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
});

/**
 * Handle install token redemption
 * Token-based installation for Programmatic Tool Calling (PTC) pattern
 */
async function handleInstallToken(
  token: string,
  env: Env
): Promise<Response> {
  // Validate token format
  if (!token || !token.startsWith("sk_install_")) {
    return Response.json(
      { error: "Invalid token format" },
      { status: 400 }
    );
  }

  // Look up token in KV
  const tokenKey = `install_token:${token}`;
  const tokenDataStr = await env.OAUTH_KV.get(tokenKey);

  if (!tokenDataStr) {
    return Response.json(
      { error: "Token not found or expired" },
      { status: 404 }
    );
  }

  const tokenData = JSON.parse(tokenDataStr) as {
    skill: string;
    version: string;
    user: string;
    created: number;
    used: boolean;
  };

  if (tokenData.used) {
    return Response.json(
      { error: "Token already used" },
      { status: 410 }
    );
  }

  // Mark as used immediately (before fetching skill to prevent race conditions)
  const usedTokenData = {
    ...tokenData,
    used: true,
    usedAt: Date.now(),
  };
  await env.OAUTH_KV.put(tokenKey, JSON.stringify(usedTokenData), {
    expirationTtl: 60, // Keep briefly for debugging
  });

  // Fetch all skill files
  try {
    const github = new GitHubClient(
      env.GITHUB_SERVICE_TOKEN,
      env.MARKETPLACE_REPO,
      env.OAUTH_KV
    );
    const { skill, files } = await github.fetchSkill(tokenData.skill);

    return Response.json(
      {
        skill: {
          name: skill.name,
          version: skill.version,
        },
        files: files.map((f) => ({
          path: f.path,
          content: f.content,
          ...(f.encoding ? { encoding: f.encoding } : {}),
        })),
      },
      {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    return Response.json(
      {
        error: "Failed to fetch skill",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * Serve the install.sh script
 * This script is used by the PTC pattern to install skills efficiently
 */
function serveInstallScript(env: Env): Response {
  const connectorUrl =
    env.CONNECTOR_URL || "https://skillport-connector.jack-ivers.workers.dev";

  const script = `#!/bin/bash
set -e

# ============================================================================
# Skillport Installer
# Efficient skill installation using Programmatic Tool Calling (PTC)
# ============================================================================

TOKEN="$1"
PACKAGE_FLAG="$2"
CONNECTOR_URL="\${SKILLPORT_CONNECTOR_URL:-${connectorUrl}}"

# Colors for output
RED='\\033[0;31m'
GREEN='\\033[0;32m'
YELLOW='\\033[1;33m'
NC='\\033[0m' # No Color

# ----------------------------------------------------------------------------
# Validation
# ----------------------------------------------------------------------------

if [ -z "$TOKEN" ]; then
  echo -e "\${RED}Error: No install token provided\${NC}"
  echo ""
  echo "Usage: install.sh <token> [--package]"
  echo ""
  echo "Get a token by asking Claude: 'install <skill-name> from skillport'"
  exit 1
fi

if [[ ! "$TOKEN" =~ ^sk_install_ ]]; then
  echo -e "\${RED}Error: Invalid token format\${NC}"
  echo "Token should start with 'sk_install_'"
  exit 1
fi

# ----------------------------------------------------------------------------
# Determine output location
# ----------------------------------------------------------------------------

if [ "$PACKAGE_FLAG" = "--package" ]; then
  # Claude.ai/Desktop mode: write to temp dir, then package
  OUTPUT_DIR=$(mktemp -d)
  PACKAGE_MODE=true
  echo -e "\${YELLOW}Package mode: will create .skill file\${NC}"
else
  # Claude Code mode: write directly to skills directory
  OUTPUT_DIR="$HOME/.claude/skills"
  PACKAGE_MODE=false
  mkdir -p "$OUTPUT_DIR"
fi

# Export for Python script (must be before heredoc)
export OUTPUT_DIR
export PACKAGE_MODE

# ----------------------------------------------------------------------------
# Fetch skill via token
# ----------------------------------------------------------------------------

echo "Fetching skill..."

# Use -s for silent, but NOT -f so we get the response body on errors
HTTP_CODE=$(curl -s -w "%{http_code}" -o /tmp/skillport_response.json "$CONNECTOR_URL/api/install/$TOKEN")

if [ "$HTTP_CODE" != "200" ]; then
  echo -e "\${RED}Error: Failed to fetch skill (HTTP $HTTP_CODE)\${NC}"

  # Try to parse error message from response
  ERROR_MSG=$(python3 -c "import json; d=json.load(open('/tmp/skillport_response.json')); print(d.get('error','Unknown error'))" 2>/dev/null) || ERROR_MSG="Unknown error"
  echo "$ERROR_MSG"
  rm -f /tmp/skillport_response.json
  exit 1
fi

# ----------------------------------------------------------------------------
# Parse and write files
# ----------------------------------------------------------------------------

python3 << 'PYTHON_SCRIPT'
import json
import os

data = json.load(open('/tmp/skillport_response.json'))

if 'error' in data:
    import sys
    print(f"\\033[0;31mError: {data['error']}\\033[0m", file=sys.stderr)
    sys.exit(1)

skill_name = data['skill']['name']
skill_version = data['skill']['version']
output_base = os.environ.get('OUTPUT_DIR', os.path.expanduser('~/.claude/skills'))
skill_dir = os.path.join(output_base, skill_name)

print(f"Installing {skill_name} v{skill_version}...")

# Track files written
files_written = 0

for f in data.get('files', []):
    rel_path = f['path']
    content = f['content']

    # Handle base64-encoded files (may be binary)
    is_binary = f.get('encoding') == 'base64'
    if is_binary:
        import base64
        content = base64.b64decode(content)

    file_path = os.path.join(skill_dir, rel_path)
    dir_path = os.path.dirname(file_path)

    # Create directory if needed
    os.makedirs(dir_path, exist_ok=True)

    # Write file (binary mode for base64, text mode otherwise)
    if is_binary:
        with open(file_path, 'wb') as out:
            out.write(content)
    else:
        with open(file_path, 'w') as out:
            out.write(content)

    # Make scripts executable
    if rel_path.endswith('.py') or rel_path.endswith('.sh'):
        os.chmod(file_path, 0o755)

    files_written += 1
    print(f"  ✓ {rel_path}")

# Write metadata for package mode
if os.environ.get('PACKAGE_MODE') == 'true':
    # Store skill name for packaging step
    with open(os.path.join(output_base, '.skill_name'), 'w') as f:
        f.write(skill_name)
    with open(os.path.join(output_base, '.skill_version'), 'w') as f:
        f.write(skill_version)

print(f"\\n\\033[0;32m✓ Wrote {files_written} files to {skill_dir}\\033[0m")
PYTHON_SCRIPT

# Cleanup temp file
rm -f /tmp/skillport_response.json

# ----------------------------------------------------------------------------
# Package mode: create .skill zip
# ----------------------------------------------------------------------------

if [ "$PACKAGE_MODE" = true ]; then
  SKILL_NAME=$(cat "$OUTPUT_DIR/.skill_name")
  SKILL_VERSION=$(cat "$OUTPUT_DIR/.skill_version")
  SKILL_DIR="$OUTPUT_DIR/$SKILL_NAME"

  # Determine where to put the .skill file
  # Use current directory or /tmp if not writable
  if [ -w "$(pwd)" ]; then
    PACKAGE_DIR="$(pwd)"
  else
    PACKAGE_DIR="/tmp"
  fi

  SKILL_FILE="$PACKAGE_DIR/$SKILL_NAME.skill"

  echo ""
  echo "Creating package..."

  # Create zip with skill name as root directory
  cd "$OUTPUT_DIR"
  zip -rq "$SKILL_FILE" "$SKILL_NAME"

  echo -e "\${GREEN}✓ Created $SKILL_FILE\${NC}"
  echo ""
  echo "Next steps:"
  echo "  1. Claude will present this file"
  echo "  2. Click 'Copy to your skills'"
  echo "  3. Start a new conversation to use the skill"

  # Output the path for Claude to use with present_files
  echo ""
  echo "SKILL_FILE=$SKILL_FILE"

  # Cleanup temp directory
  rm -rf "$OUTPUT_DIR"
else
  # Claude Code mode
  echo ""
  echo -e "\${GREEN}✓ Installation complete\${NC}"
  echo ""
  echo "Next step: Start a new Claude Code conversation to use this skill."
fi
`;

  return new Response(script, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}

/**
 * Wrapper to add missing CORS headers required by Claude.ai
 * The @cloudflare/workers-oauth-provider doesn't include Access-Control-Expose-Headers
 * which is required for Claude to read the WWW-Authenticate header
 */
export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);

    // Handle REST API routes BEFORE OAuth provider
    // These don't require OAuth - token is the auth

    // Serve install script
    if (url.pathname === "/install.sh") {
      return serveInstallScript(env);
    }

    // Handle token redemption
    if (url.pathname.startsWith("/api/install/")) {
      const token = url.pathname.split("/")[3];
      return handleInstallToken(token, env);
    }

    // Delegate to OAuth provider for MCP routes
    const response = await oauthProvider.fetch(request, env, ctx);

    // Add Access-Control-Expose-Headers if Origin is present (CORS request)
    const origin = request.headers.get("Origin");
    if (origin) {
      const newResponse = new Response(response.body, response);
      // Expose WWW-Authenticate header so Claude can read the auth challenge
      newResponse.headers.set(
        "Access-Control-Expose-Headers",
        "WWW-Authenticate"
      );
      return newResponse;
    }

    return response;
  },
};
