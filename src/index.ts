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
import { handleAPI } from "./rest-api";

// Export the MCP server class for Durable Objects
export { SkillportMCP };

// Create handlers for both transports
const sseHandler = SkillportMCP.mount("/sse");  // SSE for Claude.ai/Desktop/Inspector
const httpHandler = SkillportMCP.serve("/mcp"); // Streamable HTTP for Claude Code

// Combined handler that routes based on path
const combinedMcpHandler = {
  fetch: (request: Request, env: Env, ctx: ExecutionContext) => {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/sse")) {
      return sseHandler.fetch(request, env, ctx);
    }
    return httpHandler.fetch(request, env, ctx);
  }
};

// Create the OAuth provider with both transports
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const oauthProvider = new OAuthProvider({
  apiRoute: ["/mcp", "/sse", "/sse/message"],
  apiHandler: combinedMcpHandler as any,
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
      { error: "Invalid token format", message: "Token should start with 'sk_install_'" },
      { status: 400 }
    );
  }

  // Look up token in KV
  const tokenKey = `install_token:${token}`;
  const tokenDataStr = await env.OAUTH_KV.get(tokenKey);

  if (!tokenDataStr) {
    return Response.json(
      { error: "Token not found or expired", message: "Get a new token by asking Claude to install the skill again" },
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
      { error: "Token already used", message: "Each install token can only be used once. Request a new one." },
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
        skill_name: skill.name,
        skill_version: skill.version,
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
    env.CONNECTOR_URL || "https://your-connector.workers.dev";

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
# Fetch skill via token (with retry for transient errors)
# ----------------------------------------------------------------------------

echo "Fetching skill..."

MAX_RETRIES=3
RETRY_DELAY=2
ATTEMPT=1

while [ $ATTEMPT -le $MAX_RETRIES ]; do
  # Use -s for silent, but NOT -f so we get the response body on errors
  HTTP_CODE=$(curl -s -w "%{http_code}" -o /tmp/skillport_response.json "$CONNECTOR_URL/api/install/$TOKEN")

  if [ "$HTTP_CODE" = "200" ]; then
    break
  fi

  # Transient errors (5xx) should be retried
  if [ "$HTTP_CODE" -ge 500 ] && [ $ATTEMPT -lt $MAX_RETRIES ]; then
    echo -e "\${YELLOW}Server error (HTTP $HTTP_CODE), retrying in \${RETRY_DELAY}s... (attempt $ATTEMPT/$MAX_RETRIES)\${NC}"
    sleep $RETRY_DELAY
    RETRY_DELAY=$((RETRY_DELAY * 2))
    ATTEMPT=$((ATTEMPT + 1))
    continue
  fi

  # Non-retryable error or max retries reached
  echo -e "\${RED}Error: Failed to fetch skill (HTTP $HTTP_CODE)\${NC}"

  # Try to parse error details from JSON response
  if [ -f /tmp/skillport_response.json ]; then
    ERROR_MSG=$(python3 -c "
import json
try:
    d = json.load(open('/tmp/skillport_response.json'))
    error = d.get('error', '')
    message = d.get('message', '')
    if error and message:
        print(f'{error}: {message}')
    elif error:
        print(error)
    else:
        # Show raw response if no error field
        print(open('/tmp/skillport_response.json').read()[:200])
except (json.JSONDecodeError, KeyError, TypeError):
    # JSON parse failed, show raw response
    print(open('/tmp/skillport_response.json').read()[:200])
" 2>/dev/null) || ERROR_MSG="No response body"
    echo "$ERROR_MSG"
  fi

  rm -f /tmp/skillport_response.json
  exit 1
done

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

  # Always use /tmp for package output (Claude.ai's cwd is / which creates ugly paths)
  PACKAGE_DIR="/tmp"

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
 * Handle edit token redemption
 * Token-based file fetching for editing skills (PTC pattern)
 */
async function handleEditToken(
  token: string,
  env: Env
): Promise<Response> {
  // Validate token format
  if (!token || !token.startsWith("sk_edit_")) {
    return Response.json(
      { error: "Invalid token format", message: "Token should start with 'sk_edit_'" },
      { status: 400 }
    );
  }

  // Look up token in KV
  const tokenKey = `edit_token:${token}`;
  const tokenDataStr = await env.OAUTH_KV.get(tokenKey);

  if (!tokenDataStr) {
    return Response.json(
      { error: "Token not found or expired", message: "Get a new token via the edit API endpoint" },
      { status: 404 }
    );
  }

  const tokenData = JSON.parse(tokenDataStr) as {
    skill: string;
    plugin: string;
    dirName: string;
    version: string;
    user: string;
    created: number;
    used: boolean;
  };

  if (tokenData.used) {
    return Response.json(
      { error: "Token already used", message: "Each edit token can only be used once. Request a new one." },
      { status: 410 }
    );
  }

  // Mark as used immediately
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
    // Skip cache for editing to ensure fresh files
    const { skill, files } = await github.fetchSkill(tokenData.skill, { skipCache: true });

    return Response.json(
      {
        skill_name: skill.name,
        skill_version: skill.version,
        skill_plugin: skill.plugin,
        skill: {
          name: skill.name,
          plugin: skill.plugin,
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
        error: "Failed to fetch skill for editing",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * Serve the edit.sh script
 * This script is used by the PTC pattern to download skill files for editing
 */
function serveEditScript(env: Env): Response {
  const connectorUrl =
    env.CONNECTOR_URL || "https://your-connector.workers.dev";

  const script = `#!/bin/bash
set -e

# ============================================================================
# Skillport Editor
# Download skill files for editing using Programmatic Tool Calling (PTC)
# ============================================================================

TOKEN="$1"
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
  echo -e "\${RED}Error: No edit token provided\${NC}"
  echo ""
  echo "Usage: edit.sh <token>"
  echo ""
  echo "Get a token by calling fetch_skill_for_editing via the Skillport connector."
  exit 1
fi

if [[ ! "$TOKEN" =~ ^sk_edit_ ]]; then
  echo -e "\${RED}Error: Invalid token format\${NC}"
  echo "Token should start with 'sk_edit_'"
  exit 1
fi

# ----------------------------------------------------------------------------
# Output location
# ----------------------------------------------------------------------------

OUTPUT_BASE="/tmp/skillport-edit"
mkdir -p "$OUTPUT_BASE"

# Export for Python script
export OUTPUT_BASE

# ----------------------------------------------------------------------------
# Fetch skill via token (with retry for transient errors)
# ----------------------------------------------------------------------------

echo "Fetching skill files for editing..."

MAX_RETRIES=3
RETRY_DELAY=2
ATTEMPT=1

while [ $ATTEMPT -le $MAX_RETRIES ]; do
  # Use -s for silent, but NOT -f so we get the response body on errors
  HTTP_CODE=$(curl -s -w "%{http_code}" -o /tmp/skillport_edit_response.json "$CONNECTOR_URL/api/edit/$TOKEN")

  if [ "$HTTP_CODE" = "200" ]; then
    break
  fi

  # Transient errors (5xx) should be retried
  if [ "$HTTP_CODE" -ge 500 ] && [ $ATTEMPT -lt $MAX_RETRIES ]; then
    echo -e "\${YELLOW}Server error (HTTP $HTTP_CODE), retrying in \${RETRY_DELAY}s... (attempt $ATTEMPT/$MAX_RETRIES)\${NC}"
    sleep $RETRY_DELAY
    RETRY_DELAY=$((RETRY_DELAY * 2))
    ATTEMPT=$((ATTEMPT + 1))
    continue
  fi

  # Non-retryable error or max retries reached
  echo -e "\${RED}Error: Failed to fetch skill (HTTP $HTTP_CODE)\${NC}"

  # Try to parse error details from JSON response
  if [ -f /tmp/skillport_edit_response.json ]; then
    ERROR_MSG=$(python3 -c "
import json
try:
    d = json.load(open('/tmp/skillport_edit_response.json'))
    error = d.get('error', '')
    message = d.get('message', '')
    if error and message:
        print(f'{error}: {message}')
    elif error:
        print(error)
    else:
        # Show raw response if no error field
        print(open('/tmp/skillport_edit_response.json').read()[:200])
except (json.JSONDecodeError, KeyError, TypeError):
    # JSON parse failed, show raw response
    print(open('/tmp/skillport_edit_response.json').read()[:200])
" 2>/dev/null) || ERROR_MSG="No response body"
    echo "$ERROR_MSG"
  fi

  rm -f /tmp/skillport_edit_response.json
  exit 1
done

# ----------------------------------------------------------------------------
# Parse and write files
# ----------------------------------------------------------------------------

python3 << 'PYTHON_SCRIPT'
import json
import os

data = json.load(open('/tmp/skillport_edit_response.json'))

if 'error' in data:
    import sys
    print(f"\\033[0;31mError: {data['error']}\\033[0m", file=sys.stderr)
    sys.exit(1)

skill_name = data['skill']['name']
skill_version = data['skill']['version']
skill_plugin = data['skill'].get('plugin', skill_name)
output_base = os.environ.get('OUTPUT_BASE', '/tmp/skillport-edit')
skill_dir = os.path.join(output_base, skill_name)

print(f"Downloading {skill_name} v{skill_version} for editing...")

# Track files written
files_written = 0
file_list = []

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

    files_written += 1
    file_list.append(rel_path)
    print(f"  ✓ {rel_path}")

# Store skill info for reference
with open(os.path.join(skill_dir, '.edit_info'), 'w') as f:
    json.dump({
        'name': skill_name,
        'plugin': skill_plugin,
        'version': skill_version,
        'files': file_list
    }, f, indent=2)

print(f"\\n\\033[0;32m✓ Downloaded {files_written} files\\033[0m")
print(f"\\nSKILL_DIR={skill_dir}")
print("FILES:")
for f in file_list:
    print(f"  {f}")
PYTHON_SCRIPT

# Cleanup temp file
rm -f /tmp/skillport_edit_response.json
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
    // These use Bearer token auth (from skillport_auth MCP tool)

    // REST API endpoints (token-based auth)
    if (url.pathname.startsWith("/api/") && !url.pathname.startsWith("/api/install/") && !url.pathname.startsWith("/api/edit/")) {
      return handleAPI(request, env);
    }

    // PTC routes (install/edit token redemption)

    // Serve install script
    if (url.pathname === "/install.sh") {
      return serveInstallScript(env);
    }

    // Handle install token redemption
    if (url.pathname.startsWith("/api/install/")) {
      const token = url.pathname.split("/")[3];
      return handleInstallToken(token, env);
    }

    // Serve edit script
    if (url.pathname === "/edit.sh") {
      return serveEditScript(env);
    }

    // Handle edit token redemption
    if (url.pathname.startsWith("/api/edit/")) {
      const token = url.pathname.split("/")[3];
      return handleEditToken(token, env);
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
