import { describe, it, expect, vi, beforeEach } from "vitest";
import { runCreate } from "../commands/create";
import type { ParsedArgs } from "../index";

const mockMkdir = vi.fn().mockResolvedValue(undefined);
const mockWriteFile = vi.fn().mockResolvedValue(undefined);
const mockStat = vi.fn().mockRejectedValue(new Error("ENOENT"));
vi.mock("fs/promises", () => ({
  mkdir: (...args: unknown[]) => mockMkdir(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  stat: (...args: unknown[]) => mockStat(...args),
}));

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
  mockStat.mockReset().mockRejectedValue(new Error("ENOENT"));
});

describe("runCreate", () => {
  describe("plugin scaffold", () => {
    it("creates plugin directory structure", async () => {
      const args: ParsedArgs = {
        command: "create",
        positional: ["my-plugin"],
        flags: {},
      };

      const lines = await captureOutput(() => runCreate(args));

      expect(mockMkdir).toHaveBeenCalled();
      expect(mockWriteFile).toHaveBeenCalled();

      const writeCalls = mockWriteFile.mock.calls;
      const paths = writeCalls.map((c) => c[0] as string);
      expect(paths.some((p) => p.includes("plugin.json"))).toBe(true);
      expect(paths.some((p) => p.includes("SKILL.md"))).toBe(true);
      expect(lines.some((l) => l.includes("my-plugin"))).toBe(true);
    });

    it("errors when no name provided", async () => {
      const args: ParsedArgs = {
        command: "create",
        positional: [],
        flags: {},
      };

      const errors = await captureStderr(() =>
        runCreate(args).catch(() => {}),
      );
      expect(errors.some((l) => l.includes("Usage") || l.includes("name"))).toBe(true);
    });

    it("errors when directory already exists", async () => {
      mockStat.mockResolvedValue({ isDirectory: () => true });

      const args: ParsedArgs = {
        command: "create",
        positional: ["my-plugin"],
        flags: {},
      };

      const errors = await captureStderr(() =>
        runCreate(args).catch(() => {}),
      );
      expect(errors.some((l) => l.includes("already exists"))).toBe(true);
    });
  });

  describe("skill scaffold", () => {
    it("creates skill directory structure", async () => {
      const args: ParsedArgs = {
        command: "create",
        positional: [],
        flags: { skill: "my-skill" },
      };

      const lines = await captureOutput(() => runCreate(args));

      const writeCalls = mockWriteFile.mock.calls;
      const paths = writeCalls.map((c) => c[0] as string);
      expect(paths.some((p) => p.includes("SKILL.md"))).toBe(true);
      expect(paths.some((p) => p.includes("plugin.json"))).toBe(true);
      expect(lines.some((l) => l.includes("my-skill"))).toBe(true);
    });
  });
});
