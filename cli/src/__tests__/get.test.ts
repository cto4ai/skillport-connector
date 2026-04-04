import { describe, it, expect, vi, beforeEach } from "vitest";
import { runGet } from "../commands/get";
import type { ParsedArgs } from "../index";

// Mock fs
const mockMkdir = vi.fn().mockResolvedValue(undefined);
const mockWriteFile = vi.fn().mockResolvedValue(undefined);
vi.mock("fs/promises", () => ({
  mkdir: (...args: unknown[]) => mockMkdir(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
}));

function mockApi(getResp?: unknown, postResp?: unknown) {
  return {
    get: vi.fn().mockResolvedValue(getResp),
    post: vi.fn().mockResolvedValue(postResp),
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

beforeEach(() => {
  mockMkdir.mockReset().mockResolvedValue(undefined);
  mockWriteFile.mockReset().mockResolvedValue(undefined);
});

const downloadResponse = {
  skill: { name: "code-review", version: "1.2.0", plugin: "dev-tools" },
  plugin: { name: "dev-tools", version: "1.2.0" },
  files: [
    { path: "SKILL.md", content: "# Code Review\n\nReview code." },
    { path: ".claude-plugin/plugin.json", content: '{"version":"1.2.0"}' },
  ],
};

const packageResponse = {
  skill: { name: "code-review", version: "1.2.0" },
  package: {
    filename: "code-review.skill",
    content_base64: "UEsDBBQ...",
  },
};

describe("runGet", () => {
  describe("unpacked mode", () => {
    it("downloads and writes skill files to cwd", async () => {
      const api = mockApi(downloadResponse);
      const args: ParsedArgs = {
        command: "get",
        positional: ["code-review"],
        code: "abc",
        flags: {},
      };

      const lines = await captureOutput(() => runGet(args, api as any));

      expect(api.get).toHaveBeenCalledWith("/api/skills/code-review/download");
      expect(mockMkdir).toHaveBeenCalled();
      expect(mockWriteFile).toHaveBeenCalledTimes(2);
      expect(lines.some((l) => l.includes("code-review"))).toBe(true);
      expect(lines.some((l) => l.includes("2 file"))).toBe(true);
    });

    it("creates subdirectories for nested file paths", async () => {
      const api = mockApi(downloadResponse);
      const args: ParsedArgs = {
        command: "get",
        positional: ["code-review"],
        code: "abc",
        flags: {},
      };

      await runGet(args, api as any);

      const mkdirCalls = mockMkdir.mock.calls.map((c) => c[0]);
      expect(mkdirCalls.some((p: string) => p.includes(".claude-plugin"))).toBe(true);
    });
  });

  describe("ZIP mode", () => {
    it("downloads and writes .skill ZIP", async () => {
      const api = mockApi(packageResponse);
      const args: ParsedArgs = {
        command: "get",
        positional: ["code-review"],
        code: "abc",
        flags: { format: "skill" },
      };

      const lines = await captureOutput(() => runGet(args, api as any));

      expect(api.get).toHaveBeenCalledWith("/api/skills/code-review/package");
      expect(mockWriteFile).toHaveBeenCalledTimes(1);
      const writeCall = mockWriteFile.mock.calls[0];
      expect(writeCall[0]).toContain("code-review.skill");
      expect(lines.some((l) => l.includes(".skill"))).toBe(true);
    });
  });

  describe("validation", () => {
    it("errors when no name provided", async () => {
      const api = mockApi();
      const args: ParsedArgs = {
        command: "get",
        positional: [],
        code: "abc",
        flags: {},
      };

      const errors = await captureStderr(() =>
        runGet(args, api as any).catch(() => {}),
      );
      expect(errors.some((l) => l.includes("Usage"))).toBe(true);
      expect(api.get).not.toHaveBeenCalled();
    });

    it("rejects --skills-only --format plugin", async () => {
      const api = mockApi();
      const args: ParsedArgs = {
        command: "get",
        positional: ["my-plugin"],
        code: "abc",
        flags: { "skills-only": true, format: "plugin" },
      };

      const errors = await captureStderr(() =>
        runGet(args, api as any).catch(() => {}),
      );
      expect(errors.some((l) => l.includes("Invalid"))).toBe(true);
      expect(api.get).not.toHaveBeenCalled();
    });

    it("rejects --skill with --format plugin", async () => {
      const api = mockApi();
      const args: ParsedArgs = {
        command: "get",
        positional: ["my-plugin"],
        code: "abc",
        flags: { skill: "my-skill", format: "plugin" },
      };

      const errors = await captureStderr(() =>
        runGet(args, api as any).catch(() => {}),
      );
      expect(errors.some((l) => l.includes("Invalid"))).toBe(true);
      expect(api.get).not.toHaveBeenCalled();
    });
  });
});
