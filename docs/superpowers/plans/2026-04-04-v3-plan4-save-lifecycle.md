# Skillport v3 — Plan 4: Save + Lifecycle Commands

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `save` command (read local files, push to marketplace, bump version) and lifecycle commands (`deactivate`, `reactivate`, `delete`, `sync`). After this plan, the full authoring workflow works end-to-end: create → edit → save → manage.

**Architecture:** The CLI `save` command reads files from disk, POSTs them to the existing `POST /api/skills/:name` endpoint, then calls `POST /api/skills/:name/bump`. Lifecycle commands (`deactivate`, `reactivate`, `sync`) need new Worker endpoints. `delete` uses the existing `DELETE /api/skills/:name`. The CLI orchestrates multi-step workflows; the Worker handles individual operations.

**Tech Stack:** TypeScript, Vitest, esbuild, Node `fs` + `path`

**Spec:** `docs/superpowers/specs/2026-04-03-skillport-v3-design.md` (Sections 2, 5)

**Depends on:** Plan 3 complete (get + create commands working)

---

## File Map

### New files

| File | Responsibility |
|------|---------------|
| `cli/src/commands/save.ts` | `save` command — read local files, push + bump |
| `cli/src/commands/lifecycle.ts` | `deactivate`, `reactivate`, `delete` commands |
| `cli/src/commands/sync.ts` | `sync` command — regenerate marketplace.json |
| `cli/src/__tests__/save.test.ts` | Save command tests |
| `cli/src/__tests__/lifecycle.test.ts` | Lifecycle command tests |
| `cli/src/__tests__/sync.test.ts` | Sync command tests |

### Modified files

| File | Changes |
|------|---------|
| `src/rest-api.ts` | Add deactivate, reactivate, sync endpoints |
| `cli/src/index.ts` | Add save, deactivate, reactivate, delete, sync to command routing |
| `src/search-chunks.ts` | Add search chunks for save, lifecycle, sync |

---

## Task 1: Deactivate + Reactivate REST Endpoints

**Files:**
- Modify: `src/rest-api.ts`

- [ ] **Step 1: Add handleDeactivatePlugin function**

Add after the existing `handleDeleteSkill` function in `src/rest-api.ts`:

```typescript
/**
 * POST /api/skills/:name/deactivate - Deactivate a plugin
 * Sets "deactivated": true in plugin.json AND removes from marketplace.json.
 */
async function handleDeactivatePlugin(
  env: Env,
  user: CodeData,
  skillName: string
): Promise<Response> {
  try {
    logAction(user.email, "deactivate_plugin", { skill: skillName });
    const github = getGitHubClient(env);
    const accessControl = await getAccessControl(env, user.provider, user.uid);

    const skill = await github.getSkill(skillName);
    if (!skill) {
      return errorResponse("Skill not found", `Skill '${skillName}' not found`, 404);
    }

    if (!accessControl.canWrite(skill.plugin)) {
      return errorResponse(
        "Access denied",
        `You don't have write access to '${skill.plugin}'`,
        403
      );
    }

    const writeClient = getWriteGitHubClient(env);
    const pluginJsonPath = `plugins/${skill.plugin}/.claude-plugin/plugin.json`;

    // Read current plugin.json
    let pluginJson: Record<string, unknown>;
    try {
      const content = await github.getFileContent(pluginJsonPath);
      pluginJson = JSON.parse(content);
    } catch {
      return errorResponse(
        "Plugin error",
        `Could not read plugin.json for '${skill.plugin}'`,
        500
      );
    }

    if (pluginJson.deactivated === true) {
      return errorResponse(
        "Already deactivated",
        `'${skill.plugin}' is already deactivated`,
        400
      );
    }

    // Set deactivated flag
    pluginJson.deactivated = true;
    await writeClient.updateFile(
      pluginJsonPath,
      JSON.stringify(pluginJson, null, 2),
      `Deactivate ${skill.plugin}\n\nRequested by: ${user.email}`
    );

    // Remove from marketplace.json
    try {
      await writeClient.removeFromMarketplace(skill.plugin, user.email);
    } catch (err) {
      // Not in marketplace — that's fine
      const errMsg = err instanceof Error ? err.message : String(err);
      if (!errMsg.includes("not found in marketplace")) {
        throw err;
      }
    }

    await github.clearCache(skill.plugin);
    await github.clearCache();

    return jsonResponse({
      success: true,
      plugin: skill.plugin,
      action: "deactivated",
    });
  } catch (error) {
    return errorResponse(
      "Failed to deactivate",
      error instanceof Error ? error.message : String(error),
      500
    );
  }
}

