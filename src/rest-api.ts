/**
 * REST API Handler for Skillport
 *
 * Exposes all Skillport operations as HTTP endpoints.
 * Authentication is via Bearer code obtained from `auth.get_code` via the MCP execute tool.
 *
 * This enables the "single-tool + skill" architecture where:
 * - MCP provides only authentication (skillport_auth tool)
 * - Claude uses curl/Python to call REST API
 * - Skill (SKILL.md) teaches Claude how to use the API
 */

import { GitHubClient, parseSkillFrontmatter } from "./github-client";
import { AccessControl } from "./access-control";
import { packageSkill } from "./skill-packager";

// Code data stored in KV (from MCP auth.get_code)
export interface CodeData {
  uid: string;
  provider: string;
  email: string;
  name: string;
  created: number;
}

/**
 * Validate CLI code from Authorization header.
 * The code is issued by MCP execute({ method: "auth.get_code" })
 * and stored in KV as cli_code:{code}.
 */
export async function validateCode(
  request: Request,
  env: Env,
): Promise<CodeData | null> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const code = authHeader.slice(7);
  const data = await env.OAUTH_KV.get(`cli_code:${code}`);
  if (!data) {
    return null;
  }

  return JSON.parse(data) as CodeData;
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
  opts?: { plugin?: string; skill?: string; skill_group?: string; surface?: string }
): void {
  const timestamp = new Date().toISOString();
  const pluginInfo = opts?.plugin ? ` plugin=${opts.plugin}` : "";
  const skillInfo = opts?.skill ? ` skill=${opts.skill}` : "";
  const groupInfo = opts?.skill_group ? ` skill_group=${opts.skill_group}` : "";
  const surfaceInfo = opts?.surface ? ` surface=${opts.surface}` : "";
  console.log(
    `[AUDIT] ${timestamp} user=${email} action=api:${action}${pluginInfo}${skillInfo}${groupInfo}${surfaceInfo}`
  );
}

/**
 * Validate skill or group name to prevent path traversal
 * Must match: lowercase letters, numbers, and hyphens only
 */
const VALID_NAME_PATTERN = /^[a-z0-9-]+$/;

