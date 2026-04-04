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
    store,
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

      expect(kv.put).toHaveBeenCalledTimes(1);
      const putCall = kv.put.mock.calls[0];
      expect(putCall[0]).toMatch(/^cli_code:/);
      expect(putCall[2]).toHaveProperty("expirationTtl");
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
