import { describe, it, expect } from "vitest";
import { parseArgs } from "../index";

describe("parseArgs", () => {
  it("parses --help flag", () => {
    const result = parseArgs(["--help"]);
    expect(result.command).toBe("help");
  });

  it("parses --version flag", () => {
    const result = parseArgs(["--version"]);
    expect(result.command).toBe("version");
  });

  it("parses -h shorthand", () => {
    const result = parseArgs(["-h"]);
    expect(result.command).toBe("help");
  });

  it("parses -v shorthand", () => {
    const result = parseArgs(["-v"]);
    expect(result.command).toBe("version");
  });

  it("parses command with --code", () => {
    const result = parseArgs(["list", "--code", "abc123"]);
    expect(result.command).toBe("list");
    expect(result.code).toBe("abc123");
  });

  it("returns help for empty args", () => {
    const result = parseArgs([]);
    expect(result.command).toBe("help");
  });

  it("parses command with positional arg", () => {
    const result = parseArgs(["info", "my-plugin", "--code", "abc123"]);
    expect(result.command).toBe("info");
    expect(result.positional).toContain("my-plugin");
    expect(result.code).toBe("abc123");
  });

  it("parses --skill flag", () => {
    const result = parseArgs(["get", "my-plugin", "--skill", "foo", "--code", "abc123"]);
    expect(result.command).toBe("get");
    expect(result.positional).toContain("my-plugin");
    expect(result.flags.skill).toBe("foo");
    expect(result.code).toBe("abc123");
  });

  it("parses --format flag", () => {
    const result = parseArgs(["get", "my-plugin", "--format", "skill", "--code", "abc123"]);
    expect(result.command).toBe("get");
    expect(result.flags.format).toBe("skill");
  });

  it("parses --skills-only flag", () => {
    const result = parseArgs(["get", "my-plugin", "--skills-only", "--code", "abc123"]);
    expect(result.command).toBe("get");
    expect(result.flags["skills-only"]).toBe(true);
  });

  it("parses --dry-run flag", () => {
    const result = parseArgs(["sync", "--dry-run", "--code", "abc123"]);
    expect(result.command).toBe("sync");
    expect(result.flags["dry-run"]).toBe(true);
  });

  it("parses --surface flag", () => {
    const result = parseArgs(["list", "--surface", "CC", "--code", "abc123"]);
    expect(result.command).toBe("list");
    expect(result.flags.surface).toBe("CC");
  });

  it("parses --installed flag", () => {
    const json = '[{"name":"foo","version":"1.0.0"}]';
    const result = parseArgs(["updates", "--installed", json, "--code", "abc123"]);
    expect(result.command).toBe("updates");
    expect(result.flags.installed).toBe(json);
  });

  it("parses --base-url flag", () => {
    const result = parseArgs(["list", "--base-url", "http://localhost:8788", "--code", "abc"]);
    expect(result.command).toBe("list");
    expect(result.flags["base-url"]).toBe("http://localhost:8788");
    expect(result.code).toBe("abc");
  });
});
