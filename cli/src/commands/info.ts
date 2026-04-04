import type { ParsedArgs } from "../index";
import type { ApiClient } from "../api-client";

interface InfoResponse {
  skill: {
    name: string;
    version: string;
    description: string;
    plugin: string;
    category?: string;
    tags?: string[];
    surface_tags?: string[];
    published: boolean;
  };
  skill_md: string | null;
  files: string[];
  editable: boolean;
}

export async function runInfo(
  args: ParsedArgs,
  api: ApiClient,
): Promise<void> {
  const name = args.positional[0];
  if (!name) {
    console.error("Usage: skillport info <name> [--skill <skill>] --code <CODE>");
    throw new Error("Missing plugin/skill name");
  }

  const data = await api.get<InfoResponse>(`/api/skills/${encodeURIComponent(name)}`);
  const s = data.skill;

  console.log(`${s.name} v${s.version}`);
  console.log(`Plugin: ${s.plugin}`);
  console.log(`Description: ${s.description}`);
  if (s.category) console.log(`Category: ${s.category}`);
  if (s.tags?.length) console.log(`Tags: ${s.tags.join(", ")}`);
  if (s.surface_tags?.length) console.log(`Surfaces: ${s.surface_tags.join(", ")}`);
  console.log(`Published: ${s.published ? "yes" : "no"}`);
  console.log(`Editable: ${data.editable ? "yes" : "no"}`);

  if (data.files.length > 0) {
    console.log("");
    console.log("Files:");
    for (const f of data.files) {
      const short = f.split("/").slice(-2).join("/");
      console.log(`  ${short}`);
    }
  }
}
