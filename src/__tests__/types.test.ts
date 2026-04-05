import { describe, it, expect } from "vitest";
import { ExecuteInputSchema, SearchInputSchema } from "../types";
import type { UserProps, MethodResult, SearchChunk, CodeData } from "../types";

describe("types", () => {
  it("ExecuteInputSchema parses valid input", () => {
    const result = ExecuteInputSchema.method.parse("auth.get_code");
    expect(result).toBe("auth.get_code");
  });

  it("SearchInputSchema parses valid input", () => {
    const result = SearchInputSchema.query.parse("how to install");
    expect(result).toBe("how to install");
  });

  it("SearchInputSchema limit rejects out of range", () => {
    expect(() => SearchInputSchema.limit.parse(0)).toThrow();
    expect(() => SearchInputSchema.limit.parse(6)).toThrow();
  });
});
