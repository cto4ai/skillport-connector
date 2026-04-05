# Skillport v3 — Plan 3: Get + Create Commands

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `get` command (download skill files from marketplace) and `create` command (scaffold locally). After this plan, users can install skills via CLI and create new ones from templates.

**Architecture:** The Worker gets a new `GET /api/skills/:name/download` endpoint that returns full file content (using the existing `fetchSkill()` method in github-client.ts). The CLI `get` command calls this endpoint and writes files to disk. ZIP format (`--format skill`) uses the Worker's existing `skill-packager.ts`. The `create` command is local-only — no network call, just file scaffolding.

**Tech Stack:** TypeScript, Vitest, esbuild, Node `fs` + `path`

**Spec:** `docs/superpowers/specs/2026-04-03-skillport-v3-design.md` (Section 2: Get, Scaffold)

**Depends on:** Plan 2 complete (browse commands working)

---

## Scope

This plan covers:
- `get <name> --code <CODE>` — download skill files, write unpacked to cwd
- `get <name> --format skill --code <CODE>` — download as .skill ZIP
- `create <name>` — scaffold plugin directory
- `create --skill <name>` — scaffold skill directory

Deferred to Plan 4 (with `save`):
- `get <name> --skills-only` — multi-skill extraction
- `get <name> --format plugin` — .plugin ZIP format
- `get <name> --skill <skill>` — targeting a skill within a multi-skill plugin

These deferred modes require plugin-level REST endpoints that `save` also needs, so they ship together.

---

## File Map

### New files

| File | Responsibility |
|------|---------------|
| `cli/src/commands/get.ts` | `get` command — download + write files or ZIP |
| `cli/src/commands/create.ts` | `create` command — scaffold plugin or skill locally |
| `cli/src/__tests__/get.test.ts` | Get command tests |
| `cli/src/__tests__/create.test.ts` | Create command tests |

### Modified files

| File | Changes |
|------|---------|
| `src/rest-api.ts` | Add `GET /api/skills/:name/download` and `GET /api/skills/:name/package` endpoints |
| `cli/src/index.ts` | Add `get` and `create` to command routing |
| `src/search-chunks.ts` | Add search chunks for get and create commands |

---

## Task 1: Download REST Endpoint

**Files:**
- Modify: `src/rest-api.ts`

The existing `handleGetSkill` returns metadata + file paths. We need a new endpoint that returns full file content using the existing `github.fetchSkill()` method.

- [ ] **Step 1: Add handleDownloadSkill function**

Add this function to `src/rest-api.ts`, after the existing `handleGetSkill` function (around line 284):

```typescript
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
```

- [ ] **Step 2: Add handlePackageSkill function**

Add this function right after `handleDownloadSkill`:

```typescript
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
```

**Note:** `packageSkill` is already exported from `src/skill-packager.ts`. Add the import at the top of rest-api.ts if not already present:

```typescript
import { packageSkill } from "./skill-packager";
```

- [ ] **Step 3: Add routes to the router**

In the main router function `handleAPI`, add these routes after the existing `GET /api/skills/:name/edit` route (around line 1173):

```typescript
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
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 5: Run all tests**

Run: `npx vitest run`
Expected: All existing tests still pass

- [ ] **Step 6: Commit**

```bash
git add src/rest-api.ts
git commit -m "feat(v3): add download and package REST endpoints for get command"
```

---

## Task 2: CLI `get` Command (Unpacked)

**Files:**
- Create: `cli/src/commands/get.ts`
- Test: `cli/src/__tests__/get.test.ts`

- [ ] **Step 1: Write failing tests**

Create `cli/src/__tests__/get.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { runGet } from "../commands/get";
import type { ParsedArgs } from "../index";

