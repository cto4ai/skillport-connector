import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiClient, ApiError } from "../api-client";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

describe("ApiClient", () => {
  const client = new ApiClient("https://example.com", "test-code-123");

  describe("get", () => {
    it("sends GET with Bearer token", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: "ok" }),
      });

      const result = await client.get("/api/whoami");

      expect(mockFetch).toHaveBeenCalledWith("https://example.com/api/whoami", {
        method: "GET",
        headers: {
          Authorization: "Bearer test-code-123",
          "Content-Type": "application/json",
        },
      });
      expect(result).toEqual({ data: "ok" });
    });

    it("appends query params", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ count: 1 }),
      });

      await client.get("/api/skills", { surface: "CC" });

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toBe("https://example.com/api/skills?surface=CC");
    });

    it("omits undefined query params", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ count: 1 }),
      });

      await client.get("/api/skills", { surface: undefined, refresh: "true" });

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toBe("https://example.com/api/skills?refresh=true");
    });
  });

  describe("post", () => {
    it("sends POST with JSON body", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ hasUpdates: false }),
      });

      const result = await client.post("/api/check-updates", {
        installed: [{ name: "foo", version: "1.0.0" }],
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "https://example.com/api/check-updates",
        {
          method: "POST",
          headers: {
            Authorization: "Bearer test-code-123",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            installed: [{ name: "foo", version: "1.0.0" }],
          }),
        },
      );
      expect(result).toEqual({ hasUpdates: false });
    });
  });

  describe("error handling", () => {
    it("throws ApiError on 401", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: () =>
          Promise.resolve({
            error: "Unauthorized",
            details: "Invalid code",
          }),
      });

      await expect(client.get("/api/whoami")).rejects.toThrow(ApiError);
    });

    it("includes status and details on ApiError", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: () =>
          Promise.resolve({
            error: "Not found",
            details: "Skill 'foo' not found",
          }),
      });

      try {
        await client.get("/api/skills/foo");
        expect.fail("Should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(ApiError);
        const err = e as ApiError;
        expect(err.status).toBe(404);
        expect(err.message).toContain("Skill 'foo' not found");
      }
    });

    it("throws ApiError on network failure", async () => {
      mockFetch.mockRejectedValueOnce(new Error("fetch failed"));

      await expect(client.get("/api/whoami")).rejects.toThrow(ApiError);
    });
  });
});
