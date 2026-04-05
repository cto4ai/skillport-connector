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

function mockApi(postResp?: unknown, putResp?: unknown) {
  return {
    get: vi.fn(),
    post: vi.fn().mockResolvedValue(postResp ?? { success: true, summary: "1 file(s) updated" }),
    put: vi.fn().mockResolvedValue(putResp ?? { success: true, summary: "4 file(s) written", newVersion: "1.0.1" }),
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
  it("reads local files and posts to API then bumps (skill layout)", async () => {
    // First stat: dir exists. Second stat: skills/ subdir does NOT exist (skill layout)
    mockStat
      .mockResolvedValueOnce({ isDirectory: () => true })
      .mockRejectedValueOnce(new Error("ENOENT"));
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

  it("detects plugin layout and calls PUT /api/plugins/:name", async () => {
    // stat succeeds for both the dir and skills/test-tools subdir
    mockStat.mockResolvedValue({ isDirectory: () => true });

    // Root readdir: .claude-plugin/, commands/, skills/
    mockReaddir
      .mockResolvedValueOnce([
        { name: ".claude-plugin", isDirectory: () => true, isFile: () => false },
        { name: "commands", isDirectory: () => true, isFile: () => false },
        { name: "skills", isDirectory: () => true, isFile: () => false },
      ])
      // .claude-plugin/
      .mockResolvedValueOnce([
        { name: "plugin.json", isDirectory: () => false, isFile: () => true },
      ])
      // commands/
      .mockResolvedValueOnce([
        { name: "validate.md", isDirectory: () => false, isFile: () => true },
      ])
      // skills/
      .mockResolvedValueOnce([
        { name: "json-validator", isDirectory: () => true, isFile: () => false },
        { name: "text-stats", isDirectory: () => true, isFile: () => false },
      ])
      // skills/json-validator/
      .mockResolvedValueOnce([
        { name: "SKILL.md", isDirectory: () => false, isFile: () => true },
      ])
      // skills/text-stats/
      .mockResolvedValueOnce([
        { name: "SKILL.md", isDirectory: () => false, isFile: () => true },
      ]);

    mockReadFile.mockResolvedValue("file content");

    const api = mockApi();
    const args: ParsedArgs = {
      command: "save",
      positional: ["test-tools", "patch"],
      code: "abc",
      flags: {},
    };

    const lines = await captureOutput(() => runSave(args, api as any));

    // Should call PUT /api/plugins/:name (not POST /api/skills/:name)
    expect(api.put).toHaveBeenCalledTimes(1);
    const putCall = api.put.mock.calls[0];
    expect(putCall[0]).toBe("/api/plugins/test-tools");

    // Body should include all files with paths relative to plugin root
    const body = putCall[1];
    expect(body.bump).toBe("patch");
    const paths = body.files.map((f: { path: string }) => f.path);
    expect(paths).toContain(".claude-plugin/plugin.json");
    expect(paths).toContain("commands/validate.md");
    expect(paths).toContain("skills/json-validator/SKILL.md");
    expect(paths).toContain("skills/text-stats/SKILL.md");

    // Should NOT also call the skill save or bump endpoints
    expect(api.post).not.toHaveBeenCalled();
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
