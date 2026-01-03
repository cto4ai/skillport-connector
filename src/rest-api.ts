/**
 * REST API Handler for Skillport
 *
 * Exposes all Skillport operations as HTTP endpoints.
 * Authentication is via Bearer token obtained from the `skillport_auth` MCP tool.
 *
 * This enables the "single-tool + skill" architecture where:
 * - MCP provides only authentication (skillport_auth tool)
 * - Claude uses curl/Python to call REST API
 * - Skill (SKILL.md) teaches Claude how to use the API
 */

import { GitHubClient, parseSkillFrontmatter } from "./github-client";
import { AccessControl } from "./access-control";

// Token data stored in KV
interface TokenData {
  uid: string;
  provider: string;
  email: string;
  name: string;
  created: number;
}

/**
 * Validate Bearer token from Authorization header
 */
async function validateToken(
  request: Request,
  env: Env
): Promise<TokenData | null> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice(7);
  if (!token.startsWith("sk_api_")) {
    return null;
  }

  const data = await env.OAUTH_KV.get(`api_token:${token}`);
  if (!data) {
    return null;
  }

  return JSON.parse(data) as TokenData;
}

/**
 * Create JSON error response
 */
function errorResponse(
  error: string,
  message: string,
  status: number
): Response {
  return Response.json({ error, message }, { status });
}

/**
 * Create JSON success response
 */
