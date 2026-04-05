import { mkdir, writeFile } from "fs/promises";
import { join, dirname } from "path";
import type { ParsedArgs } from "../index";
import type { ApiClient } from "../api-client";

interface DownloadResponse {
  skill: { name: string; version: string; plugin: string };
  plugin: { name: string; version: string };
  files: Array<{ path: string; content: string }>;
}

interface PackageResponse {
  skill: { name: string; version: string };
  package: { filename: string; content_base64: string };
}

interface ListResponse {
  count: number;
  skills: Array<{ name: string; plugin: string }>;
}

interface PluginPackageResponse {
  plugin: { name: string; version: string };
  package: { filename: string; content_base64: string };
}

export async function runGet(
  args: ParsedArgs,
  api: ApiClient,
): Promise<void> {
  const name = args.positional[0];
  if (!name) {
    console.error("Usage: skillport get <name> [--skill <skill>] [--skills-only] [--format skill|plugin] --code <CODE>");
    throw new Error("Missing name");
  }

  const format = args.flags.format as string | undefined;
  const skill = args.flags.skill as string | undefined;
  const skillsOnly = args.flags["skills-only"] as boolean | undefined;

  // Validate invalid combinations
  if (skill && format === "plugin") {
    console.error("Invalid: --skill with --format plugin (a single skill isn't a plugin)");
    throw new Error("Invalid flag combination");
  }
  if (skillsOnly && format === "plugin") {
    console.error("Invalid: --skills-only with --format plugin (standalone skills aren't a plugin)");
    throw new Error("Invalid flag combination");
  }

  // Determine which skill name to download
  // --skill <name> targets a specific skill within the named plugin
  const targetSkill = skill || name;

  if (skillsOnly) {
    // Download all skills from the plugin as standalone
    await getAllSkills(name, format === "skill", api);
  } else if (format === "plugin") {
    // Download whole plugin as .plugin ZIP
    await getPluginZip(name, api);
  } else if (format === "skill") {
    // Download single skill as .skill ZIP
    await getSkillZip(targetSkill, api);
  } else {
    // Default: download single skill unpacked
    await getUnpacked(targetSkill, api);
  }
}

async function getUnpacked(
  skillName: string,
  api: ApiClient,
): Promise<void> {
  const data = await api.get<DownloadResponse>(
    `/api/skills/${encodeURIComponent(skillName)}/download`,
  );

  const outDir = join(process.cwd(), data.skill.name);
  await mkdir(outDir, { recursive: true });

  for (const file of data.files) {
    const filePath = join(outDir, file.path);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, file.content, "utf-8");
  }

  console.log(`${data.skill.name} v${data.skill.version} (plugin: ${data.plugin.name})`);
  console.log(`${data.files.length} file(s) written to ./${data.skill.name}/`);
}

async function getSkillZip(
  skillName: string,
  api: ApiClient,
): Promise<void> {
  const data = await api.get<PackageResponse>(
    `/api/skills/${encodeURIComponent(skillName)}/package`,
  );

  const filename = data.package.filename;
  const buffer = Buffer.from(data.package.content_base64, "base64");
  await writeFile(join(process.cwd(), filename), buffer);

  console.log(`${data.skill.name} v${data.skill.version}`);
  console.log(`Written to ./${filename} (${buffer.length} bytes)`);
}

async function getAllSkills(
  pluginName: string,
  asZip: boolean,
  api: ApiClient,
): Promise<void> {
  // List all skills, filter to this plugin
  const list = await api.get<ListResponse>("/api/skills", {});
  const pluginSkills = list.skills.filter((s) => s.plugin === pluginName);

  if (pluginSkills.length === 0) {
    console.error(`No skills found in plugin '${pluginName}'.`);
    throw new Error("No skills found");
  }

  console.log(`Downloading ${pluginSkills.length} skill(s) from ${pluginName}...`);

  for (const s of pluginSkills) {
    if (asZip) {
      await getSkillZip(s.name, api);
    } else {
      await getUnpacked(s.name, api);
    }
  }

  console.log(`Done. ${pluginSkills.length} skill(s) downloaded.`);
}

async function getPluginZip(
  pluginName: string,
  api: ApiClient,
): Promise<void> {
  const data = await api.get<PluginPackageResponse>(
    `/api/plugins/${encodeURIComponent(pluginName)}/package`,
  );

  const filename = data.package.filename;
  const buffer = Buffer.from(data.package.content_base64, "base64");
  await writeFile(join(process.cwd(), filename), buffer);

  console.log(`${data.plugin.name} v${data.plugin.version}`);
  console.log(`Written to ./${filename} (${buffer.length} bytes)`);
}
