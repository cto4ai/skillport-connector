import { describe, it, expect, vi } from "vitest";
import { dispatch } from "../dispatch";

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
