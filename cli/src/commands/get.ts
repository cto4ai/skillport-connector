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

export async function runGet(
  args: ParsedArgs,
  api: ApiClient,
): Promise<void> {
  const name = args.positional[0];
  if (!name) {
    console.error("Usage: skillport get <name> [--format skill] --code <CODE>");
    throw new Error("Missing skill name");
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

  if (format === "skill") {
    await getAsZip(name, api);
  } else {
    await getUnpacked(name, api);
  }
}

async function getUnpacked(
  name: string,
  api: ApiClient,
): Promise<void> {
  const data = await api.get<DownloadResponse>(
    `/api/skills/${encodeURIComponent(name)}/download`,
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

async function getAsZip(
  name: string,
  api: ApiClient,
): Promise<void> {
  const data = await api.get<PackageResponse>(
    `/api/skills/${encodeURIComponent(name)}/package`,
  );

  const filename = data.package.filename;
  const buffer = Buffer.from(data.package.content_base64, "base64");
  await writeFile(join(process.cwd(), filename), buffer);

  console.log(`${data.skill.name} v${data.skill.version}`);
  console.log(`Written to ./${filename} (${buffer.length} bytes)`);
}
