import { readdir, readFile, stat } from "fs/promises";
import { join } from "path";
import type { ParsedArgs } from "../index";
import type { ApiClient } from "../api-client";

const VALID_BUMPS = ["patch", "minor", "major"];

interface PluginSaveResponse {
  success: boolean;
  plugin: string;
  summary: string;
  newVersion?: string;
}

interface SkillSaveResponse {
  success: boolean;
  skill: string;
  skill_group: string;
  isNewSkill: boolean;
  isNewGroup: boolean;
  summary: string;
}

export async function runSave(
  args: ParsedArgs,
  api: ApiClient,
): Promise<void> {
  const name = args.positional[0];
  const bump = args.positional[1];

  if (!name) {
    console.error("Usage: skillport save <name> <patch|minor|major> --code <CODE>");
    throw new Error("Missing skill name");
  }

  if (!bump || !VALID_BUMPS.includes(bump)) {
    console.error(`Error: bump type required (${VALID_BUMPS.join("|")})`);
    console.error("Usage: skillport save <name> <patch|minor|major> --code <CODE>");
    throw new Error("Missing or invalid bump type");
  }

  const dir = join(process.cwd(), name);
  try {
    await stat(dir);
  } catch {
    console.error(`Error: Directory './${name}' not found.`);
    console.error("Run 'skillport create' first, or 'skillport get' to download existing.");
    throw new Error("Directory not found");
  }

  // Detect layout: plugin (has skills/ subdir) vs standalone skill
  const skillsDir = join(dir, "skills");
  let isPluginLayout = false;
  try {
    const s = await stat(skillsDir);
    isPluginLayout = s.isDirectory();
  } catch {
    // No skills/ directory — standalone skill
  }

  // --skill <name> targets a specific skill within the plugin directory
  const targetSkill = args.flags.skill as string | undefined;

  if (targetSkill && isPluginLayout) {
    // Save one skill from within a plugin directory
    const skillDir = join(dir, "skills", targetSkill);
    try {
      await stat(skillDir);
    } catch {
      console.error(`Error: Skill directory './${name}/skills/${targetSkill}' not found.`);
      throw new Error("Skill directory not found");
    }
    await saveSkill(targetSkill, skillDir, bump, api);
  } else if (isPluginLayout) {
    await savePlugin(name, dir, bump, api);
  } else {
    await saveSkill(name, dir, bump, api);
  }
}

/**
 * Save entire plugin directory tree via PUT /api/plugins/:name.
 * Sends all files (including .claude-plugin/plugin.json, commands/, skills/).
 * Server handles writing, publishing, and version bump.
 */
async function savePlugin(
  name: string,
  dir: string,
  bump: string,
  api: ApiClient,
): Promise<void> {
  const files = await collectFiles(dir, "");

  if (files.length === 0) {
    console.error(`Error: No files found in './${name}'.`);
    throw new Error("No files to save");
  }

  console.log(`Saving plugin ${name} (${files.length} file(s))...`);

  const result = await api.put<PluginSaveResponse>(
    `/api/plugins/${encodeURIComponent(name)}`,
    { files, bump },
  );

  console.log(result.summary);
  if (result.newVersion) {
    console.log(`Version: ${result.newVersion}`);
  }
  console.log("Done.");
}

/**
 * Save standalone skill via POST /api/skills/:name + bump.
 * Strips .claude-plugin/ from files (synthesized, not stored).
 * Reads plugin_metadata from local .claude-plugin/plugin.json.
 */
async function saveSkill(
  name: string,
  dir: string,
  bump: string,
  api: ApiClient,
): Promise<void> {
  // Read plugin_metadata from .claude-plugin/plugin.json
  let pluginMetadata: { description: string } | undefined;
  const pluginJsonPath = join(dir, ".claude-plugin", "plugin.json");
  try {
    const raw = await readFile(pluginJsonPath, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed.description) {
      pluginMetadata = { description: parsed.description };
    }
  } catch {
    // No plugin.json — skip metadata
  }

  // Collect skill files, strip .claude-plugin/ (synthesized, not stored)
  let files = await collectFiles(dir, "");
  files = files.filter((f) => !f.path.startsWith(".claude-plugin/"));

  if (files.length === 0) {
    console.error(`Error: No skill files found in './${name}'.`);
    throw new Error("No files to save");
  }

  console.log(`Saving ${name} (${files.length} file(s))...`);

  const saveResult = await api.post<SkillSaveResponse>(
    `/api/skills/${encodeURIComponent(name)}`,
    { files, plugin_metadata: pluginMetadata },
  );

  console.log(saveResult.summary);

  // Auto-publish if new skill (needed before bump can work)
  if (saveResult.isNewSkill || saveResult.isNewGroup) {
    let surfaceTags = ["surface:CC"];
    let description = pluginMetadata?.description || `${name} skill`;
    try {
      const raw = await readFile(pluginJsonPath, "utf-8");
      const parsed = JSON.parse(raw);
      if (parsed.surface_tags) {
        surfaceTags = parsed.surface_tags.map((t: string) =>
          t.startsWith("surface:") ? t : `surface:${t}`,
        );
      }
      if (parsed.description) description = parsed.description;
    } catch {
      // Use defaults
    }

    await api.post(`/api/skills/${encodeURIComponent(name)}/publish`, {
      description,
      tags: surfaceTags,
    });
    console.log("Published to marketplace.");
  }

  const bumpResult = await api.post<{
    success: boolean;
    oldVersion: string;
    newVersion: string;
  }>(`/api/skills/${encodeURIComponent(name)}/bump`, { type: bump });

  console.log(`Version: ${bumpResult.oldVersion} → ${bumpResult.newVersion}`);
  console.log("Done.");
}

async function collectFiles(
  baseDir: string,
  relativePath: string,
): Promise<Array<{ path: string; content: string }>> {
  const fullPath = relativePath ? join(baseDir, relativePath) : baseDir;
  const entries = await readdir(fullPath, { withFileTypes: true });
  const files: Array<{ path: string; content: string }> = [];

  for (const entry of entries) {
    const entryRelative = relativePath
      ? `${relativePath}/${entry.name}`
      : entry.name;

    if (entry.isDirectory()) {
      const nested = await collectFiles(baseDir, entryRelative);
      files.push(...nested);
    } else if (entry.isFile()) {
      const content = await readFile(join(fullPath, entry.name), "utf-8");
      files.push({ path: entryRelative, content });
    }
  }

  return files;
}
