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

interface PluginGroup {
  name: string;
  version: string;
  skills: string[];
  surfaces: string;
  editable: boolean;
}

export async function runList(
  args: ParsedArgs,
  api: ApiClient,
): Promise<void> {
  const surface = args.flags.surface as string | undefined;
  const data = await api.get<ListResponse>("/api/skills", { surface });

  if (data.skills.length === 0) {
    console.log("No plugins found.");
    if (surface) console.log(`(filtered by surface: ${surface})`);
    return;
  }

  // Group skills by plugin
  const pluginMap = new Map<string, PluginGroup>();
  for (const s of data.skills) {
    let group = pluginMap.get(s.plugin);
    if (!group) {
      group = {
        name: s.plugin,
        version: s.version,
        skills: [],
        surfaces: s.surface_tags?.join(",") || "",
        editable: s.editable,
      };
      pluginMap.set(s.plugin, group);
    }
    group.skills.push(s.name);
  }

  const plugins = Array.from(pluginMap.values());

  // Header
  const header = `${"Plugin".padEnd(25)} ${"Skills".padEnd(8)} ${"Version".padEnd(10)} ${"Surfaces".padEnd(12)}`;
  console.log(header);
  console.log("-".repeat(header.length));

  // Rows
  for (const p of plugins) {
    const skillCount = p.skills.length === 1 ? "1 skill" : `${p.skills.length} skills`;
    console.log(
      `${p.name.padEnd(25)} ${skillCount.padEnd(8)} ${p.version.padEnd(10)} ${p.surfaces.padEnd(12)}`,
    );
    // List individual skills for multi-skill plugins
    if (p.skills.length > 1) {
      for (const skill of p.skills) {
        console.log(`  ${skill}`);
      }
    }
  }

  // Summary
  console.log("");
  console.log(`${plugins.length} plugin(s), ${data.skills.length} skill(s)${surface ? ` (surface: ${surface})` : ""}`);
}
