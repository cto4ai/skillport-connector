import { describe, it, expect, vi } from "vitest";
import { runWhoami } from "../commands/whoami";
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
