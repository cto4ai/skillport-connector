import { mkdir, writeFile, stat } from "fs/promises";
import { join } from "path";
import type { ParsedArgs } from "../index";

const PLUGIN_JSON_TEMPLATE = (name: string) =>
  JSON.stringify(
    {
      name,
      version: "0.1.0",
      description: `${name} plugin`,
      author: "",
      surface_tags: ["CC"],
    },
    null,
    2,
  );

const SKILL_PLUGIN_JSON_TEMPLATE = (name: string) =>
  JSON.stringify(
    {
      name,
      version: "0.1.0",
      description: `${name} skill`,
      author: "",
      surface_tags: ["CC"],
    },
    null,
    2,
  );

const SKILL_MD_TEMPLATE = (name: string) =>
  `# ${name}

<!-- Describe when this skill should be triggered -->
This skill should be used when...

## Instructions

<!-- Add instructions for Claude here -->
`;

export async function runCreate(args: ParsedArgs): Promise<void> {
  const skillName = args.flags.skill as string | undefined;

  if (skillName) {
    await createSkill(skillName);
  } else {
    const pluginName = args.positional[0];
    if (!pluginName) {
      console.error("Usage: skillport create <name> OR skillport create --skill <name>");
      throw new Error("Missing name");
    }
    await createPlugin(pluginName);
  }
}

async function createPlugin(name: string): Promise<void> {
  const outDir = join(process.cwd(), name);

  // Check if directory already exists
  try {
    await stat(outDir);
    console.error(`Error: Directory '${name}' already exists.`);
    throw new Error("Directory already exists");
  } catch (e) {
    if (!(e instanceof Error) || !e.message.includes("ENOENT")) {
      if (e instanceof Error && e.message === "Directory already exists") throw e;
      console.error(`Error: Directory '${name}' already exists.`);
      throw new Error("Directory already exists");
    }
  }

  await mkdir(join(outDir, ".claude-plugin"), { recursive: true });
  await mkdir(join(outDir, "skills", name), { recursive: true });

  await writeFile(
    join(outDir, ".claude-plugin", "plugin.json"),
    PLUGIN_JSON_TEMPLATE(name),
    "utf-8",
  );
  await writeFile(
    join(outDir, "skills", name, "SKILL.md"),
    SKILL_MD_TEMPLATE(name),
    "utf-8",
  );

  console.log(`Created plugin: ${name}/`);
  console.log(`  .claude-plugin/plugin.json`);
  console.log(`  skills/${name}/SKILL.md`);
  console.log("");
  console.log(`Next: edit skills/${name}/SKILL.md, then \`skillport save ${name} patch --code <CODE>\``);
}

async function createSkill(name: string): Promise<void> {
  const outDir = join(process.cwd(), name);

  try {
    await stat(outDir);
    console.error(`Error: Directory '${name}' already exists.`);
    throw new Error("Directory already exists");
  } catch (e) {
    if (!(e instanceof Error) || !e.message.includes("ENOENT")) {
      if (e instanceof Error && e.message === "Directory already exists") throw e;
      console.error(`Error: Directory '${name}' already exists.`);
      throw new Error("Directory already exists");
    }
  }

  await mkdir(join(outDir, ".claude-plugin"), { recursive: true });

  await writeFile(
    join(outDir, ".claude-plugin", "plugin.json"),
    SKILL_PLUGIN_JSON_TEMPLATE(name),
    "utf-8",
  );
  await writeFile(
    join(outDir, "SKILL.md"),
    SKILL_MD_TEMPLATE(name),
    "utf-8",
  );

  console.log(`Created skill: ${name}/`);
  console.log(`  SKILL.md`);
  console.log(`  .claude-plugin/plugin.json`);
  console.log("");
  console.log(`Next: edit SKILL.md, then \`skillport save <plugin> --skill ${name} patch --code <CODE>\``);
}
