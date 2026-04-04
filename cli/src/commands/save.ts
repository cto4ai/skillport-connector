import { readdir, readFile, stat } from "fs/promises";
import { join } from "path";
import type { ParsedArgs } from "../index";
import type { ApiClient } from "../api-client";

const VALID_BUMPS = ["patch", "minor", "major"];

interface SaveResponse {
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

  const files = await collectFiles(dir, "");

  if (files.length === 0) {
    console.error(`Error: No files found in './${name}'.`);
    throw new Error("No files to save");
  }

  console.log(`Saving ${name} (${files.length} file(s))...`);

  const saveResult = await api.post<SaveResponse>(`/api/skills/${encodeURIComponent(name)}`, {
    files,
  });

  console.log(saveResult.summary);

  const bumpResult = await api.post<{
    success: boolean;
    oldVersion: string;
    newVersion: string;
  }>(`/api/skills/${encodeURIComponent(name)}/bump`, { type: bump });

  console.log(`Version: ${bumpResult.oldVersion} → ${bumpResult.newVersion}`);
  console.log(`Done.`);
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