function jsonResponse(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Get GitHub client for read operations
 */
function getGitHubClient(env: Env): GitHubClient {
  return new GitHubClient(
    env.GITHUB_SERVICE_TOKEN,
    env.MARKETPLACE_REPO,
    env.OAUTH_KV
  );
}

/**
 * Get GitHub client for write operations
 */
function getWriteGitHubClient(env: Env): GitHubClient {
  const token = env.GITHUB_WRITE_TOKEN || env.GITHUB_SERVICE_TOKEN;
  return new GitHubClient(token, env.MARKETPLACE_REPO, env.OAUTH_KV);
}

/**
 * Get AccessControl for a user
 */
async function getAccessControl(
  env: Env,
  provider: string,
  uid: string
): Promise<AccessControl> {
  const github = getGitHubClient(env);
  const config = await github.fetchAccessConfig();
  return new AccessControl(config, provider, uid);
}

/**
 * Log user action for audit trail
 */
function logAction(
  email: string,
  action: string,
  opts?: { plugin?: string; skill?: string; skill_group?: string }
): void {
  const timestamp = new Date().toISOString();
  const pluginInfo = opts?.plugin ? ` plugin=${opts.plugin}` : "";
  const skillInfo = opts?.skill ? ` skill=${opts.skill}` : "";
  const groupInfo = opts?.skill_group ? ` skill_group=${opts.skill_group}` : "";
  console.log(
    `[AUDIT] ${timestamp} user=${email} action=api:${action}${pluginInfo}${skillInfo}${groupInfo}`
  );
}

/**
 * Validate file path to prevent path traversal
 */
function validateFilePath(filePath: string): string | null {
  if (!filePath || filePath.trim() === "") {
    return null;
  }
  if (filePath.startsWith("/")) {
    return null;
  }

  const segments = filePath.split("/");
  const normalized: string[] = [];

  for (const segment of segments) {
    if (segment === "" || segment === ".") {
      continue;
    }
    if (segment === "..") {
      return null;
    }
    normalized.push(segment);
  }

  if (normalized.length === 0) {
    return null;
  }

  return normalized.join("/");
}

// ============================================================
// API Handlers
// ============================================================

/**
 * GET /api/skills - List all skills
 */
async function handleListSkills(
  env: Env,
  user: TokenData
): Promise<Response> {
  try {
    logAction(user.email, "list_skills");
    const github = getGitHubClient(env);
    const accessControl = await getAccessControl(env, user.provider, user.uid);
    const allSkills = await github.listSkills();

    const visibleSkills = allSkills.filter((s) =>
      accessControl.canRead(s.plugin)
    );

    return jsonResponse({
      count: visibleSkills.length,
      skills: visibleSkills.map((s) => ({
        name: s.name,
        plugin: s.plugin,
        description: s.description,
        version: s.version,
        author: s.author,
        category: s.category,
        tags: s.tags,
        keywords: s.keywords,
        editable: accessControl.canWrite(s.plugin),
      })),
    });
  } catch (error) {
    return errorResponse(
      "Failed to list skills",
      error instanceof Error ? error.message : String(error),
      500
    );
  }
}

/**
 * GET /api/skills/:name - Get skill details
 */
async function handleGetSkill(
  env: Env,
  user: TokenData,
  skillName: string
): Promise<Response> {
  try {
    logAction(user.email, "get_skill", { skill: skillName });
    const github = getGitHubClient(env);
    const accessControl = await getAccessControl(env, user.provider, user.uid);

    if (!accessControl.canRead(skillName)) {
      return errorResponse(
        "Access denied",
        "You don't have access to this skill",
        403
      );
    }

    const skill = await github.getSkill(skillName);
    if (!skill) {
      return errorResponse(
        "Skill not found",
        `Skill '${skillName}' not found`,
        404
      );
    }

    const skillMd = await github.fetchSkillMd(skillName);

    return jsonResponse({
      skill: {
        name: skill.name,
        version: skill.version,
        description: skill.description,
        plugin: skill.plugin,
        category: skill.category,
        tags: skill.tags,
        keywords: skill.keywords,
      },
      skill_md: skillMd,
      editable: accessControl.canWrite(skill.plugin),
    });
  } catch (error) {
    return errorResponse(
      "Failed to fetch skill",
      error instanceof Error ? error.message : String(error),
      500
    );
  }
}

/**
 * GET /api/skills/:name/install - Get install token and command
 */
async function handleInstallSkill(
  env: Env,
  user: TokenData,
  skillName: string
): Promise<Response> {
  try {
    logAction(user.email, "install_skill", { skill: skillName });
    const github = getGitHubClient(env);
    const accessControl = await getAccessControl(env, user.provider, user.uid);

    if (!accessControl.canRead(skillName)) {
      return errorResponse(
        "Access denied",
        "You don't have access to this skill",
        403
      );
    }

    const skill = await github.getSkill(skillName);
    if (!skill) {
      return errorResponse(
        "Skill not found",
        `Skill '${skillName}' not found`,
        404
      );
    }

    // Generate install token
    const tokenBytes = new Uint8Array(24);
    crypto.getRandomValues(tokenBytes);
    const installToken =
      "sk_install_" +
      btoa(String.fromCharCode(...tokenBytes))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");

    await env.OAUTH_KV.put(
      `install_token:${installToken}`,
      JSON.stringify({
        skill: skillName,
        version: skill.version,
        user: user.email,
        created: Date.now(),
        used: false,
      }),
      { expirationTtl: 300 }
    );

    const connectorUrl =
      env.CONNECTOR_URL || "https://skillport-connector.jack-ivers.workers.dev";

    return jsonResponse({
      install_token: installToken,
      skill: skillName,
      version: skill.version,
      expires_in: 300,
      command: `curl -sf ${connectorUrl}/install.sh | bash -s -- ${installToken} --package`,
    });
  } catch (error) {
    return errorResponse(
      "Failed to create install token",
      error instanceof Error ? error.message : String(error),
      500
    );
  }
}

/**
 * GET /api/skills/:name/edit - Get edit token and command
 */
async function handleEditSkill(
  env: Env,
  user: TokenData,
  skillName: string
): Promise<Response> {
  try {
    logAction(user.email, "edit_skill", { skill: skillName });
    const github = getGitHubClient(env);
    const accessControl = await getAccessControl(env, user.provider, user.uid);

    const skill = await github.getSkill(skillName);
    if (!skill) {
      return errorResponse(
        "Skill not found",
        `Skill '${skillName}' not found`,
        404
      );
    }

    if (!accessControl.canWrite(skill.plugin)) {
      return errorResponse(
        "Access denied",
        `You don't have write access to edit skill '${skillName}'`,
        403
      );
    }

    // Generate edit token
    const tokenBytes = new Uint8Array(24);
    crypto.getRandomValues(tokenBytes);
    const editToken =
      "sk_edit_" +
      btoa(String.fromCharCode(...tokenBytes))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");

    await env.OAUTH_KV.put(
      `edit_token:${editToken}`,
      JSON.stringify({
        skill: skillName,
        plugin: skill.plugin,
        dirName: skill.dirName,
        version: skill.version,
        user: user.email,
        created: Date.now(),
        used: false,
      }),
      { expirationTtl: 300 }
    );

    const connectorUrl =
      env.CONNECTOR_URL || "https://skillport-connector.jack-ivers.workers.dev";

    return jsonResponse({
      edit_token: editToken,
      skill: skillName,
      plugin: skill.plugin,
      version: skill.version,
      expires_in: 300,
      command: `curl -sf ${connectorUrl}/edit.sh | bash -s -- ${editToken}`,
    });
  } catch (error) {
    return errorResponse(
      "Failed to create edit token",
      error instanceof Error ? error.message : String(error),
      500
    );
  }
}

/**
 * POST /api/skills/:name - Save skill files
 */
async function handleSaveSkill(
  env: Env,
  user: TokenData,
  skillName: string,
  body: {
    skill_group?: string;
    files: Array<{ path: string; content: string }>;
    commitMessage?: string;
  }
): Promise<Response> {
  try {
    const { skill_group, files, commitMessage } = body;

    if (!files || !Array.isArray(files) || files.length === 0) {
      return errorResponse(
        "Invalid request",
        "files array is required",
        400
      );
    }

    const github = getGitHubClient(env);
    const accessControl = await getAccessControl(env, user.provider, user.uid);

    const existingSkill = await github.getSkill(skillName);

    let groupName: string;
    let isNewSkill = false;
    let isNewGroup = false;

    if (existingSkill) {
      groupName = existingSkill.plugin;
    } else {
      isNewSkill = true;

      if (!accessControl.isEditor()) {
        return errorResponse(
          "Access denied",
          "Only editors can create new skills",
          403
        );
      }

      groupName = skill_group || skillName;

      const groupPath = `plugins/${groupName}`;
      const groupExists = await github.fileExists(
        `${groupPath}/.claude-plugin/plugin.json`
      );
      if (!groupExists) {
        isNewGroup = true;
      }
    }

    if (!accessControl.canWrite(groupName)) {
      return errorResponse(
        "Access denied",
        `You don't have write access to skill group "${groupName}"`,
        403
      );
    }

    logAction(user.email, "save_skill", {
      skill: skillName,
      skill_group: groupName,
    });

    const writeClient = getWriteGitHubClient(env);

    // Get base path
    let basePath: string;
    try {
      const { entry } = await github.getPlugin(groupName);
      basePath = entry.source.replace("./", "");
    } catch {
      basePath = `plugins/${groupName}`;
    }

    // Validate files
    const skillDirName = existingSkill?.dirName || skillName;
    const skillPrefix = `skills/${skillDirName}/`;
    const filesToWrite: Array<{
      path: string;
      content: string;
      fullPath: string;
    }> = [];
    const filesToDelete: Array<{ path: string; fullPath: string }> = [];

    for (const file of files) {
      const sanitizedPath = validateFilePath(file.path);
      if (!sanitizedPath) {
        return errorResponse(
          "Invalid file path",
          `Path "${file.path}" is invalid`,
          400
        );
      }

      const isSkillMd =
        sanitizedPath === "SKILL.md" || sanitizedPath === "./SKILL.md";
      if (isSkillMd && file.content === "") {
        return errorResponse(
          "Cannot delete SKILL.md",
          "SKILL.md is required and cannot be deleted",
          400
        );
      }

      const fullPath = `${skillPrefix}${sanitizedPath}`;

      if (file.content === "") {
        filesToDelete.push({ path: file.path, fullPath });
      } else {
        filesToWrite.push({ path: file.path, content: file.content, fullPath });
      }
    }

    // Validate SKILL.md frontmatter
    const skillMdFile = filesToWrite.find(
      (f) => f.path === "SKILL.md" || f.path === "./SKILL.md"
    );

    if (isNewSkill && !skillMdFile) {
      return errorResponse(
        "Missing SKILL.md",
        "New skills must include SKILL.md with name and description frontmatter",
        400
      );
    }

    if (skillMdFile) {
      const frontmatter = parseSkillFrontmatter(skillMdFile.content);
      const missingFields: string[] = [];
      if (!frontmatter.name) missingFields.push("name");
      if (!frontmatter.description) missingFields.push("description");

      if (missingFields.length > 0) {
        return errorResponse(
          "Invalid SKILL.md frontmatter",
          `SKILL.md must have ${missingFields.join(" and ")} in frontmatter`,
          400
        );
      }
    }

    // Create group if needed
    if (isNewGroup) {
      const groupPath = `plugins/${groupName}`;
      const manifest = {
        name: groupName,
        version: "1.0.0",
        description: skill_group
          ? `Skill group: ${groupName}`
          : `Skill: ${skillName}`,
        author: { name: user.name, email: user.email },
        license: "MIT",
        keywords: [],
      };

      await writeClient.createFile(
        `${groupPath}/.claude-plugin/plugin.json`,
        JSON.stringify(manifest, null, 2),
        `Create ${groupName} skill group\n\nRequested by: ${user.email}`
      );
    }

    const results: Array<{
      path: string;
      created?: boolean;
      deleted?: boolean;
    }> = [];
    const baseMessage = commitMessage || `Update ${skillName} skill files`;

    // Write files
    for (const file of filesToWrite) {
      const absolutePath = `${basePath}/${file.fullPath}`;
      const fileMessage = `${baseMessage}\n\nFile: ${file.fullPath}\nRequested by: ${user.email}`;

      const { created } = await writeClient.upsertFile(
        absolutePath,
        file.content,
        fileMessage
      );
      results.push({ path: absolutePath, created });
    }

    // Delete files
    for (const file of filesToDelete) {
      const absolutePath = `${basePath}/${file.fullPath}`;
      const fileMessage = `Delete ${file.path}\n\nRequested by: ${user.email}`;

      try {
        await writeClient.deleteFile(absolutePath, fileMessage);
        results.push({ path: absolutePath, deleted: true });
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes("File not found")
        ) {
          // Skip silently
        } else {
          throw error;
        }
      }
    }

    // Clear caches
    await github.clearCache(groupName);
    await github.clearSkillDirCache(groupName, skillDirName);

    const created = results.filter((r) => r.created === true).length;
    const updated = results.filter((r) => r.created === false).length;
    const deleted = results.filter((r) => r.deleted === true).length;

    const summaryParts: string[] = [];
    if (created > 0) summaryParts.push(`${created} file(s) created`);
    if (updated > 0) summaryParts.push(`${updated} file(s) updated`);
    if (deleted > 0) summaryParts.push(`${deleted} file(s) deleted`);
    const summary = summaryParts.join(", ") || "No changes";

    return jsonResponse({
      success: true,
      skill: skillName,
      skill_group: groupName,
      isNewSkill,
      isNewGroup,
      files: results,
      summary,
    });
  } catch (error) {
    return errorResponse(
      "Failed to save skill",
      error instanceof Error ? error.message : String(error),
      500
    );
  }
}

