import { describe, it, expect } from "vitest";
import { SearchIndex, stem } from "../search-index";
import type { SearchChunk } from "../types";

const testChunks: SearchChunk[] = [
  {
    id: "getting-started",
    title: "Getting Started",
    content: "Install the CLI and authenticate.",
    category: "workflows",
    keywords: ["install", "getting", "started", "setup", "begin"],
  },
  {
    id: "get-command",
    title: "skillport get",
    content: "Download plugins and skills from the marketplace.",
    category: "commands",
    keywords: ["get", "download", "install", "plugin", "skill"],
  },
  {
    id: "save-command",
    title: "skillport save",
    content: "Push local changes to the marketplace.",
    category: "commands",
    keywords: ["save", "push", "publish", "bump", "version"],
  },
];

describe("stem", () => {
  it("stems common words", () => {
    expect(stem("installing")).toBe(stem("install"));
    expect(stem("plugins")).toBe(stem("plugin"));
    expect(stem("downloaded")).toBe(stem("download"));
  });
});

describe("SearchIndex", () => {
  it("finds exact keyword matches", () => {
    const index = new SearchIndex(testChunks);
    const results = index.search("install");

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe("get-command");
  });

  it("returns empty for no match", () => {
    const index = new SearchIndex(testChunks);
    const results = index.search("xyznonexistent");

    expect(results).toHaveLength(0);
  });

  it("respects limit parameter", () => {
    const index = new SearchIndex(testChunks);
    const results = index.search("install", 1);

    expect(results).toHaveLength(1);
  });

  it("ranks by relevance", () => {
    const index = new SearchIndex(testChunks);
    const results = index.search("save push version");

    expect(results[0].id).toBe("save-command");
  });

  it("lists all topics", () => {
    const index = new SearchIndex(testChunks);
    const topics = index.listTopics();

    expect(topics).toHaveLength(3);
    expect(topics[0]).toHaveProperty("id");
    expect(topics[0]).toHaveProperty("title");
    expect(topics[0]).toHaveProperty("category");
  });
});