/**
 * POST /api/skills/:name/reactivate - Reactivate a deactivated plugin
 * Removes "deactivated" flag and re-adds to marketplace.json.
 */
async function handleReactivatePlugin(
  env: Env,
  user: CodeData,
  skillName: string
): Promise<Response> {
  try {
    logAction(user.email, "reactivate_plugin", { skill: skillName });
    const github = getGitHubClient(env);
    const accessControl = await getAccessControl(env, user.provider, user.uid);

    const skill = await github.getSkill(skillName);
    if (!skill) {
      return errorResponse("Skill not found", `Skill '${skillName}' not found`, 404);
    }

    if (!accessControl.canWrite(skill.plugin)) {
      return errorResponse(
        "Access denied",
        `You don't have write access to '${skill.plugin}'`,
        403
      );
    }

    const writeClient = getWriteGitHubClient(env);
    const pluginJsonPath = `plugins/${skill.plugin}/.claude-plugin/plugin.json`;

    let pluginJson: Record<string, unknown>;
    try {
      const content = await github.getFileContent(pluginJsonPath);
      pluginJson = JSON.parse(content);
    } catch {
      return errorResponse(
        "Plugin error",
        `Could not read plugin.json for '${skill.plugin}'`,
        500
      );
    }

    if (pluginJson.deactivated !== true) {
      return errorResponse(
        "Not deactivated",
        `'${skill.plugin}' is not deactivated`,
        400
      );
    }

    // Remove deactivated flag
    delete pluginJson.deactivated;
    await writeClient.updateFile(
      pluginJsonPath,
      JSON.stringify(pluginJson, null, 2),
      `Reactivate ${skill.plugin}\n\nRequested by: ${user.email}`
    );

    // Re-add to marketplace.json
    await writeClient.upsertMarketplaceEntry(
      {
        name: skill.plugin,
        description: (pluginJson.description as string) || `${skill.plugin} plugin`,
        version: (pluginJson.version as string) || undefined,
      },
      user.email
    );

    await github.clearCache(skill.plugin);
    await github.clearCache();

    return jsonResponse({
      success: true,
      plugin: skill.plugin,
      action: "reactivated",
    });
  } catch (error) {
    return errorResponse(
      "Failed to reactivate",
      error instanceof Error ? error.message : String(error),
      500
    );
  }
}
```

- [ ] **Step 2: Add handleSync function**

```typescript
/**
 * POST /api/sync - Regenerate marketplace.json from plugin.json files
 * Scans all plugin directories, skips deactivated plugins.
 */