/**
 * DELETE /api/skills/:name - Delete skill
 */
async function handleDeleteSkill(
  env: Env,
  user: TokenData,
  skillName: string,
  confirm: boolean
): Promise<Response> {
  try {
    if (!confirm) {
      return errorResponse(
        "Confirmation required",
        "Set confirm=true to delete the skill",
        400
      );
    }

    const github = getGitHubClient(env);
    const accessControl = await getAccessControl(env, user.provider, user.uid);

    const skill = await github.getSkill(skillName);
    if (!skill) {
      return errorResponse(
        "Skill not found",
        `Skill "${skillName}" not found`,
        404
      );
    }

    if (!accessControl.canWrite(skill.plugin)) {
      return errorResponse(
        "Access denied",
        `You don't have write access to skill group "${skill.plugin}"`,
        403
      );
    }

    logAction(user.email, "delete_skill", {
      skill: skillName,
      plugin: skill.plugin,
    });

    const writeClient = getWriteGitHubClient(env);

    const skillDirCount = await github.countSkillDirectories(skill.plugin);
    const isLastSkillInPlugin = skillDirCount === 1;

    let deletedFiles: string[];
    let pluginDeleted = false;

    if (isLastSkillInPlugin) {
      const pluginPath = `plugins/${skill.plugin}`;
      const result = await writeClient.deleteDirectory(
        pluginPath,
        `Delete plugin ${skill.plugin} (last skill removed)\n\nRequested by: ${user.email}`
      );
      deletedFiles = result.deletedFiles;
      pluginDeleted = true;

      try {
        await writeClient.removeFromMarketplace(skill.plugin, user.email);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        if (!errMsg.includes("not found in marketplace")) {
          throw err;
        }
      }
    } else {
      const skillDirPath = `plugins/${skill.plugin}/skills/${skill.dirName}`;
      const result = await writeClient.deleteDirectory(
        skillDirPath,
        `Delete skill ${skillName}\n\nRequested by: ${user.email}`
      );
      deletedFiles = result.deletedFiles;
    }

    // Clear caches
    await github.clearCache(skill.plugin);
    await github.clearSkillDirCache(skill.plugin, skill.dirName);
    if (pluginDeleted) {
      await github.clearCache();
    }

    return jsonResponse({
      success: true,
      skill: skillName,
      plugin: skill.plugin,
      pluginDeleted,
      deletedFiles,
    });
  } catch (error) {
    return errorResponse(
      "Failed to delete skill",
      error instanceof Error ? error.message : String(error),
      500
    );
  }
}

