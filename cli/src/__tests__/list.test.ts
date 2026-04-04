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
    expect(lines.some((l) => l.includes("0") || l.includes("No skills"))).toBe(true);
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
