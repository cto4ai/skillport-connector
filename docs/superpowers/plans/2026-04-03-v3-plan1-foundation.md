# Skillport v3 — Plan 1: Foundation + Early Validation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy a v3 Worker with thin MCP (auth + search), serving a hello-world CLI from KV, with the auth flow working end-to-end. Validate CLI distribution speed in sandbox.

**Architecture:** Strip v1/v2 MCP, replace with v3 (gworkspace-mcp patterns: namespace dispatch, execute + search tools). Add code-based auth to REST API. Build a hello-world CLI, bundle with esbuild, serve from Worker via KV. Deploy and validate.

**Tech Stack:** TypeScript, Cloudflare Workers, @modelcontextprotocol/sdk, agents, esbuild, Vitest, zod

**Spec:** `docs/superpowers/specs/2026-04-03-skillport-v3-design.md`

**Reference codebase:** `/Users/jackivers/Projects/gworkspace-mcp/` — follow its patterns for types, dispatch, MCP server, search index.

---

## File Map

### New files

| File | Responsibility |
|------|---------------|
| `src/types.ts` | Shared types: UserProps, MethodResult, ExecuteInputSchema, SearchInputSchema, SearchChunk |
| `src/dispatch.ts` | Namespace-based method routing (auth.*) |
| `src/auth.ts` | auth.get_code and auth.whoami handlers |
| `src/helpers.ts` | apiError() and apiSuccess() helpers |
| `src/search-chunks.ts` | Domain knowledge chunks (getting-started content for now) |
| `cli/src/index.ts` | CLI entry point: arg parsing, --help, --version |
| `cli/build.mjs` | esbuild bundle script |
| `src/__tests__/dispatch.test.ts` | Dispatch routing tests |
| `src/__tests__/auth.test.ts` | Auth handler tests (code generation, whoami) |
| `src/__tests__/search-index.test.ts` | Search index tests |
| `src/__tests__/code-auth.test.ts` | Code-based REST API auth tests |
| `cli/src/__tests__/parse.test.ts` | CLI arg parsing tests |

### Modified files

| File | Changes |
|------|---------|
| `src/index.ts` | Remove v1/v2 routes, add v3 MCP route + CLI serving route |
| `src/mcp-server.ts` | Complete rewrite: v3 McpAgent with execute + search (gworkspace pattern) |
| `src/search-index.ts` | Replace with gworkspace-mcp's SearchIndex class (cleaner, tested) |
| `src/rest-api.ts` | Replace `sk_api_` token validation with code-based auth |
| `worker-configuration.d.ts` | Remove MCP_V2_OBJECT binding, keep MCP_OBJECT for v3 |
| `wrangler.toml.example` | Remove v1 Durable Object, rename v2 → v3 |
| `package.json` | Add esbuild dep, build:cli script, update version |

### Deleted files

| File | Reason |
|------|--------|
| `src/mcp-server-v2.ts` | Replaced by rewritten `src/mcp-server.ts` |
| `src/skillport-proxy.ts` | Business logic stays in rest-api.ts; proxy layer removed |

---

## Task 1: Shared Types

**Files:**
- Create: `src/types.ts`
- Test: `src/__tests__/types.test.ts`

- [ ] **Step 1: Write the type definitions**

Create `src/types.ts` following the gworkspace-mcp pattern exactly:

```typescript
import { z } from "zod";

// ── User identity from OAuth ──────────────────────────────────

export interface UserProps extends Record<string, unknown> {
  uid: string;
  provider: string;
  email: string;
  name: string;
  picture?: string;
  domain?: string;
}

// ── Execute tool input ────────────────────────────────────────

export const ExecuteInputSchema = {
  method: z
    .string()
    .describe("The method to call (e.g. 'auth.get_code', 'auth.whoami')"),
  args: z
    .record(z.unknown())
    .optional()
    .describe("Method arguments as a JSON object"),
};

// ── Search tool input ─────────────────────────────────────────

export const SearchInputSchema = {
  query: z
    .string()
    .describe("What you want to find (e.g. 'how to install a plugin', 'get command options')"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(5)
    .optional()
    .describe("Max results to return (1-5, default 3)"),
};

// ── Method dispatch result ────────────────────────────────────

export interface MethodResult {
  [key: string]: unknown;
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

// ── Search chunk ──────────────────────────────────────────────

export interface SearchChunk {
  id: string;
  title: string;
  content: string;
  category: "commands" | "workflows" | "format" | "best-practices";
  keywords: string[];
}

// ── Code auth (CLI codes stored in KV) ────────────────────────

export interface CodeData {
  uid: string;
  provider: string;
  email: string;
  name: string;
  created: number;
}
```

- [ ] **Step 2: Write a smoke test to verify types are importable**

Create `src/__tests__/types.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { ExecuteInputSchema, SearchInputSchema } from "../types";
import type { UserProps, MethodResult, SearchChunk, CodeData } from "../types";

describe("types", () => {
  it("ExecuteInputSchema parses valid input", () => {
    const result = ExecuteInputSchema.method.parse("auth.get_code");
    expect(result).toBe("auth.get_code");
  });

  it("SearchInputSchema parses valid input", () => {
    const result = SearchInputSchema.query.parse("how to install");
    expect(result).toBe("how to install");
  });

  it("SearchInputSchema limit rejects out of range", () => {
    expect(() => SearchInputSchema.limit.parse(0)).toThrow();
    expect(() => SearchInputSchema.limit.parse(6)).toThrow();
  });
});
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/types.test.ts`
Expected: 3 tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/types.ts src/__tests__/types.test.ts
git commit -m "feat(v3): add shared types (gworkspace-mcp pattern)"
```

---

## Task 2: API Helpers

**Files:**
- Create: `src/helpers.ts`

- [ ] **Step 1: Create apiError and apiSuccess helpers**

Create `src/helpers.ts` (matches gworkspace-mcp's `api-client.ts` helpers):

```typescript
import type { MethodResult } from "./types";