/**
 * POST /api/skills/:name/bump - Bump version
 */
async function handleBumpVersion(
  env: Env,
  user: TokenData,
  skillName: string,
  type: "major" | "minor" | "patch"
): Promise<Response> {
  try {
    const github = getGitHubClient(env);

    const skill = await github.getSkill(skillName);
    if (!skill) {
      return errorResponse(
        "Skill not found",
        `Skill "${skillName}" not found`,
        404
      );
    }

    const groupName = skill.plugin;
    const accessControl = await getAccessControl(env, user.provider, user.uid);

    if (!accessControl.canWrite(groupName)) {
      return errorResponse(
        "Access denied",
        `You don't have write access to skill group "${groupName}"`,
        403
      );
    }

    logAction(user.email, "bump_version", {
      skill: skillName,
      skill_group: groupName,
    });

    let entry, manifest;
    try {
      const result = await github.getPlugin(groupName);
      entry = result.entry;
      manifest = result.manifest;
    } catch {
      return errorResponse(
        "Skill not published",
        `Skill "${skillName}" is not published. Use publish endpoint first.`,
        400
      );
    }

    const currentVersion = manifest?.version || entry.version || "1.0.0";
    const [major, minor, patch] = currentVersion.split(".").map(Number);

    const newVersion =
      type === "major"
        ? `${major + 1}.0.0`
        : type === "minor"
          ? `${major}.${minor + 1}.0`
          : `${major}.${minor}.${patch + 1}`;

    const writeClient = getWriteGitHubClient(env);
    const basePath = entry.source.replace("./", "");

    if (manifest) {
      const manifestPath = `${basePath}/.claude-plugin/plugin.json`;
      const updatedManifest = { ...manifest, version: newVersion };
      await writeClient.updateFile(
        manifestPath,
        JSON.stringify(updatedManifest, null, 2),
        `Bump ${groupName} version to ${newVersion}\n\nRequested by: ${user.email}`
      );
    }

    await writeClient.updateMarketplaceVersion(
      groupName,
      newVersion,
      user.email
    );

    await github.clearCache(groupName);
    await github.clearCache();

    return jsonResponse({
      success: true,
      skill: skillName,
      skill_group: groupName,
      oldVersion: currentVersion,
      newVersion,
    });
  } catch (error) {
    return errorResponse(
      "Failed to bump version",
      error instanceof Error ? error.message : String(error),
      500
    );
  }
}

