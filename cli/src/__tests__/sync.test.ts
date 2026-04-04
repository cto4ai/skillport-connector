import { describe, it, expect, vi } from "vitest";
import { runSync } from "../commands/sync";
import type { ParsedArgs } from "../index";

function mockApi(resp?: unknown) {
  return {
    get: vi.fn(),
    post: vi.fn().mockResolvedValue(resp),
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

describe("runSync", () => {
  it("calls sync endpoint", async () => {
    const api = mockApi({
      success: true,
      plugins: 5,
      added: ["new-plugin"],
      removed: ["old-plugin"],
    });
    const args: ParsedArgs = {
      command: "sync",
      positional: [],
      code: "abc",
      flags: {},
    };

    const lines = await captureOutput(() => runSync(args, api as any));

    expect(api.post).toHaveBeenCalledWith("/api/sync", {});
    expect(lines.some((l) => l.includes("5"))).toBe(true);
  });

  it("handles dry-run mode", async () => {
    const api = mockApi({
      dryRun: true,
      current: 10,
      proposed: 11,
      added: ["new-one"],
      removed: [],
      kept: ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"],
    });
    const args: ParsedArgs = {
      command: "sync",
      positional: [],
      code: "abc",
      flags: { "dry-run": true },
    };

    const lines = await captureOutput(() => runSync(args, api as any));

    expect(api.post).toHaveBeenCalledWith("/api/sync?dry_run=true", {});
    expect(lines.some((l) => l.includes("dry") || l.includes("Dry"))).toBe(true);
    expect(lines.some((l) => l.includes("new-one"))).toBe(true);
  });
});
