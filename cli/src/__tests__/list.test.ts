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

// Multi-skill plugin + two single-skill plugins
const sampleList = {
  count: 4,
  surface_filter: null,
  skills: [
    {
      name: "json-validator",
      plugin: "test-tools",
      description: "Validate JSON",
      version: "0.1.1",
      surface_tags: ["CC"],
      published: true,
      editable: true,
    },
    {
      name: "text-stats",
      plugin: "test-tools",
      description: "Text statistics",
      version: "0.1.1",
      surface_tags: ["CC"],
      published: true,
      editable: true,
    },
    {
      name: "obsidian",
      plugin: "obsidian",
      description: "Vault access",
      version: "2.3.2",
      surface_tags: ["CALL"],
      published: true,
      editable: false,
    },
    {
      name: "day-prep",
      plugin: "day-prep",
      description: "Daily planning",
      version: "1.4.0",
      surface_tags: ["CDAI"],
      published: true,
      editable: false,
    },
  ],
};

describe("runList", () => {
  it("groups skills by plugin", async () => {
    const api = mockApi(sampleList);
    const args: ParsedArgs = { command: "list", positional: [], code: "abc", flags: {} };

    const lines = await captureOutput(() => runList(args, api as any));

    // Should show plugin names
    expect(lines.some((l) => l.includes("test-tools"))).toBe(true);
    expect(lines.some((l) => l.includes("obsidian"))).toBe(true);
    expect(lines.some((l) => l.includes("day-prep"))).toBe(true);
  });

  it("shows skill count for multi-skill plugins", async () => {
    const api = mockApi(sampleList);
    const args: ParsedArgs = { command: "list", positional: [], code: "abc", flags: {} };

    const lines = await captureOutput(() => runList(args, api as any));

    // test-tools has 2 skills — should show "2 skills" or list them
    const testToolsLine = lines.find((l) => l.includes("test-tools"));
    expect(testToolsLine).toBeDefined();
    expect(testToolsLine).toMatch(/2/); // 2 skills
  });

  it("flags single-skill plugins", async () => {
    const api = mockApi(sampleList);
    const args: ParsedArgs = { command: "list", positional: [], code: "abc", flags: {} };

    const lines = await captureOutput(() => runList(args, api as any));

    // Single-skill plugins like obsidian should show 1 skill
    const obsidianLine = lines.find((l) => l.includes("obsidian"));
    expect(obsidianLine).toBeDefined();
  });

  it("shows plugin count summary", async () => {
    const api = mockApi(sampleList);
    const args: ParsedArgs = { command: "list", positional: [], code: "abc", flags: {} };

    const lines = await captureOutput(() => runList(args, api as any));

    // 3 plugins (not 4 skills)
    expect(lines.some((l) => l.includes("3 plugin"))).toBe(true);
  });

  it("passes --surface filter to API", async () => {
    const api = mockApi({ count: 0, surface_filter: "CC", skills: [] });
    const args: ParsedArgs = { command: "list", positional: [], code: "abc", flags: { surface: "CC" } };

    const lines = await captureOutput(() => runList(args, api as any));

    expect(api.get).toHaveBeenCalledWith("/api/skills", { surface: "CC" });
    expect(lines.some((l) => l.includes("No plugins") || l.includes("0"))).toBe(true);
  });
});