/**
 * POST /api/skills/:name/publish - Publish skill
 */
async function handlePublishSkill(
  env: Env,
  user: TokenData,
  skillName: string,
  body: {
    description: string;
    category?: string;
    tags?: string[];
    keywords?: string[];
  }
): Promise<Response> {
  try {
    const { description, category, tags, keywords } = body;

    if (!description) {
      return errorResponse(
        "Invalid request",
        "description is required",
        400
      );
    }

    const accessControl = await getAccessControl(env, user.provider, user.uid);

    if (!accessControl.isEditor()) {
      return errorResponse(
        "Access denied",
        "Only editors can publish skills",
        403
      );
    }

    const github = getGitHubClient(env);

    const skill = await github.getSkill(skillName);
    if (!skill) {
      return errorResponse(
        "Skill not found",
        `Skill "${skillName}" not found. Use save_skill first.`,
        404
      );
    }

    const groupName = skill.plugin;
    logAction(user.email, "publish_skill", {
      skill: skillName,
      skill_group: groupName,
    });

    const writeClient = getWriteGitHubClient(env);

    const skillPath = `plugins/${groupName}/skills/${skill.dirName}/SKILL.md`;
    const skillExists = await github.fileExists(skillPath);
    if (!skillExists) {
      return errorResponse(
        "Skill files not found",
        `Skill file not found at ${skillPath}`,
        400
      );
    }

    await writeClient.addToMarketplace(
      { name: groupName, description, category, tags, keywords },
      user.email
    );

    return jsonResponse({
      success: true,
      skill: skillName,
      skill_group: groupName,
    });
  } catch (error) {
    return errorResponse(
      "Failed to publish skill",
      error instanceof Error ? error.message : String(error),
      500
    );
  }
}

