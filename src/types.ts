import { z } from "zod";

// ── User identity from OAuth ──────────────────────────────────

export interface UserProps extends Record<string, unknown> {
  uid: string;
  provider: string;
  email: string;
  name: string;
  picture?: string;
  domain?: string;
}

// ── Execute tool input ────────────────────────────────────────

export const ExecuteInputSchema = {
  method: z
    .string()
    .describe("The method to call (e.g. 'auth.get_code', 'auth.whoami')"),
  args: z
    .record(z.unknown())
    .optional()
    .describe("Method arguments as a JSON object"),
};

// ── Search tool input ─────────────────────────────────────────

export const SearchInputSchema = {
  query: z
    .string()
    .describe("What you want to find (e.g. 'how to install a plugin', 'get command options')"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(5)
    .optional()
    .describe("Max results to return (1-5, default 3)"),
};

// ── Method dispatch result ────────────────────────────────────

export interface MethodResult {
  [key: string]: unknown;
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

// ── Search chunk ──────────────────────────────────────────────

export interface SearchChunk {
  id: string;
  title: string;
  content: string;
  category: "commands" | "workflows" | "format" | "best-practices";
  keywords: string[];
}

// ── Code auth (CLI codes stored in KV) ────────────────────────

export interface CodeData {
  uid: string;
  provider: string;
  email: string;
  name: string;
  created: number;
}
