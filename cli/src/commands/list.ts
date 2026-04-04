import type { ParsedArgs } from "../index";
import type { ApiClient } from "../api-client";

interface Skill {
  name: string;
  plugin: string;
  description: string;
  version: string;
  surface_tags?: string[];
  published: boolean;
  editable: boolean;
}

interface ListResponse {
  count: number;
  surface_filter: string | null;
  skills: Skill[];
}

export async function runList(
  args: ParsedArgs,
  api: ApiClient,
): Promise<void> {
  const surface = args.flags.surface as string | undefined;
  const data = await api.get<ListResponse>("/api/skills", { surface });

  if (data.skills.length === 0) {
    console.log("No skills found.");
    if (surface) console.log(`(filtered by surface: ${surface})`);
    return;
  }

  // Header
  const header = `${"Name".padEnd(30)} ${"Plugin".padEnd(25)} ${"Version".padEnd(10)} ${"Surfaces".padEnd(15)}`;
  console.log(header);
  console.log("-".repeat(header.length));

  // Rows
  for (const s of data.skills) {
    const surfaces = s.surface_tags?.join(",") || "";
    console.log(
      `${s.name.padEnd(30)} ${s.plugin.padEnd(25)} ${s.version.padEnd(10)} ${surfaces.padEnd(15)}`,
    );
  }

  // Summary
  console.log("");
  console.log(`${data.count} skill(s)${surface ? ` (surface: ${surface})` : ""}`);
}
