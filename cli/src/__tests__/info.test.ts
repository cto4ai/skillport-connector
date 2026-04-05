import { describe, it, expect, vi } from "vitest";
import { runInfo } from "../commands/info";
import type { ParsedArgs } from "../index";
import { ApiError } from "../api-client";

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

const sampleSkillInfo = {
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

const samplePluginInfo = {
  plugin: {
    name: "test-tools",
    version: "0.1.1",
    description: "Test plugin with multiple skills",
    surface_tags: ["CC"],
  },
  components: {
    skills: [
      { name: "json-validator", description: "Validate JSON" },
      { name: "text-stats", description: "Text statistics" },
    ],
    commands: [
      { name: "validate", description: "Validate a JSON file" },
    ],
  },
  editable: true,
};

describe("runInfo", () => {
  describe("skill info", () => {
    it("shows skill details when plugin lookup 404s", async () => {
      const api = {
        get: vi.fn()
          .mockRejectedValueOnce(new ApiError("Not found", 404))
          .mockResolvedValueOnce(sampleSkillInfo),
        post: vi.fn(),
      };
      const args: ParsedArgs = {
        command: "info",
        positional: ["code-review"],
        code: "abc",
        flags: {},
      };

      const lines = await captureOutput(() => runInfo(args, api as any));

      expect(api.get).toHaveBeenCalledWith("/api/plugins/code-review/info");
      expect(api.get).toHaveBeenCalledWith("/api/skills/code-review");
      expect(lines.some((l) => l.includes("code-review"))).toBe(true);
      expect(lines.some((l) => l.includes("1.2.0"))).toBe(true);
    });
  });

  describe("plugin info", () => {
    it("shows plugin details with components", async () => {
      const api = {
        get: vi.fn().mockResolvedValueOnce(samplePluginInfo),
        post: vi.fn(),
      };
      const args: ParsedArgs = {
        command: "info",
        positional: ["test-tools"],
        code: "abc",
        flags: {},
      };

      const lines = await captureOutput(() => runInfo(args, api as any));

      expect(api.get).toHaveBeenCalledWith("/api/plugins/test-tools/info");
      expect(lines.some((l) => l.includes("test-tools"))).toBe(true);
      expect(lines.some((l) => l.includes("0.1.1"))).toBe(true);
      expect(lines.some((l) => l.includes("json-validator"))).toBe(true);
      expect(lines.some((l) => l.includes("text-stats"))).toBe(true);
      expect(lines.some((l) => l.includes("validate"))).toBe(true);
    });
  });

  describe("--skill flag forces skill-level info", () => {
    it("skips plugin lookup and goes straight to skill endpoint", async () => {
      const api = {
        get: vi.fn().mockResolvedValueOnce(sampleSkillInfo),
        post: vi.fn(),
      };
      const args: ParsedArgs = {
        command: "info",
        positional: ["obsidian"],
        code: "abc",
        flags: { skill: true },
      };

      const lines = await captureOutput(() => runInfo(args, api as any));

      // Should NOT try plugin endpoint
      expect(api.get).toHaveBeenCalledTimes(1);
      expect(api.get).toHaveBeenCalledWith("/api/skills/obsidian");
      expect(lines.some((l) => l.includes("code-review") || l.includes("obsidian"))).toBe(true);
    });
  });

  describe("single-skill plugin includes skill details", () => {
    it("shows files when plugin has only one skill", async () => {
      const singleSkillPlugin = {
        plugin: {
          name: "obsidian",
          version: "2.3.2",
          description: "Vault access",
          surface_tags: ["CALL"],
        },
        components: {
          skills: [
            { name: "obsidian", description: "Vault access", files: ["SKILL.md", "references/vault-conventions.md"] },
          ],
          commands: [],
        },
        editable: true,
      };
      const api = {
        get: vi.fn().mockResolvedValueOnce(singleSkillPlugin),
        post: vi.fn(),
      };
      const args: ParsedArgs = {
        command: "info",
        positional: ["obsidian"],
        code: "abc",
        flags: {},
      };

      const lines = await captureOutput(() => runInfo(args, api as any));

      expect(lines.some((l) => l.includes("obsidian"))).toBe(true);
      expect(lines.some((l) => l.includes("SKILL.md"))).toBe(true);
    });
  });

  it("errors when no name provided", async () => {
    const api = { get: vi.fn(), post: vi.fn() };
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
});