/**
 * POST /api/check-updates - Check for updates
 */
async function handleCheckUpdates(
  env: Env,
  user: TokenData,
  installed: Array<{ name: string; version: string }>
): Promise<Response> {
  try {
    logAction(user.email, "check_updates");
    const github = getGitHubClient(env);
    const updates = await github.checkUpdates(installed);

    return jsonResponse({
      hasUpdates: updates.length > 0,
      updates,
    });
  } catch (error) {
    return errorResponse(
      "Failed to check updates",
      error instanceof Error ? error.message : String(error),
      500
    );
  }
}

/**
 * GET /api/whoami - Get user identity
 */
async function handleWhoami(user: TokenData): Promise<Response> {
  return jsonResponse({
    id: `${user.provider}:${user.uid}`,
    email: user.email,
    name: user.name,
    provider: user.provider,
  });
}

/**
 * GET /api/bootstrap/skill.md - Get Skillport SKILL.md for bootstrap
 */
async function handleBootstrapSkillMd(): Promise<Response> {
  const skillMd = `---
name: skillport
description: Manage skills from the Skillport marketplace. Search, install, create, edit, and publish skills. Requires calling skillport_auth MCP tool first to get an authenticated session.
---

# Skillport Skill

Skillport is a marketplace for Claude Skills. This skill teaches you how to interact with the Skillport API.

## Prerequisites

Before using any Skillport operation, you MUST get an auth token:

1. Call the \`skillport_auth\` MCP tool (no parameters needed)
2. You'll receive a \`token\` and \`base_url\`
3. The token expires in 5 minutes — get a new one if needed

## Quick Reference

| Operation | Method | Endpoint |
|-----------|--------|----------|
| List skills | GET | \`/api/skills\` |
| Get skill details | GET | \`/api/skills/{name}\` |
| Install skill | GET | \`/api/skills/{name}/install\` |
| Save skill | POST | \`/api/skills/{name}\` |
| Delete skill | DELETE | \`/api/skills/{name}?confirm=true\` |
| Bump version | POST | \`/api/skills/{name}/bump\` |
| Publish skill | POST | \`/api/skills/{name}/publish\` |
| Check updates | POST | \`/api/check-updates\` |
| Who am I | GET | \`/api/whoami\` |

## Operations

### List Available Skills

Find skills in the marketplace.

**Bash (simple):**
\`\`\`bash
curl -sf "\${base_url}/api/skills" -H "Authorization: Bearer \${token}"
\`\`\`

**Python (with filtering):**
\`\`\`python
import requests

response = requests.get(
    f"{base_url}/api/skills",
    headers={"Authorization": f"Bearer {token}"}
)
skills = response.json()["skills"]

# Filter by tag
data_skills = [s for s in skills if "data" in s.get("tags", [])]
for skill in data_skills:
    print(f"{skill['name']}: {skill['description']}")
\`\`\`

---

### Get Skill Details

View a skill's SKILL.md content and metadata.

\`\`\`bash
curl -sf "\${base_url}/api/skills/soil-analyzer" -H "Authorization: Bearer \${token}"
\`\`\`

Response includes \`skill_md\` with the full SKILL.md content.

---

### Install a Skill

Download a skill package for the user to install.

**Step 1: Get install command**
\`\`\`bash
curl -sf "\${base_url}/api/skills/soil-analyzer/install" -H "Authorization: Bearer \${token}"
\`\`\`

**Step 2: Execute the returned command**
The response includes a \`command\` field. Execute it:
\`\`\`bash
curl -sf \${base_url}/install.sh | bash -s -- \${install_token} --package
\`\`\`

**Step 3: Present the file**
Find the \`SKILL_FILE=\` path in the output and call \`present_files\` with it.

**Step 4: Instruct user**
Tell the user to:
1. Download the .zip file
2. Go to Claude Settings > Capabilities > Skills
3. Upload the .zip
4. Start a new conversation

---

### Create or Update a Skill

Save skill files to the marketplace.

**Python (recommended for multi-file operations):**
\`\`\`python
import requests
import json

skill_md = """---
name: my-skill
description: Does something useful
---

# My Skill

Instructions for using this skill...
"""

payload = {
    "skill_group": "my-skills",  # Optional for new skills
    "files": [
        {"path": "SKILL.md", "content": skill_md},
        {"path": "scripts/helper.py", "content": "# helper code..."}
    ],
    "commitMessage": "Initial skill creation"
}

response = requests.post(
    f"{base_url}/api/skills/my-skill",
    headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    },
    json=payload
)
print(response.json())
\`\`\`

**Important notes:**
- \`SKILL.md\` is required and must have \`name\` and \`description\` in frontmatter
- Paths are relative to the skill directory
- Empty content string deletes a file (except SKILL.md)
- New skills require \`skill_group\` (defaults to skill name if omitted)

---

### Delete a Skill

Permanently remove a skill from the marketplace.

\`\`\`bash
curl -X DELETE "\${base_url}/api/skills/my-skill?confirm=true" \\
  -H "Authorization: Bearer \${token}"
\`\`\`

**Warning:** This is irreversible. The \`confirm=true\` parameter is required.

---

### Bump Version

Increment a skill's version number.

\`\`\`bash
curl -X POST "\${base_url}/api/skills/my-skill/bump" \\
  -H "Authorization: Bearer \${token}" \\
  -H "Content-Type: application/json" \\
  -d '{"type": "minor"}'
\`\`\`

Version types:
- \`patch\`: 1.0.0 → 1.0.1
- \`minor\`: 1.0.0 → 1.1.0
- \`major\`: 1.0.0 → 2.0.0

---

### Publish a Skill

Make a skill discoverable in the marketplace.

\`\`\`bash
curl -X POST "\${base_url}/api/skills/my-skill/publish" \\
  -H "Authorization: Bearer \${token}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "description": "Does something useful",
    "category": "productivity",
    "tags": ["automation"],
    "keywords": ["helper", "utility"]
  }'
\`\`\`

---

### Edit an Existing Skill

Download all files for local editing.

**Step 1: Get edit command**
\`\`\`bash
curl -sf "\${base_url}/api/skills/my-skill/edit" -H "Authorization: Bearer \${token}"
\`\`\`

**Step 2: Execute the returned command**
\`\`\`bash
curl -sf \${base_url}/edit.sh | bash -s -- \${edit_token}
\`\`\`

Files are downloaded to \`/tmp/skillport-edit/{skill}/\`.

**Step 3: Make changes locally**

**Step 4: Save changes**
Use the Save Skill operation with the modified files.

---

### Check for Updates

See if installed skills have newer versions.

\`\`\`bash
curl -X POST "\${base_url}/api/check-updates" \\
  -H "Authorization: Bearer \${token}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "installed": [
      {"name": "soil-analyzer", "version": "1.0.0"},
      {"name": "csv-toolkit", "version": "2.1.0"}
    ]
  }'
\`\`\`

---

### Get User Identity

Find out who you're authenticated as.

\`\`\`bash
curl -sf "\${base_url}/api/whoami" -H "Authorization: Bearer \${token}"
\`\`\`

Useful for adding yourself as an editor in \`.skillport/access.json\`.

---

## Multi-Step Workflows

For complex operations, use Python to chain API calls:

\`\`\`python
import requests

def skillport_api(method, endpoint, token, base_url, data=None):
    """Helper for Skillport API calls"""
    response = requests.request(
        method,
        f"{base_url}{endpoint}",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        },
        json=data
    )
    response.raise_for_status()
    return response.json()

# Example: Find and update all outdated skills
skills = skillport_api("GET", "/api/skills", token, base_url)["skills"]
my_skills = [s for s in skills if s["editable"]]

for skill in my_skills:
    details = skillport_api("GET", f"/api/skills/{skill['name']}", token, base_url)

    if needs_update(details):  # Your logic here
        print(f"Updating {skill['name']}...")
        # Make updates...
\`\`\`

---

## Error Handling

All API errors return:
\`\`\`json
{
  "error": "Error type",
  "message": "Human-readable description"
}
\`\`\`

Common errors:
- \`401 Unauthorized\`: Token expired or invalid — call \`skillport_auth\` again
- \`403 Forbidden\`: You don't have access to this skill/operation
- \`404 Not Found\`: Skill doesn't exist
- \`400 Bad Request\`: Invalid parameters (check the message for details)

---

## Tips

1. **Token expiration**: Tokens last 5 minutes. For long workflows, check for 401 errors and refresh.

2. **Bash vs Python**: Use bash/curl for simple single operations. Use Python for anything involving loops, conditionals, or JSON processing.

3. **present_files**: After downloading skill packages, always use \`present_files\` to give the user access.

4. **New conversations**: After a user installs a skill, they need to start a new conversation for Claude to see it.
`;

  return new Response(skillMd, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

// ============================================================
// Main Router
// ============================================================

/**
 * Handle REST API requests
 */
export async function handleAPI(
  request: Request,
  env: Env
): Promise<Response> {
  const url = new URL(request.url);
  const method = request.method;

  // Validate token
  const user = await validateToken(request, env);
  if (!user) {
    return errorResponse(
      "Unauthorized",
      "Invalid or expired token. Call skillport_auth to get a new token.",
      401
    );
  }

  // Parse path
  const pathParts = url.pathname.replace("/api/", "").split("/");

  // Route: GET /api/skills
  if (pathParts[0] === "skills" && pathParts.length === 1 && method === "GET") {
    return handleListSkills(env, user);
  }

  // Route: GET /api/skills/:name
  if (pathParts[0] === "skills" && pathParts.length === 2 && method === "GET") {
    return handleGetSkill(env, user, pathParts[1]);
  }

  // Route: GET /api/skills/:name/install
  if (
    pathParts[0] === "skills" &&
    pathParts.length === 3 &&
    pathParts[2] === "install" &&
    method === "GET"
  ) {
    return handleInstallSkill(env, user, pathParts[1]);
  }

  // Route: GET /api/skills/:name/edit
  if (
    pathParts[0] === "skills" &&
    pathParts.length === 3 &&
    pathParts[2] === "edit" &&
    method === "GET"
  ) {
    return handleEditSkill(env, user, pathParts[1]);
  }

  // Route: POST /api/skills/:name
  if (
    pathParts[0] === "skills" &&
    pathParts.length === 2 &&
    method === "POST"
  ) {
    const body = await request.json();
    return handleSaveSkill(env, user, pathParts[1], body as {
      skill_group?: string;
      files: Array<{ path: string; content: string }>;
      commitMessage?: string;
    });
  }

  // Route: DELETE /api/skills/:name
  if (
    pathParts[0] === "skills" &&
    pathParts.length === 2 &&
    method === "DELETE"
  ) {
    const confirm = url.searchParams.get("confirm") === "true";
    return handleDeleteSkill(env, user, pathParts[1], confirm);
  }

  // Route: POST /api/skills/:name/bump
  if (
    pathParts[0] === "skills" &&
    pathParts.length === 3 &&
    pathParts[2] === "bump" &&
    method === "POST"
  ) {
    const body = await request.json() as { type: "major" | "minor" | "patch" };
    return handleBumpVersion(env, user, pathParts[1], body.type);
  }

  // Route: POST /api/skills/:name/publish
  if (
    pathParts[0] === "skills" &&
    pathParts.length === 3 &&
    pathParts[2] === "publish" &&
    method === "POST"
  ) {
    const body = await request.json();
    return handlePublishSkill(env, user, pathParts[1], body as {
      description: string;
      category?: string;
      tags?: string[];
      keywords?: string[];
    });
  }

  // Route: POST /api/check-updates
  if (pathParts[0] === "check-updates" && method === "POST") {
    const body = await request.json() as {
      installed: Array<{ name: string; version: string }>;
    };
    return handleCheckUpdates(env, user, body.installed);
  }

  // Route: GET /api/whoami
  if (pathParts[0] === "whoami" && method === "GET") {
    return handleWhoami(user);
  }

  // Route: GET /api/bootstrap/skill.md
  if (
    pathParts[0] === "bootstrap" &&
    pathParts[1] === "skill.md" &&
    method === "GET"
  ) {
    return handleBootstrapSkillMd();
  }

  // Not found
  return errorResponse("Not found", `Unknown endpoint: ${url.pathname}`, 404);
}
