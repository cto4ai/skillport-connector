# Skillport v3 — Plan 2: CLI Framework + Browse Commands

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the hello-world CLI into a real tool — add an API client, command routing, and the four read-only commands (`list`, `info`, `updates`, `whoami`). After this plan, the CLI can browse the marketplace end-to-end from any Claude surface.

**Architecture:** CLI commands are one-file-per-command in `cli/src/commands/`. Each receives `ParsedArgs` + a configured `ApiClient`, calls the Worker REST API, and prints formatted output. The API client handles auth headers, error responses, and base URL resolution.

**Tech Stack:** TypeScript, Vitest, esbuild, native `fetch`

**Spec:** `docs/superpowers/specs/2026-04-03-skillport-v3-design.md` (Sections 2, 5, 7)

**Depends on:** Plan 1 complete (branch `feature/v3-foundation`)

---

## File Map

### New files

| File | Responsibility |
|------|---------------|
| `cli/src/api-client.ts` | HTTP client: base URL, Bearer auth, GET/POST, error handling |
| `cli/src/commands/list.ts` | `list [--surface]` command — tabular marketplace listing |
| `cli/src/commands/info.ts` | `info <plugin> [--skill]` command — detail view |
| `cli/src/commands/updates.ts` | `updates --installed <json>` command — version comparison |
| `cli/src/commands/whoami.ts` | `whoami` command — user identity |
| `cli/src/__tests__/api-client.test.ts` | API client unit tests |
| `cli/src/__tests__/list.test.ts` | List command tests |
| `cli/src/__tests__/info.test.ts` | Info command tests |
| `cli/src/__tests__/updates.test.ts` | Updates command tests |
| `cli/src/__tests__/whoami.test.ts` | Whoami command tests |

### Modified files

| File | Changes |
|------|---------|
| `cli/src/index.ts` | Add command routing dispatch, import commands, pass ApiClient |
| `cli/src/__tests__/parse.test.ts` | Add tests for `--base-url` flag |
| `src/search-chunks.ts` | Add search chunks for list, info, updates, whoami commands |

---

## Task 1: API Client

**Files:**
- Create: `cli/src/api-client.ts`
- Test: `cli/src/__tests__/api-client.test.ts`

- [ ] **Step 1: Write failing tests for API client**

Create `cli/src/__tests__/api-client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiClient, ApiError } from "../api-client";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

describe("ApiClient", () => {
  const client = new ApiClient("https://example.com", "test-code-123");

  describe("get", () => {
    it("sends GET with Bearer token", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: "ok" }),
      });

      const result = await client.get("/api/whoami");

      expect(mockFetch).toHaveBeenCalledWith("https://example.com/api/whoami", {
        method: "GET",
        headers: {
          Authorization: "Bearer test-code-123",
          "Content-Type": "application/json",
        },
      });
      expect(result).toEqual({ data: "ok" });
    });

    it("appends query params", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ count: 1 }),
      });

      await client.get("/api/skills", { surface: "CC" });

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toBe("https://example.com/api/skills?surface=CC");
    });

    it("omits undefined query params", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ count: 1 }),
      });

      await client.get("/api/skills", { surface: undefined, refresh: "true" });

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toBe("https://example.com/api/skills?refresh=true");
    });
  });

  describe("post", () => {
    it("sends POST with JSON body", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ hasUpdates: false }),
      });

      const result = await client.post("/api/check-updates", {
        installed: [{ name: "foo", version: "1.0.0" }],
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "https://example.com/api/check-updates",
        {
          method: "POST",
          headers: {
            Authorization: "Bearer test-code-123",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            installed: [{ name: "foo", version: "1.0.0" }],
          }),
        },
      );
      expect(result).toEqual({ hasUpdates: false });
    });
  });

  describe("error handling", () => {
    it("throws ApiError on 401", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () =>
          Promise.resolve({
            error: "Unauthorized",
            details: "Invalid code",
          }),
      });

      await expect(client.get("/api/whoami")).rejects.toThrow(ApiError);
      await expect(
        client.get("/api/whoami").catch((e) => {
          throw e;
        }),
      ).rejects.toMatchObject({
        status: 401,
        message: expect.stringContaining("Invalid code"),
      });
    });

    it("throws ApiError on 404", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () =>
          Promise.resolve({
            error: "Not found",
            details: "Skill 'foo' not found",
          }),
      });

      await expect(client.get("/api/skills/foo")).rejects.toThrow(ApiError);
    });

    it("throws ApiError on network failure", async () => {
      mockFetch.mockRejectedValueOnce(new Error("fetch failed"));

      await expect(client.get("/api/whoami")).rejects.toThrow(ApiError);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run cli/src/__tests__/api-client.test.ts`