// Mock fs
const mockMkdir = vi.fn().mockResolvedValue(undefined);
const mockWriteFile = vi.fn().mockResolvedValue(undefined);
vi.mock("fs/promises", () => ({
  mkdir: (...args: unknown[]) => mockMkdir(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
}));

function mockApi(getResp?: unknown, postResp?: unknown) {
  return {
    get: vi.fn().mockResolvedValue(getResp),
    post: vi.fn().mockResolvedValue(postResp),
  };
}

function captureOutput(fn: () => Promise<void>): Promise<string[]> {
  const lines: string[] = [];
  const orig = console.log;
  console.log = (...args: unknown[]) => lines.push(args.join(" "));
  return fn().then(() => {
    console.log = orig;
    return lines;
  });
}

function captureStderr(fn: () => Promise<void>): Promise<string[]> {
  const lines: string[] = [];
  const orig = console.error;
  console.error = (...args: unknown[]) => lines.push(args.join(" "));
  return fn().then(() => {
    console.error = orig;
    return lines;
  });
}

beforeEach(() => {
  mockMkdir.mockReset().mockResolvedValue(undefined);
  mockWriteFile.mockReset().mockResolvedValue(undefined);
});

const downloadResponse = {
  skill: { name: "code-review", version: "1.2.0", plugin: "dev-tools" },
  plugin: { name: "dev-tools", version: "1.2.0" },
  files: [
    { path: "SKILL.md", content: "# Code Review\n\nReview code." },
    { path: ".claude-plugin/plugin.json", content: '{"version":"1.2.0"}' },
  ],
};

const packageResponse = {
  skill: { name: "code-review", version: "1.2.0" },
  package: {
    filename: "code-review.skill",
    content_base64: "UEsDBBQ...",  // placeholder base64
  },
};

describe("runGet", () => {
  describe("unpacked mode", () => {
    it("downloads and writes skill files to cwd", async () => {
      const api = mockApi(downloadResponse);
      const args: ParsedArgs = {
        command: "get",
        positional: ["code-review"],
        code: "abc",
        flags: {},
      };

      const lines = await captureOutput(() => runGet(args, api as any));

      expect(api.get).toHaveBeenCalledWith("/api/skills/code-review/download");
      expect(mockMkdir).toHaveBeenCalled();
      expect(mockWriteFile).toHaveBeenCalledTimes(2);
      expect(lines.some((l) => l.includes("code-review"))).toBe(true);
      expect(lines.some((l) => l.includes("2 file"))).toBe(true);
    });

    it("creates subdirectories for nested file paths", async () => {
      const api = mockApi(downloadResponse);
      const args: ParsedArgs = {
        command: "get",
        positional: ["code-review"],
        code: "abc",
        flags: {},
      };

      await runGet(args, api as any);

      // Should create dir for .claude-plugin/plugin.json
      const mkdirCalls = mockMkdir.mock.calls.map((c) => c[0]);
      expect(mkdirCalls.some((p: string) => p.includes(".claude-plugin"))).toBe(true);
    });
  });

  describe("ZIP mode", () => {
    it("downloads and writes .skill ZIP", async () => {
      const api = mockApi(packageResponse);
      const args: ParsedArgs = {
        command: "get",
        positional: ["code-review"],
        code: "abc",
        flags: { format: "skill" },
      };

      const lines = await captureOutput(() => runGet(args, api as any));

      expect(api.get).toHaveBeenCalledWith("/api/skills/code-review/package");
      expect(mockWriteFile).toHaveBeenCalledTimes(1);
      const writeCall = mockWriteFile.mock.calls[0];
      expect(writeCall[0]).toContain("code-review.skill");
      expect(lines.some((l) => l.includes(".skill"))).toBe(true);
    });
  });

  describe("validation", () => {
    it("errors when no name provided", async () => {
      const api = mockApi();
      const args: ParsedArgs = {
        command: "get",
        positional: [],
        code: "abc",
        flags: {},
      };

      const errors = await captureStderr(() =>
        runGet(args, api as any).catch(() => {}),
      );
      expect(errors.some((l) => l.includes("Usage"))).toBe(true);
      expect(api.get).not.toHaveBeenCalled();
    });

    it("rejects --skills-only --format plugin", async () => {
      const api = mockApi();
      const args: ParsedArgs = {
        command: "get",
        positional: ["my-plugin"],
        code: "abc",
        flags: { "skills-only": true, format: "plugin" },
      };

      const errors = await captureStderr(() =>
        runGet(args, api as any).catch(() => {}),
      );
      expect(errors.some((l) => l.includes("Invalid"))).toBe(true);
      expect(api.get).not.toHaveBeenCalled();
    });

    it("rejects --skill with --format plugin", async () => {
      const api = mockApi();
      const args: ParsedArgs = {
        command: "get",
        positional: ["my-plugin"],
        code: "abc",
        flags: { skill: "my-skill", format: "plugin" },
      };

      const errors = await captureStderr(() =>
        runGet(args, api as any).catch(() => {}),
      );
      expect(errors.some((l) => l.includes("Invalid"))).toBe(true);
      expect(api.get).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run cli/src/__tests__/get.test.ts`
Expected: FAIL — `runGet` does not exist

- [ ] **Step 3: Implement get command**

Create `cli/src/commands/get.ts`:

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run cli/src/__tests__/get.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add cli/src/commands/get.ts cli/src/__tests__/get.test.ts
git commit -m "feat(v3): add CLI get command (unpacked + ZIP modes)"
```

---

## Task 3: CLI `create` Command

**Files:**
- Create: `cli/src/commands/create.ts`
- Test: `cli/src/__tests__/create.test.ts`

- [ ] **Step 1: Write failing tests**

Create `cli/src/__tests__/create.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { runCreate } from "../commands/create";
import type { ParsedArgs } from "../index";

const mockMkdir = vi.fn().mockResolvedValue(undefined);
const mockWriteFile = vi.fn().mockResolvedValue(undefined);
const mockStat = vi.fn().mockRejectedValue(new Error("ENOENT"));
vi.mock("fs/promises", () => ({
  mkdir: (...args: unknown[]) => mockMkdir(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  stat: (...args: unknown[]) => mockStat(...args),
}));

function captureOutput(fn: () => Promise<void>): Promise<string[]> {
  const lines: string[] = [];
  const orig = console.log;
  console.log = (...args: unknown[]) => lines.push(args.join(" "));
  return fn().then(() => {
    console.log = orig;
    return lines;
  });
}

function captureStderr(fn: () => Promise<void>): Promise<string[]> {
  const lines: string[] = [];
  const orig = console.error;
  console.error = (...args: unknown[]) => lines.push(args.join(" "));
  return fn().then(() => {
    console.error = orig;
    return lines;
  });
}

beforeEach(() => {
  mockMkdir.mockReset().mockResolvedValue(undefined);
  mockWriteFile.mockReset().mockResolvedValue(undefined);
  mockStat.mockReset().mockRejectedValue(new Error("ENOENT"));
});

describe("runCreate", () => {
  describe("plugin scaffold", () => {
    it("creates plugin directory structure", async () => {
      const args: ParsedArgs = {
        command: "create",
        positional: ["my-plugin"],
        flags: {},
      };

      const lines = await captureOutput(() => runCreate(args));

      expect(mockMkdir).toHaveBeenCalled();
      expect(mockWriteFile).toHaveBeenCalled();

      // Check that plugin.json was written
      const writeCalls = mockWriteFile.mock.calls;
      const paths = writeCalls.map((c) => c[0] as string);
      expect(paths.some((p) => p.includes("plugin.json"))).toBe(true);
      expect(paths.some((p) => p.includes("SKILL.md"))).toBe(true);
      expect(lines.some((l) => l.includes("my-plugin"))).toBe(true);
    });

    it("errors when no name provided", async () => {
      const args: ParsedArgs = {
        command: "create",
        positional: [],
        flags: {},
      };

      const errors = await captureStderr(() =>
        runCreate(args).catch(() => {}),
      );
      expect(errors.some((l) => l.includes("Usage") || l.includes("name"))).toBe(true);
    });

    it("errors when directory already exists", async () => {
      mockStat.mockResolvedValue({ isDirectory: () => true });

      const args: ParsedArgs = {
        command: "create",
        positional: ["my-plugin"],
        flags: {},
      };

      const errors = await captureStderr(() =>
        runCreate(args).catch(() => {}),
      );
      expect(errors.some((l) => l.includes("already exists"))).toBe(true);
    });
  });

  describe("skill scaffold", () => {
    it("creates skill directory structure", async () => {
      const args: ParsedArgs = {
        command: "create",
        positional: [],
        flags: { skill: "my-skill" },
      };

      const lines = await captureOutput(() => runCreate(args));

      const writeCalls = mockWriteFile.mock.calls;
      const paths = writeCalls.map((c) => c[0] as string);
      expect(paths.some((p) => p.includes("SKILL.md"))).toBe(true);
      expect(paths.some((p) => p.includes("plugin.json"))).toBe(true);
      expect(lines.some((l) => l.includes("my-skill"))).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run cli/src/__tests__/create.test.ts`
Expected: FAIL — `runCreate` does not exist

- [ ] **Step 3: Implement create command**

Create `cli/src/commands/create.ts`:

```typescript
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
      // stat succeeded = directory exists
      console.error(`Error: Directory '${name}' already exists.`);
      throw new Error("Directory already exists");
    }
  }

  // Create plugin structure:
  // name/
  //   .claude-plugin/plugin.json
  //   skills/name/SKILL.md
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

  // Create skill structure:
  // name/
  //   SKILL.md
  //   .claude-plugin/plugin.json
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run cli/src/__tests__/create.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add cli/src/commands/create.ts cli/src/__tests__/create.test.ts
git commit -m "feat(v3): add CLI create command (plugin + skill scaffolding)"
```

---

## Task 4: Wire Commands into Router

**Files:**
- Modify: `cli/src/index.ts`

- [ ] **Step 1: Add get and create to command routing**

In `cli/src/index.ts`, find the `switch (args.command)` block in the `isMain` section. Add cases for `get` and `create`.

For `get`, add a case inside the switch:

```typescript
      case "get": {
        const { runGet } = await import("./commands/get");
        await runGet(args, api);
        break;
      }
```

For `create`, replace the existing stub (`console.error("(create: not yet implemented)")`) with the real implementation. The `create` command is LOCAL — it runs before the `ApiClient` is created. Move it above the remote commands block:

```typescript
  // Local-only commands (no --code needed)
  if (args.command === "create") {
    const { runCreate } = await import("./commands/create");
    await runCreate(args);
    process.exit(0);
  }
```

This replaces the existing `create` stub that says "not yet implemented".

- [ ] **Step 2: Run parse tests to verify nothing broke**

Run: `npx vitest run cli/src/__tests__/parse.test.ts`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add cli/src/index.ts
git commit -m "feat(v3): wire get and create commands into CLI router"
```

---

## Task 5: Search Chunks

**Files:**
- Modify: `src/search-chunks.ts`

- [ ] **Step 1: Add search chunks for get and create commands**

Append to the `SEARCH_CHUNKS` array in `src/search-chunks.ts`:

```typescript
  {
    id: "get-command",
    title: "skillport get",
    content:
      "Download a skill from the marketplace.\n\n" +
      "```\n" +
      "skillport get <name> --code <CODE>                        # unpacked files\n" +
      "skillport get <name> --format skill --code <CODE>          # .skill ZIP\n" +
      "```\n\n" +
      "Files are written to `./<name>/` (unpacked) or `./<name>.skill` (ZIP).\n\n" +
      "Future flags (not yet implemented):\n" +
      "- `--skill <name>` — target a specific skill within a plugin\n" +
      "- `--skills-only` — get all skills as standalone\n" +
      "- `--format plugin` — download as .plugin ZIP",
    category: "commands",
    keywords: ["get", "download", "install", "fetch", "skill", "plugin", "zip", "format"],
  },
  {
    id: "create-command",
    title: "skillport create",
    content:
      "Scaffold a new plugin or skill directory locally. No auth required.\n\n" +
      "```\n" +
      "skillport create <name>              # new plugin with one skill\n" +
      "skillport create --skill <name>       # standalone skill\n" +
      "```\n\n" +
      "Plugin scaffold creates:\n" +
      "- `.claude-plugin/plugin.json`\n" +
      "- `skills/<name>/SKILL.md`\n\n" +
      "Skill scaffold creates:\n" +
      "- `SKILL.md`\n" +
      "- `.claude-plugin/plugin.json`\n\n" +
      "After creating, edit SKILL.md and use `skillport save` to publish.",
    category: "commands",
    keywords: ["create", "scaffold", "new", "template", "plugin", "skill", "init", "start"],
  },
```

- [ ] **Step 2: Run search index tests**

Run: `npx vitest run src/__tests__/search-index.test.ts`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/search-chunks.ts
git commit -m "feat(v3): add search chunks for get and create commands"
```

---

## Task 6: Build, Deploy, End-to-End Test

- [ ] **Step 1: Run all tests**

```bash
npx vitest run
```
Expected: All tests pass

- [ ] **Step 2: Build CLI**

```bash
npm run build:cli
```

- [ ] **Step 3: Test locally**

```bash
node dist/skillport.js get
# Expected: Error: --code is required for 'get'.

node dist/skillport.js create
# Expected: Usage: skillport create <name> OR skillport create --skill <name>

node dist/skillport.js create test-plugin
# Expected: Creates test-plugin/ directory with scaffold files

ls test-plugin/.claude-plugin/plugin.json test-plugin/skills/test-plugin/SKILL.md
# Expected: both files exist

rm -rf test-plugin
```

- [ ] **Step 4: Upload and deploy**

```bash
npx wrangler kv key put "cli:bundle" --namespace-id=2328f53c6e5846d6830cae916254634c --path=dist/skillport.js --remote
npm run deploy
```

- [ ] **Step 5: Test get command end-to-end**

Get a fresh auth code via MCP, then:

```bash
curl -sO https://skillport-connector.jack-ivers.workers.dev/cli/skillport.js
node skillport.js get surface-detect --code <CODE>
ls surface-detect/
```
Expected: skill files written to `./surface-detect/`

```bash
node skillport.js get surface-detect --format skill --code <CODE>
ls surface-detect.skill
```
Expected: `.skill` ZIP file created

- [ ] **Step 6: Test from Claude.ai sandbox**

In a Claude.ai conversation:
1. Model calls `search("get command")` — should return get command docs
2. Model calls `execute({ method: "auth.get_code" })` — returns code
3. Model downloads CLI and runs `node skillport.js get <some-skill> --code <CODE>`
4. Model verifies files were written

- [ ] **Step 7: Commit any fixes**

```bash
git add -A
git commit -m "fix(v3): fixes from get/create e2e testing"
```

---

## Summary

After completing all 6 tasks:

- **`get` command** downloads skills unpacked or as .skill ZIP
- **`create` command** scaffolds plugin or skill directories locally
- **Two new REST endpoints** serve file content and ZIP packages
- **Search chunks** teach the model about both commands
- **All code has tests** — TDD throughout

**Next:** Plan 4 (Save + Lifecycle Commands) — push changes, deactivate/reactivate/delete, sync marketplace.
