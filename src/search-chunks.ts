import type { SearchChunk } from "./types";

const DEFAULT_CONNECTOR_URL = "https://skillport-connector.jack-ivers.workers.dev";

export function getSearchChunks(connectorUrl?: string): SearchChunk[] {
  const baseUrl = connectorUrl || DEFAULT_CONNECTOR_URL;
  return [
  {
    id: "getting-started",
    title: "Getting Started with Skillport CLI",
    content:
      "1. Get an auth code: the model calls `execute({ method: \"auth.get_code\" })` via MCP\n" +
      `2. Install the CLI: \`curl -sO ${baseUrl}/cli/skillport.js\`\n` +
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
      "**Browse:** `list` (plugins), `info` (plugin or skill), `updates`\n" +
      "**Get:** `get` (with --format skill for ZIP)\n" +
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
      "List all plugins in the marketplace, grouped by plugin.\n\n" +
      "```\nskillport list --code <CODE>\n" +
      "skillport list --surface CC --code <CODE>\n```\n\n" +
      "Options:\n" +
      "- `--surface <tag>` — Filter by surface: CC (Claude Code), CD (Claude Desktop), " +
      "CAI (Claude.ai), CDAI (Claude Desktop AI), CALL (all surfaces)\n\n" +
      "Output: table showing each plugin with skill count, version, and surface tags. " +
      "Multi-skill plugins list their skills underneath.",
    category: "commands",
    keywords: ["list", "browse", "marketplace", "skills", "plugins", "surface", "filter"],
  },
  {
    id: "info-command",
    title: "skillport info",
    content:
      "Show details for a plugin or skill.\n\n" +
      "```\nskillport info <name> --code <CODE>\n```\n\n" +
      "Works with both plugin names and skill names:\n" +
      "- **Plugin name** (e.g. `test-tools`): shows plugin metadata, surface tags, " +
      "and lists all components (skills, commands)\n" +
      "- **Skill name** (e.g. `json-validator`): shows skill details, plugin, " +
      "category, tags, and file list\n" +
      "- `info <plugin> --skill <skill>`: show skill details for a specific skill within a plugin\n" +
      "- `info <name> --skill`: force skill-level view (for same-named plugin/skill)\n\n" +
      "The CLI tries plugin first, then falls back to skill.",
    category: "commands",
    keywords: ["info", "details", "show", "describe", "skill", "plugin", "metadata", "components"],
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
      "Download skills or plugins from the marketplace.\n\n" +
      "```\n" +
      "skillport get <name> --code <CODE>                              # skill, unpacked\n" +
      "skillport get <plugin> --skill <skill> --code <CODE>            # specific skill from plugin\n" +
      "skillport get <plugin> --skills-only --code <CODE>              # all skills as standalone\n" +
      "skillport get <name> --format skill --code <CODE>               # .skill ZIP\n" +
      "skillport get <plugin> --format plugin --code <CODE>            # .plugin ZIP\n" +
      "skillport get <plugin> --skills-only --format skill --code <CODE>  # all skills as .skill ZIPs\n" +
      "```\n\n" +
      "Invalid combinations (rejected):\n" +
      "- `--skill <x> --format plugin` (a single skill isn't a plugin)\n" +
      "- `--skills-only --format plugin` (standalone skills aren't a plugin)",
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
      "Push local files to the marketplace and bump version.\n\n" +
      "```\n" +
      "skillport save <name> <patch|minor|major> --code <CODE>                # whole plugin or skill\n" +
      "skillport save <plugin> --skill <skill> <patch|minor|major> --code <CODE>  # one skill in plugin\n" +
      "```\n\n" +
      "Detects layout automatically: if `./<name>/skills/` exists, saves as plugin " +
      "(PUT /api/plugins/:name). Otherwise saves as standalone skill.\n" +
      "`--skill <name>` targets a specific skill within a plugin directory.\n\n" +
      "Workflow: `create` → edit SKILL.md → `save <name> patch`",
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
}