Expected: FAIL — `ApiClient` does not exist

- [ ] **Step 3: Implement the API client**

Create `cli/src/api-client.ts`:

```typescript
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class ApiClient {
  constructor(
    private baseUrl: string,
    private code: string,
  ) {}

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.code}`,
      "Content-Type": "application/json",
    };
  }

  async get<T = unknown>(
    path: string,
    params?: Record<string, string | undefined>,
  ): Promise<T> {
    let url = `${this.baseUrl}${path}`;

    if (params) {
      const filtered = Object.entries(params).filter(
        ([, v]) => v !== undefined,
      ) as [string, string][];
      if (filtered.length > 0) {
        url += "?" + new URLSearchParams(filtered).toString();
      }
    }

    return this.request<T>(url, { method: "GET", headers: this.headers() });
  }

  async post<T = unknown>(path: string, body: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    return this.request<T>(url, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });
  }

  private async request<T>(url: string, init: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (error) {
      throw new ApiError(
        `Network error: ${error instanceof Error ? error.message : String(error)}`,
        0,
      );
    }

    if (!response.ok) {
      let details: string | undefined;
      try {
        const body = await response.json();
        details = body.details || body.error || JSON.stringify(body);
      } catch {
        details = `HTTP ${response.status}`;
      }
      throw new ApiError(details || `HTTP ${response.status}`, response.status, details);
    }

    return response.json() as Promise<T>;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run cli/src/__tests__/api-client.test.ts`
Expected: All tests PASS

Note: The error handling test for 401 calls `client.get` twice. This is intentional — the first `rejects.toThrow(ApiError)` consumes the rejection. The second call re-fetches. Make sure `mockFetch` is set up to handle this. If tests fail because the mock is consumed, adjust: either use `mockResolvedValue` (always returns same value) instead of `mockResolvedValueOnce`, or restructure the test to only call once. The simplest fix: split into two separate `it` blocks.

- [ ] **Step 5: Commit**

```bash
git add cli/src/api-client.ts cli/src/__tests__/api-client.test.ts
git commit -m "feat(v3): add CLI API client with auth + error handling"
```

---

## Task 2: Command Interface + Routing

**Files:**
- Modify: `cli/src/index.ts`
- Test: `cli/src/__tests__/parse.test.ts` (add `--base-url` test)

- [ ] **Step 1: Add `--base-url` flag test**

Add to `cli/src/__tests__/parse.test.ts`:

```typescript
  it("parses --base-url flag", () => {
    const result = parseArgs(["list", "--base-url", "http://localhost:8788", "--code", "abc"]);
    expect(result.command).toBe("list");
    expect(result.flags["base-url"]).toBe("http://localhost:8788");
    expect(result.code).toBe("abc");
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run cli/src/__tests__/parse.test.ts`
Expected: FAIL — `--base-url` is an unknown flag (silently skipped, so `flags["base-url"]` is undefined)

- [ ] **Step 3: Add `--base-url` parsing and command routing to index.ts**

In `cli/src/index.ts`, add `--base-url` to the arg parser. In the `while` loop, after the `--installed` case:

```typescript
    } else if (arg === "--base-url" && i + 1 < argv.length) {
      flags["base-url"] = argv[i + 1];
      i += 2;
```

Then replace the hello-world main block (lines 117-124) with command routing:

```typescript
if (isMain) {
  const args = parseArgs(process.argv.slice(2));

  if (args.command === "help") {
    printHelp();
    process.exit(0);
  }

  if (args.command === "version") {
    console.log(VERSION);
    process.exit(0);
  }

  // Commands that require --code
  const REMOTE_COMMANDS = [
    "list", "info", "updates", "whoami",
    "get", "save", "deactivate", "reactivate", "delete", "sync",
  ];

  if (REMOTE_COMMANDS.includes(args.command) && !args.code) {
    console.error(`Error: --code is required for '${args.command}'.`);
    console.error("Get a code via MCP: execute({ method: \"auth.get_code\" })");
    process.exit(1);
  }

  // Local-only commands
  if (args.command === "create") {
    console.error("(create: not yet implemented)");
    process.exit(1);
  }

  // Remote commands — build API client
  const baseUrl = (args.flags["base-url"] as string) || "https://skillport-connector.jack-ivers.workers.dev";
  const { ApiClient } = await import("./api-client");
  const api = new ApiClient(baseUrl, args.code!);

  try {
    switch (args.command) {
      case "list": {
        const { runList } = await import("./commands/list");
        await runList(args, api);
        break;
      }
      case "info": {
        const { runInfo } = await import("./commands/info");
        await runInfo(args, api);
        break;
      }
      case "updates": {
        const { runUpdates } = await import("./commands/updates");
        await runUpdates(args, api);
        break;
      }
      case "whoami": {
        const { runWhoami } = await import("./commands/whoami");
        await runWhoami(args, api);
        break;
      }
      default:
        console.error(`Command '${args.command}' is not yet implemented.`);
        process.exit(1);
    }
  } catch (error) {
    if (error && typeof error === "object" && "name" in error && error.name === "ApiError") {
      const apiErr = error as { status: number; message: string };
      if (apiErr.status === 401) {
        console.error("Error: Code expired or invalid. Get a new one via MCP auth.get_code.");
      } else {
        console.error(`Error: ${apiErr.message}`);
      }
    } else {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
    process.exit(1);
  }
}
```

Note: The dynamic imports (`await import(...)`) keep the esbuild bundle from pulling in all command files when only one is needed. However, esbuild with `bundle: true` will inline them regardless. This is fine — it's a small bundle. The pattern is for code clarity, not tree-shaking.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run cli/src/__tests__/parse.test.ts`
Expected: All tests PASS (including new `--base-url` test)

- [ ] **Step 5: Commit**

```bash
git add cli/src/index.ts cli/src/__tests__/parse.test.ts
git commit -m "feat(v3): add CLI command routing + --base-url flag"
```

---

## Task 3: `whoami` Command

**Files:**
- Create: `cli/src/commands/whoami.ts`
- Test: `cli/src/__tests__/whoami.test.ts`

The simplest command — good first command to build the pattern.

- [ ] **Step 1: Write failing tests**

Create `cli/src/__tests__/whoami.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { runWhoami } from "../commands/whoami";
import type { ParsedArgs } from "../index";

function mockApi(data: unknown) {
  return {
    get: vi.fn().mockResolvedValue(data),
    post: vi.fn(),
  };
}

// Capture console.log output
function captureOutput(fn: () => Promise<void>): Promise<string[]> {
  const lines: string[] = [];
  const orig = console.log;
  console.log = (...args: unknown[]) => lines.push(args.join(" "));
  return fn().then(() => {
    console.log = orig;
    return lines;
  });
}

describe("runWhoami", () => {
  it("prints user identity", async () => {
    const api = mockApi({
      id: "google:12345",
      email: "jack@example.com",
      name: "Jack Ivers",
      provider: "google",
    });
    const args: ParsedArgs = {
      command: "whoami",
      positional: [],
      code: "abc",
      flags: {},
    };

    const lines = await captureOutput(() => runWhoami(args, api as any));

    expect(lines.some((l) => l.includes("jack@example.com"))).toBe(true);
    expect(lines.some((l) => l.includes("Jack Ivers"))).toBe(true);
    expect(api.get).toHaveBeenCalledWith("/api/whoami");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run cli/src/__tests__/whoami.test.ts`
Expected: FAIL — `runWhoami` does not exist

- [ ] **Step 3: Implement whoami command**

Create `cli/src/commands/whoami.ts`:

```typescript
import type { ParsedArgs } from "../index";
import type { ApiClient } from "../api-client";

interface WhoamiResponse {
  id: string;
  email: string;
  name: string;
  provider: string;
}

export async function runWhoami(
  _args: ParsedArgs,
  api: ApiClient,
): Promise<void> {
  const data = await api.get<WhoamiResponse>("/api/whoami");
  console.log(`${data.name} <${data.email}>`);
  console.log(`ID: ${data.id}`);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run cli/src/__tests__/whoami.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add cli/src/commands/whoami.ts cli/src/__tests__/whoami.test.ts
git commit -m "feat(v3): add CLI whoami command"
```

---

## Task 4: `list` Command

**Files:**
- Create: `cli/src/commands/list.ts`
- Test: `cli/src/__tests__/list.test.ts`

- [ ] **Step 1: Write failing tests**

Create `cli/src/__tests__/list.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { runList } from "../commands/list";
import type { ParsedArgs } from "../index";

function mockApi(data: unknown) {
  return {
    get: vi.fn().mockResolvedValue(data),
    post: vi.fn(),
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

const sampleList = {
  count: 2,
  surface_filter: null,
  skills: [
    {
      name: "my-skill",
      plugin: "my-plugin",
      description: "A test skill",
      version: "1.0.0",
      surface_tags: ["CC", "CAI"],
      published: true,
      editable: false,
    },
    {
      name: "another",
      plugin: "another-plugin",
      description: "Another skill",
      version: "2.1.0",
      surface_tags: ["CC"],
      published: true,
      editable: true,
    },
  ],
};

describe("runList", () => {
  it("prints skills in tabular format", async () => {
    const api = mockApi(sampleList);
    const args: ParsedArgs = {
      command: "list",
      positional: [],
      code: "abc",
      flags: {},
    };

    const lines = await captureOutput(() => runList(args, api as any));

    expect(lines.some((l) => l.includes("my-skill"))).toBe(true);
    expect(lines.some((l) => l.includes("another"))).toBe(true);
    expect(lines.some((l) => l.includes("1.0.0"))).toBe(true);
    expect(api.get).toHaveBeenCalledWith("/api/skills", {
      surface: undefined,
    });
  });

  it("passes --surface filter to API", async () => {
    const api = mockApi({ count: 0, surface_filter: "CC", skills: [] });
    const args: ParsedArgs = {
      command: "list",
      positional: [],
      code: "abc",
      flags: { surface: "CC" },
    };

    const lines = await captureOutput(() => runList(args, api as any));

    expect(api.get).toHaveBeenCalledWith("/api/skills", { surface: "CC" });
    expect(lines.some((l) => l.includes("0") || l.includes("No skills"))).toBe(
      true,
    );
  });

  it("shows count summary", async () => {
    const api = mockApi(sampleList);
    const args: ParsedArgs = {
      command: "list",
      positional: [],
      code: "abc",
      flags: {},
    };

    const lines = await captureOutput(() => runList(args, api as any));

    expect(lines.some((l) => l.includes("2"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run cli/src/__tests__/list.test.ts`
Expected: FAIL — `runList` does not exist

- [ ] **Step 3: Implement list command**

Create `cli/src/commands/list.ts`:

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run cli/src/__tests__/list.test.ts`
Expected: All 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add cli/src/commands/list.ts cli/src/__tests__/list.test.ts
git commit -m "feat(v3): add CLI list command"
```

---

## Task 5: `info` Command

**Files:**
- Create: `cli/src/commands/info.ts`
- Test: `cli/src/__tests__/info.test.ts`

- [ ] **Step 1: Write failing tests**

Create `cli/src/__tests__/info.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { runInfo } from "../commands/info";
import type { ParsedArgs } from "../index";

function mockApi(data: unknown) {
  return {
    get: vi.fn().mockResolvedValue(data),
    post: vi.fn(),
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

const sampleSkill = {
  skill: {
    name: "code-review",
    version: "1.2.0",
    description: "Automated code review",
    plugin: "dev-tools",
    category: "development",
    tags: ["review", "quality"],
    surface_tags: ["CC", "CAI"],
    published: true,
  },
  skill_md: "# Code Review\n\nReview code for quality.",
  files: [
    "plugins/dev-tools/skills/code-review/SKILL.md",
    "plugins/dev-tools/skills/code-review/.claude-plugin/plugin.json",
  ],
  editable: false,
};

describe("runInfo", () => {
  it("prints skill details", async () => {
    const api = mockApi(sampleSkill);
    const args: ParsedArgs = {
      command: "info",
      positional: ["code-review"],
      code: "abc",
      flags: {},
    };

    const lines = await captureOutput(() => runInfo(args, api as any));

    expect(lines.some((l) => l.includes("code-review"))).toBe(true);
    expect(lines.some((l) => l.includes("1.2.0"))).toBe(true);
    expect(lines.some((l) => l.includes("dev-tools"))).toBe(true);
    expect(lines.some((l) => l.includes("Automated code review"))).toBe(true);
    expect(api.get).toHaveBeenCalledWith("/api/skills/code-review");
  });

  it("errors when no plugin name provided", async () => {
    const api = mockApi({});
    const args: ParsedArgs = {
      command: "info",
      positional: [],
      code: "abc",
      flags: {},
    };

    const errors = await captureStderr(() =>
      runInfo(args, api as any).catch(() => {}),
    );
    expect(errors.some((l) => l.includes("Usage") || l.includes("name"))).toBe(
      true,
    );
    expect(api.get).not.toHaveBeenCalled();
  });

  it("shows file list", async () => {
    const api = mockApi(sampleSkill);
    const args: ParsedArgs = {
      command: "info",
      positional: ["code-review"],
      code: "abc",
      flags: {},
    };

    const lines = await captureOutput(() => runInfo(args, api as any));

    expect(lines.some((l) => l.includes("SKILL.md"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run cli/src/__tests__/info.test.ts`
Expected: FAIL — `runInfo` does not exist

- [ ] **Step 3: Implement info command**

Create `cli/src/commands/info.ts`:

```typescript
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
      // Show just the filename, not the full plugin path
      const short = f.split("/").slice(-2).join("/");
      console.log(`  ${short}`);
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run cli/src/__tests__/info.test.ts`
Expected: All 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add cli/src/commands/info.ts cli/src/__tests__/info.test.ts
git commit -m "feat(v3): add CLI info command"
```

---

## Task 6: `updates` Command

**Files:**
- Create: `cli/src/commands/updates.ts`
- Test: `cli/src/__tests__/updates.test.ts`

- [ ] **Step 1: Write failing tests**

Create `cli/src/__tests__/updates.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { runUpdates } from "../commands/updates";
import type { ParsedArgs } from "../index";

function mockApi(data: unknown) {
  return {
    get: vi.fn(),
    post: vi.fn().mockResolvedValue(data),
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

describe("runUpdates", () => {
  it("shows available updates", async () => {
    const api = mockApi({
      hasUpdates: true,
      updates: [
        {
          name: "my-skill",
          installedVersion: "1.0.0",
          latestVersion: "1.1.0",
        },
      ],
    });
    const args: ParsedArgs = {
      command: "updates",
      positional: [],
      code: "abc",
      flags: { installed: '[{"name":"my-skill","version":"1.0.0"}]' },
    };

    const lines = await captureOutput(() => runUpdates(args, api as any));

    expect(lines.some((l) => l.includes("my-skill"))).toBe(true);
    expect(lines.some((l) => l.includes("1.0.0"))).toBe(true);
    expect(lines.some((l) => l.includes("1.1.0"))).toBe(true);
    expect(api.post).toHaveBeenCalledWith("/api/check-updates", {
      installed: [{ name: "my-skill", version: "1.0.0" }],
    });
  });

  it("shows no updates message", async () => {
    const api = mockApi({ hasUpdates: false, updates: [] });
    const args: ParsedArgs = {
      command: "updates",
      positional: [],
      code: "abc",
      flags: { installed: '[{"name":"my-skill","version":"1.0.0"}]' },
    };

    const lines = await captureOutput(() => runUpdates(args, api as any));

    expect(lines.some((l) => l.includes("up to date") || l.includes("No updates"))).toBe(true);
  });

  it("errors when --installed is missing", async () => {
    const api = mockApi({});
    const args: ParsedArgs = {
      command: "updates",
      positional: [],
      code: "abc",
      flags: {},
    };

    const errors = await captureStderr(() =>
      runUpdates(args, api as any).catch(() => {}),
    );
    expect(errors.some((l) => l.includes("--installed"))).toBe(true);
  });

  it("errors when --installed is invalid JSON", async () => {
    const api = mockApi({});
    const args: ParsedArgs = {
      command: "updates",
      positional: [],
      code: "abc",
      flags: { installed: "not json" },
    };

    const errors = await captureStderr(() =>
      runUpdates(args, api as any).catch(() => {}),
    );
    expect(errors.some((l) => l.includes("JSON") || l.includes("parse"))).toBe(
      true,
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run cli/src/__tests__/updates.test.ts`
Expected: FAIL — `runUpdates` does not exist

- [ ] **Step 3: Implement updates command**

Create `cli/src/commands/updates.ts`:

```typescript
import type { ParsedArgs } from "../index";
import type { ApiClient } from "../api-client";

interface Update {
  name: string;
  installedVersion: string;
  latestVersion: string;
}

interface UpdatesResponse {
  hasUpdates: boolean;
  updates: Update[];
}

export async function runUpdates(
  args: ParsedArgs,
  api: ApiClient,
): Promise<void> {
  const raw = args.flags.installed;
  if (!raw || typeof raw !== "string") {
    console.error("Error: --installed <json> is required.");
    console.error('Example: --installed \'[{"name":"foo","version":"1.0.0"}]\'');
    throw new Error("Missing --installed flag");
  }

  let installed: Array<{ name: string; version: string }>;
  try {
    installed = JSON.parse(raw);
  } catch {
    console.error("Error: --installed value is not valid JSON.");
    throw new Error("Invalid JSON in --installed");
  }

  const data = await api.post<UpdatesResponse>("/api/check-updates", {
    installed,
  });

  if (!data.hasUpdates || data.updates.length === 0) {
    console.log("All skills are up to date.");
    return;
  }

  const header = `${"Name".padEnd(30)} ${"Installed".padEnd(12)} ${"Latest".padEnd(12)}`;
  console.log(header);
  console.log("-".repeat(header.length));

  for (const u of data.updates) {
    console.log(
      `${u.name.padEnd(30)} ${u.installedVersion.padEnd(12)} ${u.latestVersion.padEnd(12)}`,
    );
  }

  console.log("");
  console.log(`${data.updates.length} update(s) available.`);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run cli/src/__tests__/updates.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add cli/src/commands/updates.ts cli/src/__tests__/updates.test.ts
git commit -m "feat(v3): add CLI updates command"
```

---

## Task 7: Update Search Chunks

**Files:**
- Modify: `src/search-chunks.ts`

- [ ] **Step 1: Add command-specific search chunks**

Append to the `SEARCH_CHUNKS` array in `src/search-chunks.ts`:

```typescript
  {
    id: "list-command",
    title: "skillport list",
    content:
      "List all skills in the marketplace.\n\n" +
      "```\nskillport list --code <CODE>\n" +
      "skillport list --surface CC --code <CODE>\n```\n\n" +
      "Options:\n" +
      "- `--surface <tag>` — Filter by surface: CC (Claude Code), CD (Claude Desktop), " +
      "CAI (Claude.ai), CDAI (Claude Desktop AI), CALL (all surfaces)\n\n" +
      "Output: table with name, plugin, version, and surface tags for each skill.",
    category: "commands",
    keywords: ["list", "browse", "marketplace", "skills", "plugins", "surface", "filter"],
  },
  {
    id: "info-command",
    title: "skillport info",
    content:
      "Show details for a specific skill or plugin.\n\n" +
      "```\nskillport info <name> --code <CODE>\n```\n\n" +
      "Shows: name, version, plugin, description, category, tags, surface tags, " +
      "publish status, edit permissions, and file list.\n\n" +
      "The `<name>` is the skill name as shown in `skillport list`.",
    category: "commands",
    keywords: ["info", "details", "show", "describe", "skill", "plugin", "metadata"],
  },
  {
    id: "updates-command",
    title: "skillport updates",
    content:
      "Check if installed skills have newer versions in the marketplace.\n\n" +
      "```\nskillport updates --installed '<json>' --code <CODE>\n```\n\n" +
      "The `--installed` flag takes a JSON array of `{ \"name\": \"...\", \"version\": \"...\" }` objects.\n" +
      "The model should construct this from local `.claude-plugin/plugin.json` files.\n\n" +
      "Output: table of skills with available updates (installed vs latest version).",
    category: "commands",
    keywords: ["updates", "check", "version", "upgrade", "outdated", "installed"],
  },
  {
    id: "whoami-command",
    title: "skillport whoami",
    content:
      "Show the authenticated user's identity.\n\n" +
      "```\nskillport whoami --code <CODE>\n```\n\n" +
      "Shows: name, email, and user ID. Useful for verifying which account is " +
      "associated with the auth code.",
    category: "commands",
    keywords: ["whoami", "identity", "user", "account", "email", "who"],
  },
```

- [ ] **Step 2: Run existing search index tests to verify no regressions**

Run: `npx vitest run src/__tests__/search-index.test.ts`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/search-chunks.ts
git commit -m "feat(v3): add search chunks for browse commands"
```

---

## Task 8: Build, Deploy, End-to-End Test

**Files:**
- No new files. Build, upload, deploy, test.

- [ ] **Step 1: Run all tests**

```bash
npx vitest run
```
Expected: All tests pass (Plan 1 tests + new CLI tests)

- [ ] **Step 2: Build CLI bundle**

```bash
npm run build:cli
```
Expected: `dist/skillport.js` created. Note the new bundle size — it should be larger than 3.5KB now with the command implementations included.

- [ ] **Step 3: Test locally**

```bash
node dist/skillport.js --version
node dist/skillport.js --help
node dist/skillport.js list
```
Expected:
- `--version` prints version
- `--help` prints help
- `list` without `--code` prints error: `Error: --code is required for 'list'.`

- [ ] **Step 4: Upload and deploy**

```bash
npx wrangler kv key put "cli:bundle" --namespace-id=2328f53c6e5846d6830cae916254634c --path=dist/skillport.js --remote
npm run deploy
```

- [ ] **Step 5: Test whoami from CLI**

Get an auth code from the MCP (via Claude Code or Claude.ai), then:

```bash
curl -sO https://skillport-connector.jack-ivers.workers.dev/cli/skillport.js
node skillport.js whoami --code <CODE>
```
Expected: prints user identity (name, email, ID)

- [ ] **Step 6: Test list from CLI**

```bash
node skillport.js list --code <CODE>
```
Expected: prints tabular skill listing from the marketplace

- [ ] **Step 7: Test info from CLI**

Pick a skill name from the list output, then:

```bash
node skillport.js info <skill-name> --code <CODE>
```
Expected: prints skill details

- [ ] **Step 8: Test from Claude.ai sandbox**

In a Claude.ai conversation with the connector enabled:
1. Model calls `search("list command")` — should return list command docs
2. Model calls `execute({ method: "auth.get_code" })` — returns code
3. Model runs `curl -sO https://skillport-connector.jack-ivers.workers.dev/cli/skillport.js`
4. Model runs `node skillport.js list --code <CODE>` — shows marketplace listing
5. Model runs `node skillport.js whoami --code <CODE>` — shows identity

- [ ] **Step 9: Commit any fixes**

If any issues found during testing, fix and commit.

```bash
git add -A
git commit -m "fix(v3): fixes from end-to-end testing"
```

---

## Summary

After completing all 8 tasks:

- **API client** handles auth headers, query params, POST bodies, error responses
- **Command routing** dispatches to per-command modules, validates `--code` requirement
- **4 browse commands** work end-to-end: `list`, `info`, `updates`, `whoami`
- **Search chunks** teach the model about each command
- **All code has tests** — TDD throughout
- **Deployed and validated** from both CLI and Claude.ai sandbox

**Next:** Plan 3 (Get + Create Commands) — download plugins/skills, scaffold new ones locally.
