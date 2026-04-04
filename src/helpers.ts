import type { MethodResult } from "./types";

/**
 * Helper to create an error MethodResult.
 */
export function apiError(method: string, message: string): MethodResult {
  return {
    content: [{ type: "text" as const, text: `${method} failed: ${message}` }],
    isError: true,
  };
}

/**
 * Helper to create a success MethodResult.
 */
export function apiSuccess(data: unknown): MethodResult {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof data === "string" ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}
