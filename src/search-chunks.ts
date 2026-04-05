import type { SearchChunk } from "./types";

export const SEARCH_CHUNKS: SearchChunk[] = [
  {
    id: "getting-started",
    title: "Getting Started with Skillport CLI",
    content:
      "1. Get an auth code: the model calls `execute({ method: \"auth.get_code\" })` via MCP\n" +
      "2. Install the CLI: `curl -sO https://skillport-connector.jack-ivers.workers.dev/cli/skillport.js`\n" +
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
  {
    id: "list-command",
    title: "skillport list",
    content:
      "List all skills in the marketplace.\n\n" +
      "```\nskillport list --code <CODE>\n" +
      "skillport list --surface CC --code <CODE>\n```\n\n" +
      "Options:\n" +
      "- `--surface <tag>` — Filter by surface: CC (Claude Code), CD (Claude Desktop), " +
      "CAI (Claude.ai), CDAI (Claude Desktop AI), CALL (all surfaces)\n\n" +
      "Output: table with name, plugin, version, and surface tags for each skill.",
    category: "commands",
    keywords: ["list", "browse", "marketplace", "skills", "plugins", "surface", "filter"],
  },
  {
    id: "info-command",
    title: "skillport info",
    content:
      "Show details for a specific skill or plugin.\n\n" +
      "```\nskillport info <name> --code <CODE>\n```\n\n" +
      "Shows: name, version, plugin, description, category, tags, surface tags, " +
      "publish status, edit permissions, and file list.\n\n" +
      "The `<name>` is the skill name as shown in `skillport list`.",
    category: "commands",
    keywords: ["info", "details", "show", "describe", "skill", "plugin", "metadata"],
  },
  {
    id: "updates-command",
    title: "skillport updates",
    content:
      "Check if installed skills have newer versions in the marketplace.\n\n" +
      "```\nskillport updates --installed '<json>' --code <CODE>\n```\n\n" +
      "The `--installed` flag takes a JSON array of `{ \"name\": \"...\", \"version\": \"...\" }` objects.\n" +
      "The model should construct this from local `.claude-plugin/plugin.json` files.\n\n" +
      "Output: table of skills with available updates (installed vs latest version).",
    category: "commands",
    keywords: ["updates", "check", "version", "upgrade", "outdated", "installed"],
  },
  {
    id: "whoami-command",
    title: "skillport whoami",
    content:
      "Show the authenticated user's identity.\n\n" +
      "```\nskillport whoami --code <CODE>\n```\n\n" +
      "Shows: name, email, and user ID. Useful for verifying which account is " +
      "associated with the auth code.",
    category: "commands",
    keywords: ["whoami", "identity", "user", "account", "email", "who"],
  },
  {
    id: "get-command",
    title: "skillport get",
    content:
      "Download a skill from the marketplace.\n\n" +
      "```\n" +
      "skillport get <name> --code <CODE>                        # unpacked files\n" +
      "skillport get <name> --format skill --code <CODE>          # .skill ZIP\n" +
      "```\n\n" +
      "Files are written to `./<name>/` (unpacked) or `./<name>.skill` (ZIP).\n\n" +
      "Future flags (not yet implemented):\n" +
      "- `--skill <name>` — target a specific skill within a plugin\n" +
      "- `--skills-only` — get all skills as standalone\n" +
      "- `--format plugin` — download as .plugin ZIP",
    category: "commands",
    keywords: ["get", "download", "install", "fetch", "skill", "plugin", "zip", "format"],
  },
  {
    id: "create-command",
    title: "skillport create",
    content:
      "Scaffold a new plugin or skill directory locally. No auth required.\n\n" +
      "```\n" +
      "skillport create <name>              # new plugin with one skill\n" +
      "skillport create --skill <name>       # standalone skill\n" +
      "```\n\n" +
      "Plugin scaffold creates:\n" +
      "- `.claude-plugin/plugin.json`\n" +
      "- `skills/<name>/SKILL.md`\n\n" +
      "Skill scaffold creates:\n" +
      "- `SKILL.md`\n" +
      "- `.claude-plugin/plugin.json`\n\n" +
      "After creating, edit SKILL.md and use `skillport save` to publish.",
    category: "commands",
    keywords: ["create", "scaffold", "new", "template", "plugin", "skill", "init", "start"],
  },
  {
    id: "save-command",
    title: "skillport save",
    content:
      "Push local skill files to the marketplace and bump version.\n\n" +
      "```\n" +
      "skillport save <name> <patch|minor|major> --code <CODE>\n" +
      "```\n\n" +
      "Reads all files from `./<name>/`, uploads to the marketplace, " +
      "and bumps the version. Always specify a bump type.\n\n" +
      "Workflow: `skillport create <name>` → edit SKILL.md → `skillport save <name> patch`",
    category: "commands",
    keywords: ["save", "push", "publish", "upload", "bump", "version", "patch", "minor", "major"],
  },
  {
    id: "deactivate-command",
    title: "skillport deactivate / reactivate",
    content:
      "Remove a plugin from the marketplace (deactivate) or restore it (reactivate).\n\n" +
      "```\n" +
      "skillport deactivate <name> --code <CODE>\n" +
      "skillport reactivate <name> --code <CODE>\n" +
      "```\n\n" +
      "Deactivate sets a flag in plugin.json and removes from marketplace.json. " +
      "The plugin files remain on GitHub. Reactivate reverses this.\n\n" +
      "To permanently delete: deactivate first, then `skillport delete <name> --confirm`.",
    category: "commands",
    keywords: ["deactivate", "reactivate", "remove", "restore", "disable", "enable", "lifecycle"],
  },
  {
    id: "delete-command",
    title: "skillport delete",
    content:
      "Permanently delete a plugin or skill from the marketplace.\n\n" +
      "```\n" +
      "skillport delete <name> --confirm --code <CODE>\n" +
      "```\n\n" +
      "Requires `--confirm` flag. For plugins, must deactivate first. " +
      "Removes all files from GitHub. This cannot be undone.",
    category: "commands",
    keywords: ["delete", "remove", "destroy", "permanent", "confirm"],
  },
  {
    id: "sync-command",
    title: "skillport sync",
    content:
      "Regenerate marketplace.json from all plugin.json files on GitHub.\n\n" +
      "```\n" +
      "skillport sync --code <CODE>              # write changes\n" +
      "skillport sync --dry-run --code <CODE>     # preview only\n" +
      "```\n\n" +
      "Scans all plugin directories, skips deactivated plugins, " +
      "and rebuilds the marketplace index. Use `--dry-run` to preview changes.",
    category: "commands",
    keywords: ["sync", "regenerate", "marketplace", "rebuild", "index", "dry-run", "validate"],
  },
];
