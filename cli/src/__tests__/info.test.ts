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
    expect(errors.some((l) => l.includes("Usage") || l.includes("name"))).toBe(true);
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
