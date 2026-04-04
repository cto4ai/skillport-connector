import type { SearchChunk } from "./types";

export const SEARCH_CHUNKS: SearchChunk[] = [
  {
    id: "getting-started",
    title: "Getting Started with Skillport CLI",
    content:
      "1. Get an auth code: the model calls `execute({ method: \"auth.get_code\" })` via MCP\n" +
      "2. Install the CLI: `curl -sO https://<worker>/cli/skillport.js`\n" +
      "3. Run a command: `node skillport.js list --code <CODE>`\n\n" +
      "Or with an alias: `alias skillport='node skillport.js'`\n" +
      "Then: `skillport list --code <CODE>`",
    category: "workflows",
    keywords: ["getting", "started", "install", "setup", "begin", "first", "auth", "code"],
  },
  {
    id: "auth-flow",
    title: "Authentication Flow",
    content:
      "The MCP provides auth via Google OAuth (automatic on connection).\n\n" +
      "To get a CLI code: `execute({ method: \"auth.get_code\" })`\n" +
      "Returns: `{ \"code\": \"abc123...\" }`\n\n" +
      "Pass the code to every CLI command: `skillport <command> --code <CODE>`\n" +
      "The code is valid for several hours.",
    category: "workflows",
    keywords: ["auth", "authenticate", "code", "token", "login", "oauth"],
  },
  {
    id: "cli-commands-overview",
    title: "CLI Commands Overview",
    content:
      "**Browse:** `list`, `info`, `updates`\n" +
      "**Get:** `get` (with --skill, --skills-only, --format)\n" +
      "**Author:** `save`, `create`\n" +
      "**Lifecycle:** `deactivate`, `reactivate`, `delete`\n" +
      "**Marketplace:** `sync`\n" +
      "**Identity:** `whoami`\n" +
      "**Help:** `--help`, `--version`\n\n" +
      "All remote commands require `--code <CODE>`. Local commands (create, --help) do not.",
    category: "commands",
    keywords: ["commands", "list", "overview", "help", "cli"],
  },
];
