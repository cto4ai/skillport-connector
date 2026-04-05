import type { ParsedArgs } from "../index";
import type { ApiClient } from "../api-client";
import { ApiError } from "../api-client";

interface SkillInfoResponse {
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

interface PluginInfoResponse {
  plugin: {
    name: string;
    version: string;
    description: string;
    surface_tags?: string[];
  };
  components: {
    skills: Array<{ name: string; description: string; files?: string[] }>;
    commands?: Array<{ name: string; description: string }>;
  };
  editable: boolean;
}

export async function runInfo(
  args: ParsedArgs,
  api: ApiClient,
): Promise<void> {
  const name = args.positional[0];
  if (!name) {
    console.error("Usage: skillport info <name> [--skill] --code <CODE>");
    throw new Error("Missing name");
  }

  // --skill targets a specific skill (by name or as boolean to force skill view)
  if (args.flags.skill) {
    const skillName = typeof args.flags.skill === "string" ? args.flags.skill : name;
    const data = await api.get<SkillInfoResponse>(
      `/api/skills/${encodeURIComponent(skillName)}`,
    );
    printSkillInfo(data);
    return;
  }

  // Try plugin-level info first, fall back to skill-level
  try {
    const data = await api.get<PluginInfoResponse>(
      `/api/plugins/${encodeURIComponent(name)}/info`,
    );
    printPluginInfo(data);
    return;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) {
      // Not a plugin — try as skill
    } else {
      throw e;
    }
  }

  const data = await api.get<SkillInfoResponse>(
    `/api/skills/${encodeURIComponent(name)}`,
  );
  printSkillInfo(data);
}

function printPluginInfo(data: PluginInfoResponse): void {
  const p = data.plugin;
  console.log(`${p.name} v${p.version}`);
  console.log(`Description: ${p.description}`);
  if (p.surface_tags?.length) console.log(`Surfaces: ${p.surface_tags.join(", ")}`);
  console.log(`Editable: ${data.editable ? "yes" : "no"}`);

  const { skills, commands } = data.components;

  if (skills.length > 0) {
    console.log("");
    if (skills.length === 1) {
      // Single-skill plugin — show skill details inline
      const s = skills[0];
      console.log(`Skill: ${s.name} — ${s.description}`);
      if (s.files && s.files.length > 0) {
        console.log("");
        console.log("Files:");
        for (const f of s.files) {
          console.log(`  ${f}`);
        }
      }
    } else {
      console.log(`Skills (${skills.length}):`);
      for (const s of skills) {
        console.log(`  ${s.name} — ${s.description}`);
      }
    }
  }

  if (commands && commands.length > 0) {
    console.log("");
    console.log(`Commands (${commands.length}):`);
    for (const c of commands) {
      console.log(`  ${c.name} — ${c.description}`);
    }
  }
}

function printSkillInfo(data: SkillInfoResponse): void {
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