function validateName(name: string): boolean {
  return VALID_NAME_PATTERN.test(name);
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
 * Query params:
 *   - refresh=true: Force cache refresh before listing
 *   - surface=CC|CD|CAI|CDAI|CALL: Filter by surface tag
 */
async function handleListSkills(
  env: Env,
  user: CodeData,
  options: { refresh?: boolean; surface?: string } = {}
): Promise<Response> {
  try {
    const actionName = options.refresh ? "list_skills_refresh" : "list_skills";
    logAction(user.email, actionName, options.surface ? { surface: options.surface } : undefined);
    const github = getGitHubClient(env);

    // Force cache refresh if requested
    if (options.refresh) {
      await github.clearCache();
      console.log(`[list_skills] Cache cleared for user ${user.email}`);
    }

    const accessControl = await getAccessControl(env, user.provider, user.uid);
    const allSkills = await github.listSkills({ surface: options.surface });

    // Access control is keyed by skill name
    const visibleSkills = allSkills.filter((s) =>
      accessControl.canRead(s.name)
    );

    return jsonResponse({
      count: visibleSkills.length,
      surface_filter: options.surface || null,
      skills: visibleSkills.map((s) => ({
        name: s.name,
        plugin: s.plugin,
        description: s.description,
        version: s.version,
        author: s.author,
        category: s.category,
        tags: s.tags,
        keywords: s.keywords,
        surface_tags: s.surface_tags,
        published: s.published,
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
  user: CodeData,
  skillName: string
): Promise<Response> {
  try {
    logAction(user.email, "get_skill", { skill: skillName });
    const github = getGitHubClient(env);
    const accessControl = await getAccessControl(env, user.provider, user.uid);

    // Access control is keyed by skill name
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

    // Fetch SKILL.md content and file list in parallel
    const [skillMd, files] = await Promise.all([
      github.fetchSkillMd(skillName),
      github.listSkillFiles(skillName),
    ]);

    return jsonResponse({
      skill: {
        name: skill.name,
        version: skill.version,
        description: skill.description,
        plugin: skill.plugin,
        category: skill.category,
        tags: skill.tags,
        keywords: skill.keywords,
        surface_tags: skill.surface_tags,
        published: skill.published,
      },
      skill_md: skillMd,
      files,
      // Write access is keyed by group name
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
 * GET /api/skills/:name/download - Download skill files with content
 * Returns full file content for writing to disk.
 */
async function handleDownloadSkill(
  env: Env,
  user: CodeData,
  skillName: string
): Promise<Response> {
  try {
    logAction(user.email, "download_skill", { skill: skillName });
    const github = getGitHubClient(env);
    const accessControl = await getAccessControl(env, user.provider, user.uid);

    if (!accessControl.canRead(skillName)) {
      return errorResponse(
        "Access denied",
        "You don't have access to this skill",
        403
      );
    }

    const { skill, plugin, files } = await github.fetchSkill(skillName);

    return jsonResponse({
      skill: {
        name: skill.name,
        version: skill.version,
        plugin: skill.plugin,
      },
      plugin: {
        name: plugin.name,
        version: plugin.version,
      },
      files: files.map((f) => ({
        path: f.path,
        content: f.content,
      })),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("not found") || msg.includes("Not Found")) {
      return errorResponse("Skill not found", `Skill '${skillName}' not found`, 404);
    }
    return errorResponse(
      "Failed to download skill",
      msg,
      500
    );
  }
}

/**
 * GET /api/skills/:name/package - Download skill as .skill ZIP (base64)
 */
async function handlePackageSkill(
  env: Env,
  user: CodeData,
  skillName: string
): Promise<Response> {
  try {
    logAction(user.email, "package_skill", { skill: skillName });
    const github = getGitHubClient(env);
    const accessControl = await getAccessControl(env, user.provider, user.uid);

    if (!accessControl.canRead(skillName)) {
      return errorResponse(
        "Access denied",
        "You don't have access to this skill",
        403
      );
    }

    const { skill, files } = await github.fetchSkill(skillName);
    const pkg = packageSkill(skill.name, files);

    return jsonResponse({
      skill: {
        name: skill.name,
        version: skill.version,
      },
      package: {
        filename: pkg.filename,
        content_base64: pkg.content_base64,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("not found") || msg.includes("Not Found")) {
      return errorResponse("Skill not found", `Skill '${skillName}' not found`, 404);
    }
    return errorResponse(
      "Failed to package skill",
      msg,
      500
    );
  }
}

/**
 * GET /api/skills/:name/install - Get install token and command
 */
async function handleInstallSkill(
  env: Env,
  user: CodeData,
  skillName: string
): Promise<Response> {
  try {
    logAction(user.email, "install_skill", { skill: skillName });
    const github = getGitHubClient(env);
    const accessControl = await getAccessControl(env, user.provider, user.uid);

    // Access control is keyed by skill name
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
      { expirationTtl: 900 }
    );

    const connectorUrl =
      env.CONNECTOR_URL || "https://your-connector.workers.dev";

    return jsonResponse({
      install_token: installToken,
      skill: skillName,
      version: skill.version,
      expires_in: 900,
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
  user: CodeData,
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

    // Write access is keyed by group name
    if (!accessControl.canWrite(skill.plugin)) {
      return errorResponse(
        "Access denied",
        `You don't have write access to group '${skill.plugin}'`,
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
      { expirationTtl: 900 }
    );

    const connectorUrl =
      env.CONNECTOR_URL || "https://your-connector.workers.dev";

    return jsonResponse({
      edit_token: editToken,
      skill: skillName,
      plugin: skill.plugin,
      version: skill.version,
      expires_in: 900,
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
  user: CodeData,
  skillName: string,
  body: {
    skill_group?: string;
    files: Array<{ path: string; content: string }>;
    commitMessage?: string;
    plugin_metadata?: {
      description: string;
      keywords?: string[];
      author?: { name?: string; email?: string };
      license?: string;
    };
  }
): Promise<Response> {
  try {
    const { skill_group, files, commitMessage, plugin_metadata } = body;

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

        // Require plugin_metadata with description for new plugins
        if (!plugin_metadata?.description) {
          return errorResponse(
            "Missing plugin metadata",
            "New plugins require plugin_metadata with a description field",
            400
          );
        }
      }
    }

    // Write access is keyed by group name
    if (!accessControl.canWrite(groupName)) {
      return errorResponse(
        "Access denied",
        `You don't have write access to group "${groupName}"`,
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

    // Create group if needed (plugin_metadata.description already validated above)
    if (isNewGroup && plugin_metadata) {
      const groupPath = `plugins/${groupName}`;
      const manifest = {
        name: groupName,
        version: "1.0.0",
        description: plugin_metadata.description,
        author: plugin_metadata.author || { name: user.name, email: user.email },
        license: plugin_metadata.license || "MIT",
        keywords: plugin_metadata.keywords || [],
      };

      await writeClient.createFile(
        `${groupPath}/.claude-plugin/plugin.json`,
        JSON.stringify(manifest, null, 2),
        `Create ${groupName} skill group\n\nRequested by: ${user.email}`
      );
    }

    // Update existing plugin.json if plugin_metadata provided for existing group
    if (!isNewGroup && plugin_metadata) {
      const groupPath = `plugins/${groupName}`;
      const pluginJsonPath = `${groupPath}/.claude-plugin/plugin.json`;

      // Try to fetch existing plugin.json
      let existingContent: string | null = null;
      try {
        existingContent = await github.getFileContent(pluginJsonPath);
      } catch (error) {
        // File doesn't exist - will create below
        console.log(`[save_skill] plugin.json not found for ${groupName}, will create`);
      }

      if (existingContent) {
        // Parse and merge with existing manifest
        let existingManifest: Record<string, unknown>;
        try {
          existingManifest = JSON.parse(existingContent);
        } catch (parseError) {
          console.error(`[save_skill] Invalid JSON in ${pluginJsonPath}:`, parseError);
          return errorResponse(
            "Invalid plugin.json",
            `The existing plugin.json for ${groupName} contains invalid JSON`,
            400
          );
        }

        const updatedManifest = {
          ...existingManifest,
          description: plugin_metadata.description,
          ...(plugin_metadata.keywords && { keywords: plugin_metadata.keywords }),
          ...(plugin_metadata.author && { author: plugin_metadata.author }),
          ...(plugin_metadata.license && { license: plugin_metadata.license }),
        };

        logAction(user.email, "update_plugin_metadata", { plugin: groupName });
        await writeClient.upsertFile(
          pluginJsonPath,
          JSON.stringify(updatedManifest, null, 2),
          `Update ${groupName} plugin metadata\n\nRequested by: ${user.email}`
        );
      } else {
        // Create new plugin.json
        const manifest = {
          name: groupName,
          version: "1.0.0",
          description: plugin_metadata.description,
          author: plugin_metadata.author || { name: user.name, email: user.email },
          license: plugin_metadata.license || "MIT",
          keywords: plugin_metadata.keywords || [],
        };

        logAction(user.email, "create_plugin_metadata", { plugin: groupName });
        await writeClient.createFile(
          pluginJsonPath,
          JSON.stringify(manifest, null, 2),
          `Create ${groupName} plugin metadata\n\nRequested by: ${user.email}`
        );
      }
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
  user: CodeData,
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

    // Write access is keyed by group name
    if (!accessControl.canWrite(skill.plugin)) {
      return errorResponse(
        "Access denied",
        `You don't have write access to group "${skill.plugin}"`,
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
  user: CodeData,
  skillName: string,
  type: "major" | "minor" | "patch"
): Promise<Response> {
  try {
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

    const groupName = skill.plugin;

    // Write access is keyed by group name
    if (!accessControl.canWrite(groupName)) {
      return errorResponse(
        "Access denied",
        `You don't have write access to group "${groupName}"`,
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
  user: CodeData,
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

    // Require at least one surface tag
    const validSurfaceTags = ["surface:CC", "surface:CD", "surface:CAI", "surface:CDAI", "surface:CALL"];
    const hasSurfaceTag = tags?.some(t => validSurfaceTags.includes(t));
    if (!hasSurfaceTag) {
      return errorResponse(
        "Invalid request",
        `At least one surface tag is required: ${validSurfaceTags.join(", ")}`,
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

    const { created } = await writeClient.upsertMarketplaceEntry(
      { name: groupName, description, category, tags, keywords },
      user.email
    );

    return jsonResponse({
      success: true,
      skill: skillName,
      skill_group: groupName,
      action: created ? "created" : "updated",
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
 * POST /api/skills/:name/deactivate - Deactivate a plugin
 */
async function handleDeactivatePlugin(
  env: Env,
  user: CodeData,
  pluginName: string
): Promise<Response> {
  try {
    logAction(user.email, "deactivate_plugin", { plugin: pluginName });
    const github = getGitHubClient(env);
    const accessControl = await getAccessControl(env, user.provider, user.uid);

    if (!accessControl.canWrite(pluginName)) {
      return errorResponse("Access denied", `You don't have write access to '${pluginName}'`, 403);
    }

    const writeClient = getWriteGitHubClient(env);
    const pluginJsonPath = `plugins/${pluginName}/.claude-plugin/plugin.json`;

    let pluginJson: Record<string, unknown>;
    try {
      const content = await github.getFileContent(pluginJsonPath);
      pluginJson = JSON.parse(content);
    } catch {
      return errorResponse("Plugin not found", `Plugin '${pluginName}' not found`, 404);
    }

    if (pluginJson.deactivated === true) {
      return errorResponse("Already deactivated", `'${pluginName}' is already deactivated`, 400);
    }

    pluginJson.deactivated = true;
    await writeClient.updateFile(
      pluginJsonPath,
      JSON.stringify(pluginJson, null, 2),
      `Deactivate ${pluginName}\n\nRequested by: ${user.email}`
    );

    try {
      await writeClient.removeFromMarketplace(pluginName, user.email);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (!errMsg.includes("not found in marketplace")) throw err;
    }

    await github.clearCache(pluginName);
    await github.clearCache();

    return jsonResponse({ success: true, plugin: pluginName, action: "deactivated" });
  } catch (error) {
    return errorResponse("Failed to deactivate", error instanceof Error ? error.message : String(error), 500);
  }
}

/**
 * POST /api/skills/:name/reactivate - Reactivate a deactivated plugin
 */
async function handleReactivatePlugin(
  env: Env,
  user: CodeData,
  pluginName: string
): Promise<Response> {
  try {
    logAction(user.email, "reactivate_plugin", { plugin: pluginName });
    const github = getGitHubClient(env);
    const accessControl = await getAccessControl(env, user.provider, user.uid);

    if (!accessControl.canWrite(pluginName)) {
      return errorResponse("Access denied", `You don't have write access to '${pluginName}'`, 403);
    }

    const writeClient = getWriteGitHubClient(env);
    const pluginJsonPath = `plugins/${pluginName}/.claude-plugin/plugin.json`;

    let pluginJson: Record<string, unknown>;
    try {
      const content = await github.getFileContent(pluginJsonPath);
      pluginJson = JSON.parse(content);
    } catch {
      return errorResponse("Plugin not found", `Plugin '${pluginName}' not found`, 404);
    }

    if (pluginJson.deactivated !== true) {
      return errorResponse("Not deactivated", `'${pluginName}' is not deactivated`, 400);
    }

    delete pluginJson.deactivated;
    await writeClient.updateFile(
      pluginJsonPath,
      JSON.stringify(pluginJson, null, 2),
      `Reactivate ${pluginName}\n\nRequested by: ${user.email}`
    );

    await writeClient.upsertMarketplaceEntry(
      {
        name: pluginName,
        description: (pluginJson.description as string) || `${pluginName} plugin`,
        version: (pluginJson.version as string) || undefined,
      },
      user.email
    );

    await github.clearCache(pluginName);
    await github.clearCache();

    return jsonResponse({ success: true, plugin: pluginName, action: "reactivated" });
  } catch (error) {
    return errorResponse("Failed to reactivate", error instanceof Error ? error.message : String(error), 500);
  }
}

/**
 * POST /api/sync - Regenerate marketplace.json from plugin.json files
 */
async function handleSync(
  env: Env,
  user: CodeData,
  dryRun: boolean
): Promise<Response> {
  try {
    logAction(user.email, dryRun ? "sync_marketplace_dry_run" : "sync_marketplace");
    const github = getGitHubClient(env);
    const accessControl = await getAccessControl(env, user.provider, user.uid);

    if (!accessControl.isEditor()) {
      return errorResponse("Access denied", "Only editors can sync the marketplace", 403);
    }

    const currentMarketplace = await github.getMarketplace();
    const allPlugins = await github.listPlugins();

    const newPlugins: Array<{
      name: string;
      source: string;
      description?: string;
      version?: string;
      category?: string;
    }> = [];

    for (const plugin of allPlugins) {
      let pluginJson: Record<string, unknown>;
      try {
        const content = await github.getFileContent(
          `${plugin.source.replace("./", "")}/.claude-plugin/plugin.json`
        );
        pluginJson = JSON.parse(content);
      } catch {
        continue;
      }

      if (pluginJson.deactivated === true) continue;

      newPlugins.push({
        name: plugin.name,
        source: plugin.source,
        description: (pluginJson.description as string) || undefined,
        version: (pluginJson.version as string) || undefined,
        category: (pluginJson.category as string) || undefined,
      });
    }

    const currentNames = new Set(currentMarketplace.plugins.map((p) => p.name));
    const newNames = new Set(newPlugins.map((p) => p.name));
    const added = newPlugins.filter((p) => !currentNames.has(p.name));
    const removed = currentMarketplace.plugins.filter((p) => !newNames.has(p.name));
    const kept = newPlugins.filter((p) => currentNames.has(p.name));

    if (dryRun) {
      return jsonResponse({
        dryRun: true,
        current: currentMarketplace.plugins.length,
        proposed: newPlugins.length,
        added: added.map((p) => p.name),
        removed: removed.map((p) => p.name),
        kept: kept.map((p) => p.name),
      });
    }

    const writeClient = getWriteGitHubClient(env);
    const newMarketplace = {
      ...currentMarketplace,
      plugins: newPlugins.map((p) => ({
        name: p.name,
        source: p.source,
        ...(p.description ? { description: p.description } : {}),
        ...(p.version ? { version: p.version } : {}),
        ...(p.category ? { category: p.category } : {}),
      })),
    };

    await writeClient.updateFile(
      ".claude-plugin/marketplace.json",
      JSON.stringify(newMarketplace, null, 2),
      `Sync marketplace.json (${newPlugins.length} plugins)\n\nRequested by: ${user.email}`
    );

    await github.clearCache();

    return jsonResponse({
      success: true,
      plugins: newPlugins.length,
      added: added.map((p) => p.name),
      removed: removed.map((p) => p.name),
    });
  } catch (error) {
    return errorResponse("Failed to sync marketplace", error instanceof Error ? error.message : String(error), 500);
  }
}

/**
 * POST /api/check-updates - Check for updates
 */
async function handleCheckUpdates(
  env: Env,
  user: CodeData,
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
async function handleWhoami(user: CodeData): Promise<Response> {
  return jsonResponse({
    id: `${user.provider}:${user.uid}`,
    email: user.email,
    name: user.name,
    provider: user.provider,
  });
}

/**
 * GET /api/plugins/:name/info - Plugin-level info with component listing
 */
async function handlePluginInfo(
  env: Env,
  user: CodeData,
  pluginName: string
): Promise<Response> {
  try {
    logAction(user.email, "plugin_info", { plugin: pluginName });
    const github = getGitHubClient(env);
    const accessControl = await getAccessControl(env, user.provider, user.uid);

    // Read plugin.json
    const basePath = `plugins/${pluginName}`;
    let pluginJson: Record<string, unknown>;
    try {
      const content = await github.getFileContent(`${basePath}/.claude-plugin/plugin.json`);
      pluginJson = JSON.parse(content);
    } catch {
      return errorResponse("Plugin not found", `Plugin '${pluginName}' not found`, 404);
    }

    // Scan for skills (directories under skills/ that contain SKILL.md)
    const skills: Array<{ name: string; description: string; files?: string[] }> = [];
    try {
      const skillsDirItems = await github.listPluginSubdir(pluginName, "skills");
      for (const item of skillsDirItems) {
        if (item.type === "dir") {
          let description = "";
          try {
            const skillMd = await github.getFileContent(
              `${basePath}/skills/${item.name}/SKILL.md`
            );
            const fm = parseSkillFrontmatter(skillMd);
            description = fm.description || "";
          } catch {
            // No SKILL.md or no frontmatter
          }
          skills.push({ name: item.name, description });
        }
      }
    } catch {
      // No skills/ directory
    }

    // For single-skill plugins, include file list for the skill
    if (skills.length === 1) {
      try {
        const fileList = await github.listSkillFiles(skills[0].name);
        skills[0].files = fileList;
      } catch {
        // Skip file list
      }
    }

    // Scan for commands (files under commands/)
    const commands: Array<{ name: string; description: string }> = [];
    try {
      const cmdItems = await github.listPluginSubdir(pluginName, "commands");
      for (const item of cmdItems) {
        if (item.type === "file" && item.name.endsWith(".md")) {
          const cmdName = item.name.replace(/\.md$/, "");
          // Try to read frontmatter for description
          let description = "";
          try {
            const content = await github.getFileContent(
              `${basePath}/commands/${item.name}`
            );
            const fm = parseSkillFrontmatter(content);
            description = fm.description || "";
          } catch {
            // Skip description
          }
          commands.push({ name: cmdName, description });
        }
      }
    } catch {
      // No commands/ directory
    }

    return jsonResponse({
      plugin: {
        name: pluginName,
        version: (pluginJson.version as string) || "unknown",
        description: (pluginJson.description as string) || "",
        surface_tags: (pluginJson.surface_tags as string[]) || [],
      },
      components: {
        skills,
        commands,
      },
      editable: accessControl.canWrite(pluginName),
    });
  } catch (error) {
    return errorResponse(
      "Failed to get plugin info",
      error instanceof Error ? error.message : String(error),
      500
    );
  }
}

/**
 * PUT /api/plugins/:name - Save entire plugin directory tree
 * Writes all files to plugins/{name}/ on GitHub, bumps version,
 * and ensures marketplace.json entry.
 */
async function handleSavePlugin(
  env: Env,
  user: CodeData,
  pluginName: string,
  body: {
    files: Array<{ path: string; content: string }>;
    bump?: "patch" | "minor" | "major";
  }
): Promise<Response> {
  try {
    const { files, bump } = body;

    if (!files || !Array.isArray(files) || files.length === 0) {
      return errorResponse("Invalid request", "files array is required", 400);
    }

    logAction(user.email, "save_plugin", { plugin: pluginName });

    const github = getGitHubClient(env);
    const accessControl = await getAccessControl(env, user.provider, user.uid);

    // Check write access (editors can create new, writers can update existing)
    const pluginExists = await github.fileExists(`plugins/${pluginName}/.claude-plugin/plugin.json`);
    if (pluginExists) {
      if (!accessControl.canWrite(pluginName)) {
        return errorResponse("Access denied", `You don't have write access to '${pluginName}'`, 403);
      }
    } else {
      if (!accessControl.isEditor()) {
        return errorResponse("Access denied", "Only editors can create new plugins", 403);
      }
    }

    // Validate all file paths
    for (const file of files) {
      const sanitized = validateFilePath(file.path);
      if (!sanitized) {
        return errorResponse("Invalid file path", `Path "${file.path}" is invalid`, 400);
      }
    }

    // Validate plugin.json exists in the payload
    const pluginJsonFile = files.find((f) => f.path === ".claude-plugin/plugin.json");
    if (!pluginJsonFile) {
      return errorResponse(
        "Missing plugin.json",
        "Plugin save must include .claude-plugin/plugin.json",
        400
      );
    }

    // Parse plugin.json for metadata
    let pluginJson: Record<string, unknown>;
    try {
      pluginJson = JSON.parse(pluginJsonFile.content);
    } catch {
      return errorResponse("Invalid plugin.json", "plugin.json contains invalid JSON", 400);
    }

    // Validate at least one SKILL.md exists under skills/
    const hasSkill = files.some((f) => f.path.match(/^skills\/[^/]+\/SKILL\.md$/));
    if (!hasSkill) {
      return errorResponse(
        "Missing skill",
        "Plugin must contain at least one skill (skills/*/SKILL.md)",
        400
      );
    }

    // Validate SKILL.md frontmatter for each skill
    const skillMdFiles = files.filter((f) => f.path.match(/^skills\/[^/]+\/SKILL\.md$/));
    for (const skillMd of skillMdFiles) {
      const frontmatter = parseSkillFrontmatter(skillMd.content);
      if (!frontmatter.name || !frontmatter.description) {
        const skillDir = skillMd.path.split("/")[1];
        return errorResponse(
          "Invalid SKILL.md frontmatter",
          `skills/${skillDir}/SKILL.md must have name and description in frontmatter`,
          400
        );
      }
    }

    const writeClient = getWriteGitHubClient(env);
    const basePath = `plugins/${pluginName}`;

    // Write all files
    const results: Array<{ path: string; created?: boolean }> = [];
    for (const file of files) {
      const absolutePath = `${basePath}/${file.path}`;
      const { created } = await writeClient.upsertFile(
        absolutePath,
        file.content,
        `Update ${pluginName}: ${file.path}\n\nRequested by: ${user.email}`
      );
      results.push({ path: file.path, created });
    }

    // Ensure marketplace.json entry
    const description = (pluginJson.description as string) || `${pluginName} plugin`;
    await writeClient.upsertMarketplaceEntry(
      {
        name: pluginName,
        description,
        version: (pluginJson.version as string) || undefined,
      },
      user.email
    );

    // Bump version if requested
    let newVersion: string | undefined;
    if (bump) {
      const currentVersion = (pluginJson.version as string) || "1.0.0";
      const [major, minor, patch] = currentVersion.split(".").map(Number);
      newVersion =
        bump === "major"
          ? `${major + 1}.0.0`
          : bump === "minor"
            ? `${major}.${minor + 1}.0`
            : `${major}.${minor}.${patch + 1}`;

      // Update plugin.json with new version
      const updatedPluginJson = { ...pluginJson, version: newVersion };
      await writeClient.upsertFile(
        `${basePath}/.claude-plugin/plugin.json`,
        JSON.stringify(updatedPluginJson, null, 2),
        `Bump ${pluginName} version to ${newVersion}\n\nRequested by: ${user.email}`
      );

      // Update marketplace.json version
      try {
        await writeClient.updateMarketplaceVersion(pluginName, newVersion, user.email);
      } catch {
        // marketplace version update may fail if just created — that's fine,
        // upsertMarketplaceEntry above already set the version
      }
    }

    // Clear caches
    await github.clearCache(pluginName);
    await github.clearCache();

    const created = results.filter((r) => r.created === true).length;
    const updated = results.filter((r) => r.created === false).length;
    const summary = `${created} file(s) created, ${updated} file(s) updated`;

    return jsonResponse({
      success: true,
      plugin: pluginName,
      summary,
      newVersion,
    });
  } catch (error) {
    return errorResponse(
      "Failed to save plugin",
      error instanceof Error ? error.message : String(error),
      500
    );
  }
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
  const user = await validateCode(request, env);
  if (!user) {
    return errorResponse(
      "Unauthorized",
      "Invalid or expired code. Call auth.get_code via MCP to get a new code.",
      401
    );
  }

  // Parse path
  const pathParts = url.pathname.replace("/api/", "").split("/");

  // Route: GET /api/skills
  if (pathParts[0] === "skills" && pathParts.length === 1 && method === "GET") {
    const refresh = url.searchParams.get("refresh") === "true";
    const surface = url.searchParams.get("surface") || undefined;
    // Validate surface parameter if provided
    const validSurfaces = ["CC", "CD", "CAI", "CDAI", "CALL"];
    if (surface && !validSurfaces.includes(surface)) {
      return errorResponse(
        "Invalid surface",
        `surface must be one of: ${validSurfaces.join(", ")}`,
        400
      );
    }
    return handleListSkills(env, user, { refresh, surface });
  }

  // Route: GET /api/skills/:name
  if (pathParts[0] === "skills" && pathParts.length === 2 && method === "GET") {
    const skillName = pathParts[1];
    if (!validateName(skillName)) {
      return errorResponse(
        "Invalid skill name",
        "Skill name must contain only lowercase letters, numbers, and hyphens",
        400
      );
    }
    return handleGetSkill(env, user, skillName);
  }

  // Route: GET /api/skills/:name/install
  if (
    pathParts[0] === "skills" &&
    pathParts.length === 3 &&
    pathParts[2] === "install" &&
    method === "GET"
  ) {
    const skillName = pathParts[1];
    if (!validateName(skillName)) {
      return errorResponse(
        "Invalid skill name",
        "Skill name must contain only lowercase letters, numbers, and hyphens",
        400
      );
    }
    return handleInstallSkill(env, user, skillName);
  }

  // Route: GET /api/skills/:name/edit
  if (
    pathParts[0] === "skills" &&
    pathParts.length === 3 &&
    pathParts[2] === "edit" &&
    method === "GET"
  ) {
    const skillName = pathParts[1];
    if (!validateName(skillName)) {
      return errorResponse(
        "Invalid skill name",
        "Skill name must contain only lowercase letters, numbers, and hyphens",
        400
      );
    }
    return handleEditSkill(env, user, skillName);
  }

  // Route: GET /api/skills/:name/download
  if (
    pathParts[0] === "skills" &&
    pathParts.length === 3 &&
    pathParts[2] === "download" &&
    method === "GET"
  ) {
    const skillName = pathParts[1];
    if (!validateName(skillName)) {
      return errorResponse(
        "Invalid skill name",
        "Skill name must contain only lowercase letters, numbers, and hyphens",
        400
      );
    }
    return handleDownloadSkill(env, user, skillName);
  }

  // Route: GET /api/skills/:name/package
  if (
    pathParts[0] === "skills" &&
    pathParts.length === 3 &&
    pathParts[2] === "package" &&
    method === "GET"
  ) {
    const skillName = pathParts[1];
    if (!validateName(skillName)) {
      return errorResponse(
        "Invalid skill name",
        "Skill name must contain only lowercase letters, numbers, and hyphens",
        400
      );
    }
    return handlePackageSkill(env, user, skillName);
  }

  // Route: POST /api/skills/:name
  if (
    pathParts[0] === "skills" &&
    pathParts.length === 2 &&
    method === "POST"
  ) {
    const skillName = pathParts[1];
    if (!validateName(skillName)) {
      return errorResponse(
        "Invalid skill name",
        "Skill name must contain only lowercase letters, numbers, and hyphens",
        400
      );
    }
    const body = await request.json() as {
      skill_group?: string;
      files: Array<{ path: string; content: string }>;
      commitMessage?: string;
    };
    // Validate skill_group if provided
    if (body.skill_group && !validateName(body.skill_group)) {
      return errorResponse(
        "Invalid skill group",
        "Skill group must contain only lowercase letters, numbers, and hyphens",
        400
      );
    }
    return handleSaveSkill(env, user, skillName, body);
  }

  // Route: DELETE /api/skills/:name
  if (
    pathParts[0] === "skills" &&
    pathParts.length === 2 &&
    method === "DELETE"
  ) {
    const skillName = pathParts[1];
    if (!validateName(skillName)) {
      return errorResponse(
        "Invalid skill name",
        "Skill name must contain only lowercase letters, numbers, and hyphens",
        400
      );
    }
    const confirm = url.searchParams.get("confirm") === "true";
    return handleDeleteSkill(env, user, skillName, confirm);
  }

  // Route: POST /api/skills/:name/bump
  if (
    pathParts[0] === "skills" &&
    pathParts.length === 3 &&
    pathParts[2] === "bump" &&
    method === "POST"
  ) {
    const skillName = pathParts[1];
    if (!validateName(skillName)) {
      return errorResponse(
        "Invalid skill name",
        "Skill name must contain only lowercase letters, numbers, and hyphens",
        400
      );
    }
    const body = await request.json() as { type?: string };
    const validTypes = ["major", "minor", "patch"];
    if (!body.type || !validTypes.includes(body.type)) {
      return errorResponse(
        "Invalid bump type",
        `type must be one of: ${validTypes.join(", ")}`,
        400
      );
    }
    return handleBumpVersion(env, user, skillName, body.type as "major" | "minor" | "patch");
  }

  // Route: POST /api/skills/:name/publish
  if (
    pathParts[0] === "skills" &&
    pathParts.length === 3 &&
    pathParts[2] === "publish" &&
    method === "POST"
  ) {
    const skillName = pathParts[1];
    if (!validateName(skillName)) {
      return errorResponse(
        "Invalid skill name",
        "Skill name must contain only lowercase letters, numbers, and hyphens",
        400
      );
    }
    const body = await request.json();
    return handlePublishSkill(env, user, skillName, body as {
      description: string;
      category?: string;
      tags?: string[];
      keywords?: string[];
    });
  }

  // Route: POST /api/check-updates
  if (pathParts[0] === "check-updates" && method === "POST") {
    const body = await request.json() as {
      installed?: unknown;
    };
    if (!Array.isArray(body.installed)) {
      return errorResponse(
        "Invalid request",
        "installed must be an array of {name, version} objects",
        400
      );
    }
    return handleCheckUpdates(env, user, body.installed as Array<{ name: string; version: string }>);
  }

  // Route: GET /api/whoami
  if (pathParts[0] === "whoami" && method === "GET") {
    return handleWhoami(user);
  }

  // Route: POST /api/skills/:name/deactivate
  if (
    pathParts[0] === "skills" &&
    pathParts.length === 3 &&
    pathParts[2] === "deactivate" &&
    method === "POST"
  ) {
    const skillName = pathParts[1];
    if (!validateName(skillName)) {
      return errorResponse("Invalid skill name", "Skill name must contain only lowercase letters, numbers, and hyphens", 400);
    }
    return handleDeactivatePlugin(env, user, skillName);
  }

  // Route: POST /api/skills/:name/reactivate
  if (
    pathParts[0] === "skills" &&
    pathParts.length === 3 &&
    pathParts[2] === "reactivate" &&
    method === "POST"
  ) {
    const skillName = pathParts[1];
    if (!validateName(skillName)) {
      return errorResponse("Invalid skill name", "Skill name must contain only lowercase letters, numbers, and hyphens", 400);
    }
    return handleReactivatePlugin(env, user, skillName);
  }

  // Route: POST /api/sync
  if (pathParts[0] === "sync" && method === "POST") {
    const dryRun = url.searchParams.get("dry_run") === "true";
    return handleSync(env, user, dryRun);
  }

  // Route: GET /api/plugins/:name/info
  if (
    pathParts[0] === "plugins" &&
    pathParts.length === 3 &&
    pathParts[2] === "info" &&
    method === "GET"
  ) {
    const pluginName = pathParts[1];
    if (!validateName(pluginName)) {
      return errorResponse("Invalid plugin name", "Plugin name must contain only lowercase letters, numbers, and hyphens", 400);
    }
    return handlePluginInfo(env, user, pluginName);
  }

  // Route: PUT /api/plugins/:name - Save entire plugin directory tree
  if (
    pathParts[0] === "plugins" &&
    pathParts.length === 2 &&
    method === "PUT"
  ) {
    const pluginName = pathParts[1];
    if (!validateName(pluginName)) {
      return errorResponse("Invalid plugin name", "Plugin name must contain only lowercase letters, numbers, and hyphens", 400);
    }
    const body = await request.json() as {
      files: Array<{ path: string; content: string }>;
      bump?: "patch" | "minor" | "major";
    };
    return handleSavePlugin(env, user, pluginName, body);
  }

  // Route: GET /api/debug/plugins - Debug endpoint to see raw GitHub API response
  if (pathParts[0] === "debug" && pathParts[1] === "plugins" && method === "GET") {
    logAction(user.email, "debug_plugins");
    const github = getGitHubClient(env);
    const result = await github.debugListPlugins();
    return jsonResponse({
      repo: env.MARKETPLACE_REPO,
      timestamp: new Date().toISOString(),
      ...result,
      count: result.directories.length,
      names: result.directories.filter(d => d.type === "dir").map(d => d.name)
    });
  }

  // Not found
  return errorResponse("Not found", `Unknown endpoint: ${url.pathname}`, 404);
}
