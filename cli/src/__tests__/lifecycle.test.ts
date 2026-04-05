import { describe, it, expect, vi } from "vitest";
import { runDeactivate, runReactivate, runDelete } from "../commands/lifecycle";
import type { ParsedArgs } from "../index";

function mockApi(resp?: unknown) {
  return {
    get: vi.fn(),
    post: vi.fn().mockResolvedValue(resp ?? { success: true }),
    delete: vi.fn().mockResolvedValue(resp ?? { success: true }),
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

describe("runDeactivate", () => {
  it("calls deactivate endpoint", async () => {
    const api = mockApi({ success: true, plugin: "my-plugin", action: "deactivated" });
    const args: ParsedArgs = {
      command: "deactivate",
      positional: ["my-plugin"],
      code: "abc",
      flags: {},
    };

    const lines = await captureOutput(() => runDeactivate(args, api as any));

    expect(api.post).toHaveBeenCalledWith("/api/skills/my-plugin/deactivate", {});
    expect(lines.some((l) => l.includes("deactivated"))).toBe(true);
  });

  it("errors when no name provided", async () => {
    const api = mockApi();
    const args: ParsedArgs = { command: "deactivate", positional: [], code: "abc", flags: {} };

    const errors = await captureStderr(() => runDeactivate(args, api as any).catch(() => {}));
    expect(errors.some((l) => l.includes("Usage"))).toBe(true);
  });
});

describe("runReactivate", () => {
  it("calls reactivate endpoint", async () => {
    const api = mockApi({ success: true, plugin: "my-plugin", action: "reactivated" });
    const args: ParsedArgs = {
      command: "reactivate",
      positional: ["my-plugin"],
      code: "abc",
      flags: {},
    };

    const lines = await captureOutput(() => runReactivate(args, api as any));

    expect(api.post).toHaveBeenCalledWith("/api/skills/my-plugin/reactivate", {});
    expect(lines.some((l) => l.includes("reactivated"))).toBe(true);
  });
});

describe("runDelete", () => {
  it("calls delete endpoint with confirm", async () => {
    const api = mockApi({ success: true, skill: "my-skill", plugin: "my-plugin", pluginDeleted: false, deletedFiles: ["SKILL.md"] });
    const args: ParsedArgs = {
      command: "delete",
      positional: ["my-skill"],
      code: "abc",
      flags: { confirm: true },
    };

    const lines = await captureOutput(() => runDelete(args, api as any));

    expect(api.delete).toHaveBeenCalledWith("/api/skills/my-skill?confirm=true");
    expect(lines.some((l) => l.includes("Deleted") || l.includes("deleted"))).toBe(true);
  });

  it("errors when --confirm not set", async () => {
    const api = mockApi();
    const args: ParsedArgs = {
      command: "delete",
      positional: ["my-skill"],
      code: "abc",
      flags: {},
    };

    const errors = await captureStderr(() => runDelete(args, api as any).catch(() => {}));
    expect(errors.some((l) => l.includes("--confirm"))).toBe(true);
  });
});
