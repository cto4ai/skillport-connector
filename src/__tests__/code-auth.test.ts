import { describe, it, expect, vi } from "vitest";
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
