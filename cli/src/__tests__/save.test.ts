import { describe, it, expect, vi, beforeEach } from "vitest";
import { runSave } from "../commands/save";
import type { ParsedArgs } from "../index";

const mockReaddir = vi.fn();
const mockReadFile = vi.fn();
const mockStat = vi.fn();
vi.mock("fs/promises", () => ({
  readdir: (...args: unknown[]) => mockReaddir(...args),
  readFile: (...args: unknown[]) => mockReadFile(...args),
  stat: (...args: unknown[]) => mockStat(...args),
}));

function mockApi(postResp?: unknown) {
  return {
    get: vi.fn(),
    post: vi.fn().mockResolvedValue(postResp ?? { success: true, summary: "1 file(s) updated" }),
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
  mockReaddir.mockReset();
  mockReadFile.mockReset();
  mockStat.mockReset();
});

describe("runSave", () => {
  it("reads local files and posts to API then bumps", async () => {
    mockStat.mockResolvedValue({ isDirectory: () => true });
    mockReaddir
      .mockResolvedValueOnce([
        { name: "SKILL.md", isDirectory: () => false, isFile: () => true },
        { name: ".claude-plugin", isDirectory: () => true, isFile: () => false },
      ])
      .mockResolvedValueOnce([
        { name: "plugin.json", isDirectory: () => false, isFile: () => true },
      ]);
    mockReadFile.mockResolvedValue("file content");

    const api = mockApi();
    const args: ParsedArgs = {
      command: "save",
      positional: ["my-skill", "patch"],
      code: "abc",
      flags: {},
    };

    const lines = await captureOutput(() => runSave(args, api as any));

    expect(api.post).toHaveBeenCalledTimes(2);
    const saveCall = api.post.mock.calls[0];
    expect(saveCall[0]).toBe("/api/skills/my-skill");
    const bumpCall = api.post.mock.calls[1];
    expect(bumpCall[0]).toBe("/api/skills/my-skill/bump");
    expect(bumpCall[1]).toEqual({ type: "patch" });
  });

  it("errors when no name provided", async () => {
    const api = mockApi();
    const args: ParsedArgs = {
      command: "save",
      positional: [],
      code: "abc",
      flags: {},
    };

    const errors = await captureStderr(() =>
      runSave(args, api as any).catch(() => {}),
    );
    expect(errors.some((l) => l.includes("Usage"))).toBe(true);
  });

  it("errors when no bump type provided", async () => {
    const api = mockApi();
    const args: ParsedArgs = {
      command: "save",
      positional: ["my-skill"],
      code: "abc",
      flags: {},
    };

    const errors = await captureStderr(() =>
      runSave(args, api as any).catch(() => {}),
    );
    expect(errors.some((l) => l.includes("patch") || l.includes("bump"))).toBe(true);
  });

  it("errors when directory does not exist", async () => {
    mockStat.mockRejectedValue(new Error("ENOENT"));
    const api = mockApi();
    const args: ParsedArgs = {
      command: "save",
      positional: ["nonexistent", "patch"],
      code: "abc",
      flags: {},
    };

    const errors = await captureStderr(() =>
      runSave(args, api as any).catch(() => {}),
    );
    expect(errors.some((l) => l.includes("not found") || l.includes("ENOENT"))).toBe(true);
  });
});
