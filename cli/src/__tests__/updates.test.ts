import { describe, it, expect, vi } from "vitest";
import { runUpdates } from "../commands/updates";
import type { ParsedArgs } from "../index";

function mockApi(data: unknown) {
  return {
    get: vi.fn(),
    post: vi.fn().mockResolvedValue(data),
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

describe("runUpdates", () => {
  it("shows available updates", async () => {
    const api = mockApi({
      hasUpdates: true,
      updates: [
        {
          name: "my-skill",
          installedVersion: "1.0.0",
          availableVersion: "1.1.0",
        },
      ],
    });
    const args: ParsedArgs = {
      command: "updates",
      positional: [],
      code: "abc",
      flags: { installed: '[{"name":"my-skill","version":"1.0.0"}]' },
    };

    const lines = await captureOutput(() => runUpdates(args, api as any));

    expect(lines.some((l) => l.includes("my-skill"))).toBe(true);
    expect(lines.some((l) => l.includes("1.0.0"))).toBe(true);
    expect(lines.some((l) => l.includes("1.1.0"))).toBe(true);
    expect(api.post).toHaveBeenCalledWith("/api/check-updates", {
      installed: [{ name: "my-skill", version: "1.0.0" }],
    });
  });

  it("shows no updates message", async () => {
    const api = mockApi({ hasUpdates: false, updates: [] });
    const args: ParsedArgs = {
      command: "updates",
      positional: [],
      code: "abc",
      flags: { installed: '[{"name":"my-skill","version":"1.0.0"}]' },
    };

    const lines = await captureOutput(() => runUpdates(args, api as any));

    expect(lines.some((l) => l.includes("up to date") || l.includes("No updates"))).toBe(true);
  });

  it("errors when --installed is missing", async () => {
    const api = mockApi({});
    const args: ParsedArgs = {
      command: "updates",
      positional: [],
      code: "abc",
      flags: {},
    };

    const errors = await captureStderr(() =>
      runUpdates(args, api as any).catch(() => {}),
    );
    expect(errors.some((l) => l.includes("--installed"))).toBe(true);
  });

  it("errors when --installed is invalid JSON", async () => {
    const api = mockApi({});
    const args: ParsedArgs = {
      command: "updates",
      positional: [],
      code: "abc",
      flags: { installed: "not json" },
    };

    const errors = await captureStderr(() =>
      runUpdates(args, api as any).catch(() => {}),
    );
    expect(errors.some((l) => l.includes("JSON") || l.includes("parse"))).toBe(true);
  });
});