async function handleSync(
  env: Env,
  user: CodeData,
  dryRun: boolean
): Promise<Response> {
  try {
    logAction(user.email, "sync_marketplace", { dryRun });
    const github = getGitHubClient(env);
    const accessControl = await getAccessControl(env, user.provider, user.uid);

    if (!accessControl.isEditor()) {
      return errorResponse("Access denied", "Only editors can sync the marketplace", 403);
    }

    // Get current marketplace
    const currentMarketplace = await github.getMarketplace();

    // List all plugin directories
    const allPlugins = await github.listPlugins();

    // Build new marketplace from plugin.json files
    const newPlugins: Array<{
      name: string;
      source: string;
      description?: string;
      version?: string;
      category?: string;
    }> = [];

    for (const plugin of allPlugins) {
      // Read plugin.json
      let pluginJson: Record<string, unknown>;
      try {
        const content = await github.getFileContent(
          `${plugin.source.replace("./", "")}/.claude-plugin/plugin.json`
        );
        pluginJson = JSON.parse(content);
      } catch {
        continue; // Skip plugins without valid plugin.json
      }

      // Skip deactivated plugins
      if (pluginJson.deactivated === true) {
        continue;
      }

      newPlugins.push({
        name: plugin.name,
        source: plugin.source,
        description: (pluginJson.description as string) || undefined,
        version: (pluginJson.version as string) || undefined,
        category: (pluginJson.category as string) || undefined,
      });
    }

    // Calculate diff
    const currentNames = new Set(currentMarketplace.plugins.map((p) => p.name));
    const newNames = new Set(newPlugins.map((p) => p.name));
    const added = newPlugins.filter((p) => !currentNames.has(p.name));
    const removed = currentMarketplace.plugins.filter((p) => !newNames.has(p.name));
    const kept = newPlugins.filter((p) => currentNames.has(p.name));

    if (dryRun) {
      return jsonResponse({
        dryRun: true,
        current: currentMarketplace.plugins.length,
        proposed: newPlugins.length,
        added: added.map((p) => p.name),
        removed: removed.map((p) => p.name),
        kept: kept.map((p) => p.name),
      });
    }

    // Write new marketplace.json
    const writeClient = getWriteGitHubClient(env);
    const newMarketplace = {
      ...currentMarketplace,
      plugins: newPlugins.map((p) => ({
        name: p.name,
        source: p.source,
        ...(p.description ? { description: p.description } : {}),
        ...(p.version ? { version: p.version } : {}),
        ...(p.category ? { category: p.category } : {}),
      })),
    };

    await writeClient.updateFile(
      ".claude-plugin/marketplace.json",
      JSON.stringify(newMarketplace, null, 2),
      `Sync marketplace.json (${newPlugins.length} plugins)\n\nRequested by: ${user.email}`
    );

    await github.clearCache();

    return jsonResponse({
      success: true,
      plugins: newPlugins.length,
      added: added.map((p) => p.name),
      removed: removed.map((p) => p.name),
    });
  } catch (error) {
    return errorResponse(
      "Failed to sync marketplace",
      error instanceof Error ? error.message : String(error),
      500
    );
  }
}
```

- [ ] **Step 3: Add routes to the router**

Add these routes in the router section of `handleAPI`, before the `return errorResponse("Not found", ...)` at the end:

```typescript
  // Route: POST /api/skills/:name/deactivate
  if (
    pathParts[0] === "skills" &&
    pathParts.length === 3 &&
    pathParts[2] === "deactivate" &&
    method === "POST"
  ) {
    const skillName = pathParts[1];
    if (!validateName(skillName)) {
      return errorResponse("Invalid skill name", "Skill name must contain only lowercase letters, numbers, and hyphens", 400);
    }
    return handleDeactivatePlugin(env, user, skillName);
  }

  // Route: POST /api/skills/:name/reactivate
  if (
    pathParts[0] === "skills" &&
    pathParts.length === 3 &&
    pathParts[2] === "reactivate" &&
    method === "POST"
  ) {
    const skillName = pathParts[1];
    if (!validateName(skillName)) {
      return errorResponse("Invalid skill name", "Skill name must contain only lowercase letters, numbers, and hyphens", 400);
    }
    return handleReactivatePlugin(env, user, skillName);
  }

  // Route: POST /api/sync
  if (pathParts[0] === "sync" && method === "POST") {
    const dryRun = url.searchParams.get("dry_run") === "true";
    return handleSync(env, user, dryRun);
  }
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 5: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/rest-api.ts
git commit -m "feat(v3): add deactivate, reactivate, sync REST endpoints"
```

---

## Task 2: CLI `save` Command

**Files:**
- Create: `cli/src/commands/save.ts`
- Test: `cli/src/__tests__/save.test.ts`

- [ ] **Step 1: Write failing tests**

Create `cli/src/__tests__/save.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { runSave } from "../commands/save";
import type { ParsedArgs } from "../index";