/**
 * Helper to create an error MethodResult.
 */
export function apiError(method: string, message: string): MethodResult {
  return {
    content: [{ type: "text" as const, text: `${method} failed: ${message}` }],
    isError: true,
  };
}

/**
 * Helper to create a success MethodResult.
 */
export function apiSuccess(data: unknown): MethodResult {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof data === "string" ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/helpers.ts
git commit -m "feat(v3): add apiError/apiSuccess helpers"
```

---

## Task 3: Auth Handlers

**Files:**
- Create: `src/auth.ts`
- Test: `src/__tests__/auth.test.ts`

- [ ] **Step 1: Write failing tests for auth.get_code and auth.whoami**

Create `src/__tests__/auth.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { handleAuth } from "../auth";

// Minimal KV mock
function createMockKV() {
  const store = new Map<string, string>();
  return {
    get: vi.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    put: vi.fn((key: string, value: string, opts?: { expirationTtl?: number }) => {
      store.set(key, value);
      return Promise.resolve();
    }),
    store, // exposed for assertions
  };
}

describe("handleAuth", () => {
  const uid = "google:12345";
  const userProps = {
    uid: "12345",
    provider: "google",
    email: "jack@example.com",
    name: "Jack",
  };

  describe("get_code", () => {
    it("generates a code and stores it in KV", async () => {
      const kv = createMockKV();
      const env = { OAUTH_KV: kv } as unknown as Env;

      const result = await handleAuth("get_code", {}, env, uid, userProps);

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.code).toBeDefined();
      expect(typeof parsed.code).toBe("string");
      expect(parsed.code.length).toBeGreaterThan(0);

      // Verify KV was called with the code
      expect(kv.put).toHaveBeenCalledTimes(1);
      const putCall = kv.put.mock.calls[0];
      expect(putCall[0]).toMatch(/^cli_code:/);
      expect(putCall[2]).toHaveProperty("expirationTtl");
      // TTL should be several hours (at least 4 hours = 14400 seconds)
      expect(putCall[2].expirationTtl).toBeGreaterThanOrEqual(14400);
    });
  });

  describe("whoami", () => {
    it("returns user identity", async () => {
      const kv = createMockKV();
      const env = { OAUTH_KV: kv } as unknown as Env;

      const result = await handleAuth("whoami", {}, env, uid, userProps);

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.email).toBe("jack@example.com");
      expect(parsed.name).toBe("Jack");
    });
  });

  describe("unknown method", () => {
    it("returns error for unknown method", async () => {
      const kv = createMockKV();
      const env = { OAUTH_KV: kv } as unknown as Env;

      const result = await handleAuth("unknown", {}, env, uid, userProps);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Unknown method");
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/auth.test.ts`
Expected: FAIL — `handleAuth` does not exist

- [ ] **Step 3: Implement auth handlers**

Create `src/auth.ts`:

```typescript
import { apiError, apiSuccess } from "./helpers";
import type { MethodResult } from "./types";

interface AuthUserProps {
  uid: string;
  provider: string;
  email: string;
  name: string;
}

const CODE_TTL_SECONDS = 8 * 60 * 60; // 8 hours

export async function handleAuth(
  method: string,
  args: Record<string, unknown>,
  env: Env,
  uid: string,
  userProps: AuthUserProps,
): Promise<MethodResult> {
  switch (method) {
    case "get_code":
      return authGetCode(env, uid, userProps);
    case "whoami":
      return authWhoami(userProps);
    default:
      return apiError(`auth.${method}`, "Unknown method. Available: get_code, whoami");
  }
}

async function authGetCode(
  env: Env,
  uid: string,
  userProps: AuthUserProps,
): Promise<MethodResult> {
  const code = generateCode();

  await env.OAUTH_KV.put(
    `cli_code:${code}`,
    JSON.stringify({
      uid: userProps.uid,
      provider: userProps.provider,
      email: userProps.email,
      name: userProps.name,
      created: Date.now(),
    }),
    { expirationTtl: CODE_TTL_SECONDS },
  );

  return apiSuccess({ code });
}

function authWhoami(userProps: AuthUserProps): Promise<MethodResult> {
  return Promise.resolve(
    apiSuccess({
      email: userProps.email,
      name: userProps.name,
    }),
  );
}

function generateCode(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/auth.test.ts`
Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/auth.ts src/__tests__/auth.test.ts
git commit -m "feat(v3): add auth handlers (get_code, whoami)"
```

---

## Task 4: Namespace Dispatch

**Files:**
- Create: `src/dispatch.ts`
- Test: `src/__tests__/dispatch.test.ts`

- [ ] **Step 1: Write failing tests for dispatch routing**

Create `src/__tests__/dispatch.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { dispatch } from "../dispatch";

// Minimal mocks
function createMockEnv() {
  const store = new Map<string, string>();
  return {
    OAUTH_KV: {
      get: vi.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
      put: vi.fn((key: string, value: string) => {
        store.set(key, value);
        return Promise.resolve();
      }),
    },
  } as unknown as Env;
}

const userProps = {
  uid: "12345",
  provider: "google",
  email: "jack@example.com",
  name: "Jack",
};

describe("dispatch", () => {
  it("routes auth.whoami to auth handler", async () => {
    const env = createMockEnv();
    const result = await dispatch("auth.whoami", {}, env, "google:12345", userProps);

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.email).toBe("jack@example.com");
  });

  it("routes auth.get_code to auth handler", async () => {
    const env = createMockEnv();
    const result = await dispatch("auth.get_code", {}, env, "google:12345", userProps);

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.code).toBeDefined();
  });

  it("rejects method without dot separator", async () => {
    const env = createMockEnv();
    const result = await dispatch("whoami", {}, env, "google:12345", userProps);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Expected format: namespace.method");
  });

  it("rejects unknown namespace", async () => {
    const env = createMockEnv();
    const result = await dispatch("foo.bar", {}, env, "google:12345", userProps);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Unknown method");
    expect(result.content[0].text).toContain("auth");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/dispatch.test.ts`
Expected: FAIL — `dispatch` does not exist

- [ ] **Step 3: Implement dispatch**

Create `src/dispatch.ts`:

```typescript
import type { MethodResult } from "./types";
import { handleAuth } from "./auth";

interface DispatchUserProps {
  uid: string;
  provider: string;
  email: string;
  name: string;
}

export async function dispatch(
  fullMethod: string,
  args: Record<string, unknown>,
  env: Env,
  uid: string,
  userProps: DispatchUserProps,
): Promise<MethodResult> {
  const dotIndex = fullMethod.indexOf(".");
  if (dotIndex === -1) {
    return {
      content: [{ type: "text", text: `Unknown method "${fullMethod}". Expected format: namespace.method (e.g. auth.get_code)` }],
      isError: true,
    };
  }

  const namespace = fullMethod.slice(0, dotIndex);
  const method = fullMethod.slice(dotIndex + 1);

  if (namespace === "auth") {
    return handleAuth(method, args, env, uid, userProps);
  }

  return {
    content: [{ type: "text", text: `Unknown method "${fullMethod}". Available namespaces: auth` }],
    isError: true,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/dispatch.test.ts`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/dispatch.ts src/__tests__/dispatch.test.ts
git commit -m "feat(v3): add namespace dispatch (gworkspace-mcp pattern)"
```

---

## Task 5: Search Index

**Files:**
- Modify: `src/search-index.ts` (full rewrite)
- Create: `src/search-chunks.ts`
- Test: `src/__tests__/search-index.test.ts`

- [ ] **Step 1: Write failing tests for SearchIndex**

Create `src/__tests__/search-index.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { SearchIndex, stem } from "../search-index";
import type { SearchChunk } from "../types";

const testChunks: SearchChunk[] = [
  {
    id: "getting-started",
    title: "Getting Started",
    content: "Install the CLI and authenticate.",
    category: "workflows",
    keywords: ["install", "getting", "started", "setup", "begin"],
  },
  {
    id: "get-command",
    title: "skillport get",
    content: "Download plugins and skills from the marketplace.",
    category: "commands",
    keywords: ["get", "download", "install", "plugin", "skill"],
  },
  {
    id: "save-command",
    title: "skillport save",
    content: "Push local changes to the marketplace.",
    category: "commands",
    keywords: ["save", "push", "publish", "bump", "version"],
  },
];

describe("stem", () => {
  it("stems common words", () => {
    expect(stem("installing")).toBe(stem("install"));
    expect(stem("plugins")).toBe(stem("plugin"));
    expect(stem("downloaded")).toBe(stem("download"));
  });
});

describe("SearchIndex", () => {
  it("finds exact keyword matches", () => {
    const index = new SearchIndex(testChunks);
    const results = index.search("install");

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe("get-command"); // highest score: "install" + "plugin"
  });

  it("returns empty for no match", () => {
    const index = new SearchIndex(testChunks);
    const results = index.search("xyznonexistent");

    expect(results).toHaveLength(0);
  });

  it("respects limit parameter", () => {
    const index = new SearchIndex(testChunks);
    const results = index.search("install", 1);

    expect(results).toHaveLength(1);
  });

  it("ranks by relevance", () => {
    const index = new SearchIndex(testChunks);
    const results = index.search("save push version");

    expect(results[0].id).toBe("save-command");
  });

  it("lists all topics", () => {
    const index = new SearchIndex(testChunks);
    const topics = index.listTopics();

    expect(topics).toHaveLength(3);
    expect(topics[0]).toHaveProperty("id");
    expect(topics[0]).toHaveProperty("title");
    expect(topics[0]).toHaveProperty("category");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/search-index.test.ts`
Expected: FAIL — old search-index.ts has different exports

- [ ] **Step 3: Rewrite search-index.ts with gworkspace-mcp pattern**

Replace the entire contents of `src/search-index.ts` with the gworkspace-mcp SearchIndex implementation. Copy `/Users/jackivers/Projects/gworkspace-mcp/src/search-index.ts` exactly, changing only the import path:

```typescript
import type { SearchChunk } from "./types";

// ── Porter Stemmer ────────────────────────────────────────────────────────────
// [Copy the full Porter Stemmer from gworkspace-mcp/src/search-index.ts lines 6-248]

// ── SearchIndex ───────────────────────────────────────────────────────────────
// [Copy the SearchIndex class from gworkspace-mcp/src/search-index.ts lines 251-313]
```

The full file is 313 lines. Copy it verbatim from gworkspace-mcp, replacing only the import to use `./types` instead of gworkspace's types.

- [ ] **Step 4: Create initial search chunks**

Create `src/search-chunks.ts` with getting-started content:

```typescript
import type { SearchChunk } from "./types";

export const SEARCH_CHUNKS: SearchChunk[] = [
  {
    id: "getting-started",
    title: "Getting Started with Skillport CLI",
    content:
      "1. Get an auth code: the model calls `execute({ method: \"auth.get_code\" })` via MCP\n" +
      "2. Install the CLI: `curl -sO https://<worker>/cli/skillport.js`\n" +
      "3. Run a command: `node skillport.js list --code <CODE>`\n\n" +
      "Or with an alias: `alias skillport='node skillport.js'`\n" +
      "Then: `skillport list --code <CODE>`",
    category: "workflows",
    keywords: ["getting", "started", "install", "setup", "begin", "first", "auth", "code"],
  },
  {
    id: "auth-flow",
    title: "Authentication Flow",
    content:
      "The MCP provides auth via Google OAuth (automatic on connection).\n\n" +
      "To get a CLI code: `execute({ method: \"auth.get_code\" })`\n" +
      "Returns: `{ \"code\": \"abc123...\" }`\n\n" +
      "Pass the code to every CLI command: `skillport <command> --code <CODE>`\n" +
      "The code is valid for several hours.",
    category: "workflows",
    keywords: ["auth", "authenticate", "code", "token", "login", "oauth"],
  },
  {
    id: "cli-commands-overview",
    title: "CLI Commands Overview",
    content:
      "**Browse:** `list`, `info`, `updates`\n" +
      "**Get:** `get` (with --skill, --skills-only, --format)\n" +
      "**Author:** `save`, `create`\n" +
      "**Lifecycle:** `deactivate`, `reactivate`, `delete`\n" +
      "**Marketplace:** `sync`\n" +
      "**Identity:** `whoami`\n" +
      "**Help:** `--help`, `--version`\n\n" +
      "All remote commands require `--code <CODE>`. Local commands (create, --help) do not.",
    category: "commands",
    keywords: ["commands", "list", "overview", "help", "cli"],
  },
];
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/search-index.test.ts`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/search-index.ts src/search-chunks.ts src/__tests__/search-index.test.ts
git commit -m "feat(v3): rewrite search index (gworkspace-mcp pattern) + initial chunks"
```

---

## Task 6: Code-Based REST API Auth

**Files:**
- Modify: `src/rest-api.ts` (replace validateToken)
- Test: `src/__tests__/code-auth.test.ts`

- [ ] **Step 1: Write failing tests for code-based auth**

Create `src/__tests__/code-auth.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";

// We test the validateCode function directly
// Import after implementing
import { validateCode } from "../rest-api";

function createMockKV(data?: Record<string, string>) {
  const store = new Map<string, string>(Object.entries(data ?? {}));
  return {
    get: vi.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    put: vi.fn(),
  };
}

describe("validateCode", () => {
  it("returns user data for valid code", async () => {
    const codeData = {
      uid: "12345",
      provider: "google",
      email: "jack@example.com",
      name: "Jack",
      created: Date.now(),
    };
    const kv = createMockKV({
      "cli_code:abc123": JSON.stringify(codeData),
    });
    const env = { OAUTH_KV: kv } as unknown as Env;

    const request = new Request("https://example.com/api/skills", {
      headers: { Authorization: "Bearer abc123" },
    });

    const result = await validateCode(request, env);
    expect(result).not.toBeNull();
    expect(result!.email).toBe("jack@example.com");
    expect(result!.uid).toBe("12345");
  });

  it("returns null for missing Authorization header", async () => {
    const kv = createMockKV();
    const env = { OAUTH_KV: kv } as unknown as Env;

    const request = new Request("https://example.com/api/skills");
    const result = await validateCode(request, env);
    expect(result).toBeNull();
  });

  it("returns null for invalid Bearer format", async () => {
    const kv = createMockKV();
    const env = { OAUTH_KV: kv } as unknown as Env;

    const request = new Request("https://example.com/api/skills", {
      headers: { Authorization: "Basic abc123" },
    });
    const result = await validateCode(request, env);
    expect(result).toBeNull();
  });

  it("returns null for unknown code", async () => {
    const kv = createMockKV();
    const env = { OAUTH_KV: kv } as unknown as Env;

    const request = new Request("https://example.com/api/skills", {
      headers: { Authorization: "Bearer unknown_code" },
    });
    const result = await validateCode(request, env);
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/code-auth.test.ts`
Expected: FAIL — `validateCode` not exported from rest-api.ts

- [ ] **Step 3: Replace token validation in rest-api.ts**

In `src/rest-api.ts`, replace the existing `validateToken` function and `TokenData` interface. Change the function name to `validateCode` and export it:

Replace lines 16-48 (the `TokenData` interface and `validateToken` function):

```typescript
// Code data stored in KV (from MCP auth.get_code)
export interface CodeData {
  uid: string;
  provider: string;
  email: string;
  name: string;
  created: number;
}

/**
 * Validate CLI code from Authorization header.
 * The code is issued by MCP execute({ method: "auth.get_code" })
 * and stored in KV as cli_code:{code}.
 */
export async function validateCode(
  request: Request,
  env: Env,
): Promise<CodeData | null> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const code = authHeader.slice(7);
  const data = await env.OAUTH_KV.get(`cli_code:${code}`);
  if (!data) {
    return null;
  }

  return JSON.parse(data) as CodeData;
}
```

Then update all call sites in rest-api.ts: replace `validateToken` with `validateCode` and `TokenData` with `CodeData`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/code-auth.test.ts`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/rest-api.ts src/__tests__/code-auth.test.ts
git commit -m "feat(v3): replace token auth with code-based auth in REST API"
```

---

## Task 7: v3 MCP Server

**Files:**
- Modify: `src/mcp-server.ts` (full rewrite)

- [ ] **Step 1: Rewrite mcp-server.ts as v3**

Replace the entire contents of `src/mcp-server.ts` with the v3 implementation following gworkspace-mcp patterns:

```typescript
import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { dispatch } from "./dispatch";
import { SearchIndex } from "./search-index";
import { SEARCH_CHUNKS } from "./search-chunks";
import { ExecuteInputSchema, SearchInputSchema } from "./types";
import type { UserProps, SearchChunk } from "./types";

const METHOD_SUMMARY = "auth.get_code, auth.whoami";

interface State {
  searchIndex: null;
}

export class SkillportMCP extends McpAgent<Env, State, UserProps> {
  server = new McpServer(
    {
      name: "skillport",
      version: "3.0.0",
    },
    {
      instructions:
        "Skillport CLI manager — install, author, and publish plugins and skills " +
        "for Claude Code plugin marketplaces.\n\n" +
        "Two tools available:\n" +
        "- execute: Auth methods ({ method, args }). Call auth.get_code to get a CLI auth code.\n" +
        "- search: Query CLI documentation on-demand. " +
        "IMPORTANT: Call search(\"getting started\") first to learn how to install and use the CLI.\n\n" +
        "Workflow: search → auth.get_code → install CLI → use CLI for all operations.",
    },
  );

  initialState: State = { searchIndex: null };

  private cachedIndex: SearchIndex | null = null;

  private getSearchIndex(): SearchIndex {
    if (this.cachedIndex) return this.cachedIndex;
    this.cachedIndex = new SearchIndex(SEARCH_CHUNKS);
    return this.cachedIndex;
  }

  async init() {
    this.server.registerTool(
      "execute",
      {
        description:
          `Execute a Skillport method. Available: ${METHOD_SUMMARY}. ` +
          "Auth is automatic — call auth.get_code to get a CLI auth code.",
        inputSchema: ExecuteInputSchema,
      },
      async ({ method, args }) => {
        const uid = this.props?.uid;
        if (!uid) {
          return {
            content: [{ type: "text" as const, text: "Not authenticated" }],
            isError: true,
          };
        }

        const timestamp = new Date().toISOString();
        console.log(`[AUDIT] ${timestamp} user=${this.props?.email} action=execute:${method}`);

        try {
          return await dispatch(method, args ?? {}, this.env, `${this.props.provider}:${uid}`, {
            uid: this.props.uid,
            provider: this.props.provider,
            email: this.props.email,
            name: this.props.name,
          });
        } catch (error) {
          console.error(`[execute] Unhandled error in ${method}:`, error);
          return {
            content: [{ type: "text" as const, text: `Internal error executing ${method}: ${error instanceof Error ? error.message : String(error)}` }],
            isError: true,
          };
        }
      },
    );

    this.server.registerTool(
      "search",
      {
        description:
          "Search Skillport CLI documentation — commands, workflows, " +
          "plugin structure, surface compatibility, and best practices. " +
          "Query by topic.",
        inputSchema: SearchInputSchema,
      },
      async ({ query, limit }) => {
        const timestamp = new Date().toISOString();
        console.log(`[AUDIT] ${timestamp} user=${this.props?.email} action=search:${query}`);

        const index = this.getSearchIndex();
        const results = index.search(query, limit);

        if (results.length === 0) {
          const topicList = index
            .listTopics()
            .map((t) => `- **${t.id}**: ${t.title} _(${t.category})_`)
            .join("\n");

          return {
            content: [
              {
                type: "text" as const,
                text: topicList.length > 0
                  ? `No results for "${query}". Try one of these topics:\n\n${topicList}`
                  : `No results for "${query}". The search index is empty.`,
              },
            ],
          };
        }

        const formatted = results
          .map((chunk) => `## ${chunk.title}\n*${chunk.category}*\n\n${chunk.content}`)
          .join("\n\n---\n\n");

        return {
          content: [{ type: "text" as const, text: formatted }],
        };
      },
    );
  }
}
```

Note: Unlike gworkspace-mcp which loads search chunks from KV, skillport v3 bundles them in source via `SEARCH_CHUNKS`. This is simpler — no seeding step needed. The chunks are part of the Worker source.

- [ ] **Step 2: Commit**

```bash
git add src/mcp-server.ts
git commit -m "feat(v3): rewrite MCP server (execute + search, gworkspace pattern)"
```

---

## Task 8: Wire Up index.ts (Remove v1/v2, Add v3)

**Files:**
- Modify: `src/index.ts`
- Delete: `src/mcp-server-v2.ts`
- Delete: `src/skillport-proxy.ts`
- Modify: `wrangler.toml.example`
- Modify: `worker-configuration.d.ts`

- [ ] **Step 1: Rewrite index.ts for v3 only**

Replace the entire contents of `src/index.ts`:

```typescript
/**
 * Skillport Connector v3 — CLI + Auth Backend
 *
 * Cloudflare Worker that:
 * - Provides MCP with auth (get_code) + CLI documentation (search)
 * - Serves REST API for CLI operations
 * - Serves the bundled CLI JS file
 * - Handles Google OAuth for user authentication
 */

import { OAuthProvider } from "@cloudflare/workers-oauth-provider";
import googleHandler from "./google-handler";
import { SkillportMCP } from "./mcp-server";
import { handleAPI } from "./rest-api";

// Export MCP server class for Durable Objects
export { SkillportMCP };

// v3 MCP handlers
const sseHandler = SkillportMCP.mount("/sse");
const httpHandler = SkillportMCP.serve("/mcp");

const mcpHandler = {
  fetch: (request: Request, env: Env, ctx: ExecutionContext) => {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/sse")) {
      return sseHandler.fetch(request, env, ctx);
    }
    return httpHandler.fetch(request, env, ctx);
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const oauthProvider = new OAuthProvider({
  apiRoute: ["/mcp", "/sse", "/sse/message"],
  apiHandler: mcpHandler as any,
  defaultHandler: googleHandler,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
});

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Serve CLI bundle (no auth required)
    if (url.pathname === "/cli/skillport.js") {
      const js = await env.OAUTH_KV.get("cli:bundle", "text");
      if (!js) {
        return new Response("CLI not yet deployed", { status: 404 });
      }
      return new Response(js, {
        headers: {
          "Content-Type": "application/javascript",
          "Cache-Control": "public, max-age=300",
        },
      });
    }

    // REST API
    if (url.pathname.startsWith("/api/")) {
      return handleAPI(request, env);
    }

    // MCP + OAuth
    return oauthProvider.fetch(request, env, ctx);
  },
};
```

- [ ] **Step 2: Delete v1/v2 files**

```bash
rm src/mcp-server-v2.ts src/skillport-proxy.ts
```

- [ ] **Step 3: Update wrangler.toml.example**

Remove the v1 and v2 Durable Object bindings and migrations. Replace with a single v3 binding:

Replace the Durable Objects section:

```toml
# Durable Objects for MCP server
[[durable_objects.bindings]]
name = "MCP_OBJECT"
class_name = "SkillportMCP"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["SkillportMCP"]
```

Note: The actual `wrangler.toml` (not example) will need a migration from v2 to v3. The migration should rename or add the new class. Since we're the only user, we can delete and recreate the Durable Objects if needed.

- [ ] **Step 4: Update worker-configuration.d.ts**

Replace the contents to remove the v2 binding:

```typescript
interface Env {
  // KV namespace for OAuth tokens, CLI codes, and CLI bundle
  OAUTH_KV: KVNamespace;

  // Google OAuth credentials
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;

  // Optional: Restrict to specific Google Workspace domains
  GOOGLE_ALLOWED_DOMAINS?: string;

  // GitHub service token for API access (read-only)
  GITHUB_SERVICE_TOKEN: string;

  // GitHub write token for editor operations (optional)
  GITHUB_WRITE_TOKEN?: string;

  // Marketplace repository (e.g., "your-org/your-marketplace")
  MARKETPLACE_REPO: string;

  // Deployed connector URL
  CONNECTOR_URL?: string;

  // Durable Object binding for MCP
  MCP_OBJECT: DurableObjectNamespace;
}
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors (there may be warnings about unused imports in rest-api.ts from removed skillport-proxy — fix any that appear)

- [ ] **Step 6: Run all existing tests**

Run: `npx vitest run`
Expected: All tests pass (including the ones from previous tasks). The old `skill-packager.test.ts` should still pass since we kept `skill-packager.ts`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(v3): wire up v3-only routing, remove v1/v2 MCP"
```

---

## Task 9: Hello World CLI

**Files:**
- Create: `cli/src/index.ts`
- Test: `cli/src/__tests__/parse.test.ts`

- [ ] **Step 1: Write failing tests for CLI arg parsing**

Create directory structure first:

```bash
mkdir -p cli/src/__tests__ cli/src/commands
```

Create `cli/src/__tests__/parse.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { parseArgs } from "../index";

describe("parseArgs", () => {
  it("parses --help flag", () => {
    const result = parseArgs(["--help"]);
    expect(result.command).toBe("help");
  });

  it("parses --version flag", () => {
    const result = parseArgs(["--version"]);
    expect(result.command).toBe("version");
  });

  it("parses -h shorthand", () => {
    const result = parseArgs(["-h"]);
    expect(result.command).toBe("help");
  });

  it("parses -v shorthand", () => {
    const result = parseArgs(["-v"]);
    expect(result.command).toBe("version");
  });

  it("parses command with --code", () => {
    const result = parseArgs(["list", "--code", "abc123"]);
    expect(result.command).toBe("list");
    expect(result.code).toBe("abc123");
  });

  it("returns unknown for empty args", () => {
    const result = parseArgs([]);
    expect(result.command).toBe("help");
  });

  it("parses command with positional arg", () => {
    const result = parseArgs(["info", "my-plugin", "--code", "abc123"]);
    expect(result.command).toBe("info");
    expect(result.positional).toContain("my-plugin");
    expect(result.code).toBe("abc123");
  });

  it("parses --skill flag", () => {
    const result = parseArgs(["get", "my-plugin", "--skill", "foo", "--code", "abc123"]);
    expect(result.command).toBe("get");
    expect(result.positional).toContain("my-plugin");
    expect(result.flags.skill).toBe("foo");
    expect(result.code).toBe("abc123");
  });

  it("parses --format flag", () => {
    const result = parseArgs(["get", "my-plugin", "--format", "skill", "--code", "abc123"]);
    expect(result.command).toBe("get");
    expect(result.flags.format).toBe("skill");
  });

  it("parses --skills-only flag", () => {
    const result = parseArgs(["get", "my-plugin", "--skills-only", "--code", "abc123"]);
    expect(result.command).toBe("get");
    expect(result.flags["skills-only"]).toBe(true);
  });

  it("parses --dry-run flag", () => {
    const result = parseArgs(["sync", "--dry-run", "--code", "abc123"]);
    expect(result.command).toBe("sync");
    expect(result.flags["dry-run"]).toBe(true);
  });

  it("parses --surface flag", () => {
    const result = parseArgs(["list", "--surface", "CC", "--code", "abc123"]);
    expect(result.command).toBe("list");
    expect(result.flags.surface).toBe("CC");
  });

  it("parses --installed flag", () => {
    const json = '[{"name":"foo","version":"1.0.0"}]';
    const result = parseArgs(["updates", "--installed", json, "--code", "abc123"]);
    expect(result.command).toBe("updates");
    expect(result.flags.installed).toBe(json);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run cli/src/__tests__/parse.test.ts`
Expected: FAIL — `parseArgs` does not exist

- [ ] **Step 3: Implement CLI entry point**

Create `cli/src/index.ts`:

```typescript
const VERSION = "3.0.0-alpha.1";

export interface ParsedArgs {
  command: string;
  positional: string[];
  code?: string;
  flags: Record<string, string | boolean>;
}

export function parseArgs(argv: string[]): ParsedArgs {
  if (argv.length === 0) {
    return { command: "help", positional: [], flags: {} };
  }

  // Check for top-level flags
  if (argv[0] === "--help" || argv[0] === "-h") {
    return { command: "help", positional: [], flags: {} };
  }
  if (argv[0] === "--version" || argv[0] === "-v") {
    return { command: "version", positional: [], flags: {} };
  }

  const command = argv[0];
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  let code: string | undefined;

  let i = 1;
  while (i < argv.length) {
    const arg = argv[i];

    if (arg === "--code" && i + 1 < argv.length) {
      code = argv[i + 1];
      i += 2;
    } else if (arg === "--skill" && i + 1 < argv.length) {
      flags.skill = argv[i + 1];
      i += 2;
    } else if (arg === "--format" && i + 1 < argv.length) {
      flags.format = argv[i + 1];
      i += 2;
    } else if (arg === "--surface" && i + 1 < argv.length) {
      flags.surface = argv[i + 1];
      i += 2;
    } else if (arg === "--installed" && i + 1 < argv.length) {
      flags.installed = argv[i + 1];
      i += 2;
    } else if (arg === "--skills-only") {
      flags["skills-only"] = true;
      i++;
    } else if (arg === "--dry-run") {
      flags["dry-run"] = true;
      i++;
    } else if (arg === "--confirm") {
      flags.confirm = true;
      i++;
    } else if (arg === "--help" || arg === "-h") {
      flags.help = true;
      i++;
    } else if (!arg.startsWith("--")) {
      positional.push(arg);
      i++;
    } else {
      // Unknown flag — skip
      i++;
    }
  }

  return { command, positional, code, flags };
}

function printHelp(): void {
  console.log(`skillport v${VERSION} — CLI for Skillport plugin marketplace

Usage: skillport <command> [options] --code <CODE>

Commands:
  get <plugin>         Download plugin/skill from marketplace
  save <plugin> <bump> Push local changes (bump: patch|minor|major)
  list                 List plugins and skills
  info <plugin>        Show plugin/skill details
  updates              Check for version updates
  create <name>        Scaffold new plugin or skill locally
  deactivate <plugin>  Remove plugin from marketplace
  reactivate <plugin>  Restore deactivated plugin
  delete <plugin>      Delete plugin files (must be deactivated)
  sync                 Regenerate marketplace.json
  whoami               Show authenticated user

Options:
  --code <CODE>        Auth code (from MCP auth.get_code)
  --skill <name>       Target a specific skill within a plugin
  --skills-only        Target all skills as standalone
  --format <type>      Output format: plugin (.plugin ZIP) or skill (.skill ZIP)
  --surface <tag>      Filter by surface tag (CC, CD, CAI, etc.)
  --dry-run            Preview changes without writing (sync)
  --help, -h           Show help
  --version, -v        Show version`);
}

// Main entry point (only runs when executed directly, not when imported for tests)
if (typeof process !== "undefined" && process.argv) {
  const args = parseArgs(process.argv.slice(2));

  if (args.command === "help") {
    printHelp();
    process.exit(0);
  }

  if (args.command === "version") {
    console.log(VERSION);
    process.exit(0);
  }

  // For now, just echo the parsed command (hello world)
  console.log(`skillport v${VERSION}`);
  console.log(`Command: ${args.command}`);
  if (args.positional.length > 0) console.log(`Args: ${args.positional.join(", ")}`);
  if (args.code) console.log(`Code: ${args.code.slice(0, 4)}...`);
  console.log("(not yet implemented)");
  process.exit(1);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run cli/src/__tests__/parse.test.ts`
Expected: All 12 tests PASS

- [ ] **Step 5: Commit**

```bash
git add cli/src/index.ts cli/src/__tests__/parse.test.ts
git commit -m "feat(v3): add hello world CLI with arg parsing"
```

---

## Task 10: CLI Build + Bundle

**Files:**
- Create: `cli/build.mjs`
- Modify: `package.json`

- [ ] **Step 1: Add esbuild dependency**

```bash
npm install --save-dev esbuild
```

- [ ] **Step 2: Create CLI build script**

Create `cli/build.mjs`:

```javascript
import { build } from "esbuild";
import { readFileSync } from "fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));

await build({
  entryPoints: ["cli/src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node18",
  outfile: "dist/skillport.js",
  format: "esm",
  banner: {
    js: "#!/usr/bin/env node",
  },
  define: {
    "process.env.SKILLPORT_VERSION": JSON.stringify(pkg.version),
  },
  minify: false, // Keep readable for debugging in early phases
});

console.log("Built dist/skillport.js");
```

- [ ] **Step 3: Add build:cli script to package.json**

Add to the `scripts` section of `package.json`:

```json
"build:cli": "node cli/build.mjs"
```

- [ ] **Step 4: Build and verify**

Run: `npm run build:cli`
Expected: `dist/skillport.js` created, output says "Built dist/skillport.js"

Run: `node dist/skillport.js --version`
Expected: prints `3.0.0-alpha.1` (or whatever VERSION is set to)

Run: `node dist/skillport.js --help`
Expected: prints the help text

Run: `node dist/skillport.js list --code test123`
Expected: prints "Command: list", "Code: test...", "(not yet implemented)"

- [ ] **Step 5: Add dist/ to .gitignore**

```bash
echo "dist/" >> .gitignore
```

- [ ] **Step 6: Commit**

```bash
git add cli/build.mjs package.json package-lock.json .gitignore
git commit -m "feat(v3): add CLI esbuild bundling"
```

---

## Task 11: CLI Serving from Worker + Deploy

**Files:**
- Already handled in Task 8 (index.ts serves /cli/skillport.js from KV)
- Modify: `package.json` (add upload:cli script)

- [ ] **Step 1: Add CLI upload script to package.json**

Add to `scripts` in `package.json`:

```json
"upload:cli": "npm run build:cli && npx wrangler kv:key put --namespace-id=$SKILLPORT_KV_ID cli:bundle --path=dist/skillport.js"
```

Note: `$SKILLPORT_KV_ID` needs to be the actual KV namespace ID from wrangler.toml. The engineer should replace this with the real ID, or use a shell wrapper. For now, document the manual steps:

- [ ] **Step 2: Build, upload, and deploy (manual steps)**

```bash
# Build CLI bundle
npm run build:cli

# Upload to KV (replace YOUR_KV_ID with actual namespace ID from wrangler.toml)
npx wrangler kv:key put --namespace-id=YOUR_KV_ID "cli:bundle" --path=dist/skillport.js

# Deploy Worker
npm run deploy
```

- [ ] **Step 3: Verify CLI is served**

```bash
curl -s https://YOUR_WORKER_URL/cli/skillport.js | head -5
```

Expected: First 5 lines of the bundled JS file (starts with `#!/usr/bin/env node`)

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "feat(v3): add CLI upload script"
```

---

## Task 12: Early Validation in Sandbox

**This task is manual — no code changes. Validates the approach.**

- [ ] **Step 1: Test CLI download speed from Claude.ai sandbox**

In a Claude.ai conversation, ask the model to run:

```bash
time curl -sO https://YOUR_WORKER_URL/cli/skillport.js
```

Record the download time. Then:

```bash
node skillport.js --version
node skillport.js --help
```

Verify both work.

- [ ] **Step 2: Compare against npm install**

In the same sandbox:

```bash
time npm install -g some-small-package
```

Compare times. The bundled JS approach should be significantly faster (sub-second vs multiple seconds).

- [ ] **Step 3: Test MCP auth flow**

From Claude.ai with the MCP connector enabled:
1. Model calls `search("getting started")` — should return the getting-started chunk
2. Model calls `execute({ method: "auth.get_code" })` — should return a code
3. Model runs `node skillport.js list --code <CODE>` — should print "not yet implemented" (correct — list isn't built yet)

This validates the full chain: MCP → code → CLI → (soon) REST API.

- [ ] **Step 4: Record results**

Create a checkpoint doc with:
- CLI bundle size (bytes)
- Download time from sandbox
- npm install comparison time
- MCP auth flow results
- Go/no-go decision on bundled JS approach

If the download is NOT meaningfully faster than npm, document this and revisit the distribution strategy before proceeding to Plan 2.

- [ ] **Step 5: Commit checkpoint**

```bash
git add docs/working/checkpoints/
git commit -m "docs: checkpoint v3 Plan 1 validation results"
```

---

## Task 13: Fix CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Fix the inaccurate MCP testing statement**

In `CLAUDE.md`, find:

> **Note:** Claude Code cannot directly call MCP tools in this project because they require Google OAuth authentication. Testing must be done via Claude.ai or Claude Desktop with the connector enabled.

Replace with:

> **Note:** MCP Inspector + wrangler dev + Remote OAuth has historically been unreliable. Test MCP tools against the live deployed Worker. Claude Code can smoke-test the MCP once deployed. REST API endpoints can be tested locally via wrangler dev.

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: fix inaccurate MCP testing statement in CLAUDE.md"
```

---

## Summary

After completing all 13 tasks:

- **New v3 MCP** is live with `execute` (auth.get_code, auth.whoami) and `search` (CLI docs)
- **v1/v2 MCP removed** — cleaner codebase
- **Code-based auth** works in REST API (Bearer token = CLI code from MCP)
- **Hello world CLI** is bundled, served from Worker, downloadable in sandboxes
- **Early validation** confirms (or denies) the bundled JS distribution approach
- **Shared types, dispatch, helpers, search index** all follow gworkspace-mcp patterns
- **All code has tests** — TDD throughout

**Next:** Plan 2 (CLI Framework + Browse Commands) builds on this foundation to add real CLI commands that talk to the REST API.
