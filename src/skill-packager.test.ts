import { describe, it, expect } from "vitest";
import { packageSkill } from "./skill-packager";
import { unzipSync, strFromU8 } from "fflate";

describe("packageSkill", () => {
  it("creates a .skill zip with files under name/ root", () => {
    const pkg = packageSkill("my-skill", [
      { path: "SKILL.md", content: "# My Skill" },
      { path: "references/guide.md", content: "Guide content" },
    ]);

    expect(pkg.filename).toBe("my-skill.skill");

    // Decode and verify zip contents
    const bytes = Uint8Array.from(atob(pkg.content_base64), c => c.charCodeAt(0));
    const unzipped = unzipSync(bytes);

    expect(Object.keys(unzipped)).toContain("my-skill/SKILL.md");
    expect(Object.keys(unzipped)).toContain("my-skill/references/guide.md");
    expect(strFromU8(unzipped["my-skill/SKILL.md"])).toBe("# My Skill");
  });

  it("includes .claude-plugin/plugin.json for version tracking", () => {
    const manifest = JSON.stringify({ name: "test", version: "1.2.0" });
    const pkg = packageSkill("test", [
      { path: "SKILL.md", content: "# Test" },
      { path: ".claude-plugin/plugin.json", content: manifest },
    ]);

    const bytes = Uint8Array.from(atob(pkg.content_base64), c => c.charCodeAt(0));
    const unzipped = unzipSync(bytes);

    expect(Object.keys(unzipped)).toContain("test/.claude-plugin/plugin.json");
    expect(strFromU8(unzipped["test/.claude-plugin/plugin.json"])).toBe(manifest);
  });

  it("handles base64-encoded binary files", () => {
    const binaryContent = btoa("binary data here");
    const pkg = packageSkill("img-skill", [
      { path: "SKILL.md", content: "# Skill" },
      { path: "assets/logo.png", content: binaryContent, encoding: "base64" },
    ]);

    const bytes = Uint8Array.from(atob(pkg.content_base64), c => c.charCodeAt(0));
    const unzipped = unzipSync(bytes);

    expect(Object.keys(unzipped)).toContain("img-skill/assets/logo.png");
    const decoded = String.fromCharCode(...unzipped["img-skill/assets/logo.png"]);
    expect(decoded).toBe("binary data here");
  });
});