// Mock fs
const mockReaddir = vi.fn();
const mockReadFile = vi.fn();
const mockStat = vi.fn();
vi.mock("fs/promises", () => ({
  readdir: (...args: unknown[]) => mockReaddir(...args),
  readFile: (...args: unknown[]) => mockReadFile(...args),
  stat: (...args: unknown[]) => mockStat(...args),
}));

function mockApi(postResp?: unknown) {
  return {
    get: vi.fn(),
    post: vi.fn().mockResolvedValue(postResp ?? { success: true, summary: "1 file(s) updated" }),
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
  mockReaddir.mockReset();
  mockReadFile.mockReset();
  mockStat.mockReset();
});

describe("runSave", () => {
  it("reads local files and posts to API then bumps", async () => {
    // Simulate a skill directory: SKILL.md + .claude-plugin/plugin.json
    mockStat.mockResolvedValue({ isDirectory: () => true });
    mockReaddir
      .mockResolvedValueOnce([
        { name: "SKILL.md", isDirectory: () => false, isFile: () => true },
        { name: ".claude-plugin", isDirectory: () => true, isFile: () => false },
      ])
      .mockResolvedValueOnce([
        { name: "plugin.json", isDirectory: () => false, isFile: () => true },
      ]);
    mockReadFile.mockResolvedValue("file content");

    const api = mockApi();
    const args: ParsedArgs = {
      command: "save",
      positional: ["my-skill", "patch"],
      code: "abc",
      flags: {},
    };

    const lines = await captureOutput(() => runSave(args, api as any));

    // Should POST files then bump
    expect(api.post).toHaveBeenCalledTimes(2);
    const saveCall = api.post.mock.calls[0];
    expect(saveCall[0]).toBe("/api/skills/my-skill");
    const bumpCall = api.post.mock.calls[1];
    expect(bumpCall[0]).toBe("/api/skills/my-skill/bump");
    expect(bumpCall[1]).toEqual({ type: "patch" });
  });

  it("errors when no name provided", async () => {
    const api = mockApi();
    const args: ParsedArgs = {
      command: "save",
      positional: [],
      code: "abc",
      flags: {},
    };

    const errors = await captureStderr(() =>
      runSave(args, api as any).catch(() => {}),
    );
    expect(errors.some((l) => l.includes("Usage"))).toBe(true);
  });

  it("errors when no bump type provided", async () => {
    const api = mockApi();
    const args: ParsedArgs = {
      command: "save",
      positional: ["my-skill"],
      code: "abc",
      flags: {},
    };

    const errors = await captureStderr(() =>
      runSave(args, api as any).catch(() => {}),
    );
    expect(errors.some((l) => l.includes("patch") || l.includes("bump"))).toBe(true);
  });

  it("errors when directory does not exist", async () => {
    mockStat.mockRejectedValue(new Error("ENOENT"));
    const api = mockApi();
    const args: ParsedArgs = {
      command: "save",
      positional: ["nonexistent", "patch"],
      code: "abc",
      flags: {},
    };

    const errors = await captureStderr(() =>
      runSave(args, api as any).catch(() => {}),
    );
    expect(errors.some((l) => l.includes("not found") || l.includes("ENOENT"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run cli/src/__tests__/save.test.ts`
Expected: FAIL — `runSave` does not exist

- [ ] **Step 3: Implement save command**

Create `cli/src/commands/save.ts`:

```typescript
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

  // Read local directory
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

  // Step 1: POST files
  const saveResult = await api.post<SaveResponse>(`/api/skills/${encodeURIComponent(name)}`, {
    files,
  });

  console.log(saveResult.summary);

  // Step 2: Bump version
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run cli/src/__tests__/save.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add cli/src/commands/save.ts cli/src/__tests__/save.test.ts
git commit -m "feat(v3): add CLI save command (read local files + push + bump)"
```

---

## Task 3: CLI Lifecycle Commands

**Files:**
- Create: `cli/src/commands/lifecycle.ts`
- Test: `cli/src/__tests__/lifecycle.test.ts`

- [ ] **Step 1: Write failing tests**

Create `cli/src/__tests__/lifecycle.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { runDeactivate, runReactivate, runDelete } from "../commands/lifecycle";
import type { ParsedArgs } from "../index";

function mockApi(resp?: unknown) {
  return {
    get: vi.fn(),
    post: vi.fn().mockResolvedValue(resp ?? { success: true }),
    delete: vi.fn().mockResolvedValue(resp ?? { success: true }),
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

describe("runDeactivate", () => {
  it("calls deactivate endpoint", async () => {
    const api = mockApi({ success: true, plugin: "my-plugin", action: "deactivated" });
    const args: ParsedArgs = {
      command: "deactivate",
      positional: ["my-plugin"],
      code: "abc",
      flags: {},
    };

    const lines = await captureOutput(() => runDeactivate(args, api as any));

    expect(api.post).toHaveBeenCalledWith("/api/skills/my-plugin/deactivate", {});
    expect(lines.some((l) => l.includes("deactivated"))).toBe(true);
  });

  it("errors when no name provided", async () => {
    const api = mockApi();
    const args: ParsedArgs = { command: "deactivate", positional: [], code: "abc", flags: {} };

    const errors = await captureStderr(() => runDeactivate(args, api as any).catch(() => {}));
    expect(errors.some((l) => l.includes("Usage"))).toBe(true);
  });
});

describe("runReactivate", () => {
  it("calls reactivate endpoint", async () => {
    const api = mockApi({ success: true, plugin: "my-plugin", action: "reactivated" });
    const args: ParsedArgs = {
      command: "reactivate",
      positional: ["my-plugin"],
      code: "abc",
      flags: {},
    };

    const lines = await captureOutput(() => runReactivate(args, api as any));

    expect(api.post).toHaveBeenCalledWith("/api/skills/my-plugin/reactivate", {});
    expect(lines.some((l) => l.includes("reactivated"))).toBe(true);
  });
});

describe("runDelete", () => {
  it("calls delete endpoint with confirm", async () => {
    const api = mockApi({ success: true, skill: "my-skill", deletedFiles: ["SKILL.md"] });
    const args: ParsedArgs = {
      command: "delete",
      positional: ["my-skill"],
      code: "abc",
      flags: { confirm: true },
    };

    const lines = await captureOutput(() => runDelete(args, api as any));

    expect(api.delete).toHaveBeenCalledWith("/api/skills/my-skill?confirm=true");
    expect(lines.some((l) => l.includes("Deleted") || l.includes("deleted"))).toBe(true);
  });

  it("errors when --confirm not set", async () => {
    const api = mockApi();
    const args: ParsedArgs = {
      command: "delete",
      positional: ["my-skill"],
      code: "abc",
      flags: {},
    };

    const errors = await captureStderr(() => runDelete(args, api as any).catch(() => {}));
    expect(errors.some((l) => l.includes("--confirm"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run cli/src/__tests__/lifecycle.test.ts`
Expected: FAIL — imports do not exist

- [ ] **Step 3: Implement lifecycle commands**

Create `cli/src/commands/lifecycle.ts`:

```typescript
import type { ParsedArgs } from "../index";
import type { ApiClient } from "../api-client";

interface LifecycleResponse {
  success: boolean;
  plugin: string;
  action: string;
}

interface DeleteResponse {
  success: boolean;
  skill: string;
  plugin: string;
  pluginDeleted: boolean;
  deletedFiles: string[];
}

export async function runDeactivate(
  args: ParsedArgs,
  api: ApiClient,
): Promise<void> {
  const name = args.positional[0];
  if (!name) {
    console.error("Usage: skillport deactivate <name> --code <CODE>");
    throw new Error("Missing plugin name");
  }

  const data = await api.post<LifecycleResponse>(
    `/api/skills/${encodeURIComponent(name)}/deactivate`,
    {},
  );

  console.log(`${data.plugin} deactivated.`);
  console.log("Removed from marketplace. Use 'reactivate' to restore.");
}

export async function runReactivate(
  args: ParsedArgs,
  api: ApiClient,
): Promise<void> {
  const name = args.positional[0];
  if (!name) {
    console.error("Usage: skillport reactivate <name> --code <CODE>");
    throw new Error("Missing plugin name");
  }

  const data = await api.post<LifecycleResponse>(
    `/api/skills/${encodeURIComponent(name)}/reactivate`,
    {},
  );

  console.log(`${data.plugin} reactivated.`);
  console.log("Re-added to marketplace.");
}

export async function runDelete(
  args: ParsedArgs,
  api: ApiClient,
): Promise<void> {
  const name = args.positional[0];
  if (!name) {
    console.error("Usage: skillport delete <name> --confirm --code <CODE>");
    throw new Error("Missing skill name");
  }

  if (!args.flags.confirm) {
    console.error("Error: --confirm flag is required for delete.");
    console.error("This permanently removes files from the marketplace.");
    throw new Error("Missing --confirm flag");
  }

  const data = await api.delete<DeleteResponse>(
    `/api/skills/${encodeURIComponent(name)}?confirm=true`,
  );

  console.log(`Deleted ${data.skill} (${data.deletedFiles.length} file(s) removed)`);
  if (data.pluginDeleted) {
    console.log(`Plugin ${data.plugin} removed (was last skill).`);
  }
}
```

**Note:** The `ApiClient` needs a `delete` method. Add it to `cli/src/api-client.ts`:

In the `ApiClient` class, add after the `post` method:

```typescript
  async delete<T = unknown>(pathWithQuery: string): Promise<T> {
    const url = `${this.baseUrl}${pathWithQuery}`;
    return this.request<T>(url, "DELETE");
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run cli/src/__tests__/lifecycle.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add cli/src/commands/lifecycle.ts cli/src/__tests__/lifecycle.test.ts cli/src/api-client.ts
git commit -m "feat(v3): add CLI deactivate, reactivate, delete commands"
```

---

## Task 4: CLI `sync` Command

**Files:**
- Create: `cli/src/commands/sync.ts`
- Test: `cli/src/__tests__/sync.test.ts`

- [ ] **Step 1: Write failing tests**

Create `cli/src/__tests__/sync.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { runSync } from "../commands/sync";
import type { ParsedArgs } from "../index";

function mockApi(resp?: unknown) {
  return {
    get: vi.fn(),
    post: vi.fn().mockResolvedValue(resp),
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

describe("runSync", () => {
  it("calls sync endpoint", async () => {
    const api = mockApi({
      success: true,
      plugins: 5,
      added: ["new-plugin"],
      removed: ["old-plugin"],
    });
    const args: ParsedArgs = {
      command: "sync",
      positional: [],
      code: "abc",
      flags: {},
    };

    const lines = await captureOutput(() => runSync(args, api as any));

    expect(api.post).toHaveBeenCalledWith("/api/sync", {});
    expect(lines.some((l) => l.includes("5"))).toBe(true);
  });

  it("handles dry-run mode", async () => {
    const api = mockApi({
      dryRun: true,
      current: 10,
      proposed: 11,
      added: ["new-one"],
      removed: [],
      kept: ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"],
    });
    const args: ParsedArgs = {
      command: "sync",
      positional: [],
      code: "abc",
      flags: { "dry-run": true },
    };

    const lines = await captureOutput(() => runSync(args, api as any));

    expect(api.post).toHaveBeenCalledWith("/api/sync?dry_run=true", {});
    expect(lines.some((l) => l.includes("dry") || l.includes("Dry"))).toBe(true);
    expect(lines.some((l) => l.includes("new-one"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run cli/src/__tests__/sync.test.ts`
Expected: FAIL — `runSync` does not exist

- [ ] **Step 3: Implement sync command**

Create `cli/src/commands/sync.ts`:

```typescript
import type { ParsedArgs } from "../index";
import type { ApiClient } from "../api-client";

interface SyncResponse {
  success: boolean;
  plugins: number;
  added: string[];
  removed: string[];
}

interface SyncDryRunResponse {
  dryRun: true;
  current: number;
  proposed: number;
  added: string[];
  removed: string[];
  kept: string[];
}

export async function runSync(
  args: ParsedArgs,
  api: ApiClient,
): Promise<void> {
  const dryRun = args.flags["dry-run"] as boolean | undefined;
  const endpoint = dryRun ? "/api/sync?dry_run=true" : "/api/sync";

  const data = await api.post<SyncResponse | SyncDryRunResponse>(endpoint, {});

  if ("dryRun" in data && data.dryRun) {
    const dr = data as SyncDryRunResponse;
    console.log(`Dry run: ${dr.current} current → ${dr.proposed} proposed`);
    if (dr.added.length > 0) {
      console.log(`  Added: ${dr.added.join(", ")}`);
    }
    if (dr.removed.length > 0) {
      console.log(`  Removed: ${dr.removed.join(", ")}`);
    }
    console.log("No changes written.");
    return;
  }

  const result = data as SyncResponse;
  console.log(`Marketplace synced: ${result.plugins} plugin(s)`);
  if (result.added.length > 0) {
    console.log(`  Added: ${result.added.join(", ")}`);
  }
  if (result.removed.length > 0) {
    console.log(`  Removed: ${result.removed.join(", ")}`);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run cli/src/__tests__/sync.test.ts`
Expected: All 2 tests PASS

- [ ] **Step 5: Commit**

```bash
git add cli/src/commands/sync.ts cli/src/__tests__/sync.test.ts
git commit -m "feat(v3): add CLI sync command (marketplace regeneration)"
```

---

## Task 5: Wire All Commands into Router

**Files:**
- Modify: `cli/src/index.ts`

- [ ] **Step 1: Add all new commands to the switch statement**

In `cli/src/index.ts`, add cases for `save`, `deactivate`, `reactivate`, `delete`, and `sync` in the `switch (args.command)` block:

```typescript
      case "save": {
        const { runSave } = await import("./commands/save");
        await runSave(args, api);
        break;
      }
      case "deactivate": {
        const { runDeactivate } = await import("./commands/lifecycle");
        await runDeactivate(args, api);
        break;
      }
      case "reactivate": {
        const { runReactivate } = await import("./commands/lifecycle");
        await runReactivate(args, api);
        break;
      }
      case "delete": {
        const { runDelete } = await import("./commands/lifecycle");
        await runDelete(args, api);
        break;
      }
      case "sync": {
        const { runSync } = await import("./commands/sync");
        await runSync(args, api);
        break;
      }
```

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add cli/src/index.ts
git commit -m "feat(v3): wire save, lifecycle, sync commands into CLI router"
```

---

## Task 6: Search Chunks

**Files:**
- Modify: `src/search-chunks.ts`

- [ ] **Step 1: Add search chunks for save, lifecycle, and sync**

Append to the `SEARCH_CHUNKS` array:

```typescript
  {
    id: "save-command",
    title: "skillport save",
    content:
      "Push local skill files to the marketplace and bump version.\n\n" +
      "```\n" +
      "skillport save <name> <patch|minor|major> --code <CODE>\n" +
      "```\n\n" +
      "Reads all files from `./<name>/`, uploads to the marketplace, " +
      "and bumps the version. Always specify a bump type.\n\n" +
      "Workflow: `skillport create <name>` → edit SKILL.md → `skillport save <name> patch`",
    category: "commands",
    keywords: ["save", "push", "publish", "upload", "bump", "version", "patch", "minor", "major"],
  },
  {
    id: "deactivate-command",
    title: "skillport deactivate / reactivate",
    content:
      "Remove a plugin from the marketplace (deactivate) or restore it (reactivate).\n\n" +
      "```\n" +
      "skillport deactivate <name> --code <CODE>\n" +
      "skillport reactivate <name> --code <CODE>\n" +
      "```\n\n" +
      "Deactivate sets a flag in plugin.json and removes from marketplace.json. " +
      "The plugin files remain on GitHub. Reactivate reverses this.\n\n" +
      "To permanently delete: deactivate first, then `skillport delete <name> --confirm`.",
    category: "commands",
    keywords: ["deactivate", "reactivate", "remove", "restore", "disable", "enable", "lifecycle"],
  },
  {
    id: "delete-command",
    title: "skillport delete",
    content:
      "Permanently delete a plugin or skill from the marketplace.\n\n" +
      "```\n" +
      "skillport delete <name> --confirm --code <CODE>\n" +
      "```\n\n" +
      "Requires `--confirm` flag. For plugins, must deactivate first. " +
      "Removes all files from GitHub. This cannot be undone.\n\n" +
      "To delete a skill within a plugin (future): `skillport delete <plugin> --skill <skill> --confirm`",
    category: "commands",
    keywords: ["delete", "remove", "destroy", "permanent", "confirm"],
  },
  {
    id: "sync-command",
    title: "skillport sync",
    content:
      "Regenerate marketplace.json from all plugin.json files on GitHub.\n\n" +
      "```\n" +
      "skillport sync --code <CODE>              # write changes\n" +
      "skillport sync --dry-run --code <CODE>     # preview only\n" +
      "```\n\n" +
      "Scans all plugin directories, skips deactivated plugins, " +
      "and rebuilds the marketplace index. Use `--dry-run` to preview changes.",
    category: "commands",
    keywords: ["sync", "regenerate", "marketplace", "rebuild", "index", "dry-run", "validate"],
  },
```

- [ ] **Step 2: Run search index tests**

Run: `npx vitest run src/__tests__/search-index.test.ts`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/search-chunks.ts
git commit -m "feat(v3): add search chunks for save, lifecycle, sync commands"
```

---

## Task 7: Build, Deploy, End-to-End Test

- [ ] **Step 1: Run all tests**

```bash
npx vitest run
```
Expected: All tests pass

- [ ] **Step 2: Bump version, build, upload, deploy**

Update VERSION in `cli/src/index.ts` to `3.0.0-alpha.4`, then:

```bash
npm run build:cli
npx wrangler kv key put "cli:version" "3.0.0-alpha.4" --namespace-id=2328f53c6e5846d6830cae916254634c --remote
npx wrangler kv key put "cli:bundle" --namespace-id=2328f53c6e5846d6830cae916254634c --path=dist/skillport.js --remote
npm run deploy
```

- [ ] **Step 3: Test save end-to-end**

Create a test skill, save it, verify:

```bash
curl -sO https://skillport-connector.jack-ivers.workers.dev/cli/skillport.js
node skillport.js create test-save-skill
# Edit test-save-skill/skills/test-save-skill/SKILL.md if needed
node skillport.js save test-save-skill patch --code <CODE>
node skillport.js info test-save-skill --code <CODE>
```

- [ ] **Step 4: Test lifecycle end-to-end**

```bash
node skillport.js deactivate test-save-skill --code <CODE>
node skillport.js list --code <CODE>
# Should NOT show test-save-skill
node skillport.js reactivate test-save-skill --code <CODE>
node skillport.js list --code <CODE>
# Should show test-save-skill again
```

- [ ] **Step 5: Test sync**

```bash
node skillport.js sync --dry-run --code <CODE>
```

- [ ] **Step 6: Clean up test skill**

```bash
node skillport.js deactivate test-save-skill --code <CODE>
node skillport.js delete test-save-skill --confirm --code <CODE>
```

- [ ] **Step 7: Commit any fixes**

```bash
git add -A
git commit -m "fix(v3): fixes from save/lifecycle/sync e2e testing"
```

---

## Summary

After completing all 7 tasks:

- **`save` command** reads local files, pushes to marketplace, bumps version
- **`deactivate`/`reactivate` commands** manage plugin lifecycle
- **`delete` command** permanently removes plugins/skills (requires `--confirm`)
- **`sync` command** regenerates marketplace.json with `--dry-run` preview
- **3 new REST endpoints** (deactivate, reactivate, sync) + `delete` method on ApiClient
- **Search chunks** teach the model about all commands
- **Full authoring workflow** works: create → edit → save → deactivate → reactivate → delete

**After Plan 4, all 15 CLI commands from the spec are implemented.** The v3 feature branch is ready for review and merge.
