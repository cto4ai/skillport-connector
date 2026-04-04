const VERSION = "3.0.0-alpha.3";

export interface ParsedArgs {
  command: string;
  positional: string[];
  code?: string;
  flags: Record<string, string | boolean>;
}

export function parseArgs(argv: string[]): ParsedArgs {
  if (argv.length === 0) {
    return { command: "help", positional: [], flags: {} };
  }

  if (argv[0] === "--help" || argv[0] === "-h") {
    return { command: "help", positional: [], flags: {} };
  }
  if (argv[0] === "--version" || argv[0] === "-v") {
    return { command: "version", positional: [], flags: {} };
  }

  const command = argv[0];
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  let code: string | undefined;

  let i = 1;
  while (i < argv.length) {
    const arg = argv[i];

    if (arg === "--code" && i + 1 < argv.length) {
      code = argv[i + 1];
      i += 2;
    } else if (arg === "--skill" && i + 1 < argv.length) {
      flags.skill = argv[i + 1];
      i += 2;
    } else if (arg === "--format" && i + 1 < argv.length) {
      flags.format = argv[i + 1];
      i += 2;
    } else if (arg === "--surface" && i + 1 < argv.length) {
      flags.surface = argv[i + 1];
      i += 2;
    } else if (arg === "--installed" && i + 1 < argv.length) {
      flags.installed = argv[i + 1];
      i += 2;
    } else if (arg === "--base-url" && i + 1 < argv.length) {
      flags["base-url"] = argv[i + 1];
      i += 2;
    } else if (arg === "--skills-only") {
      flags["skills-only"] = true;
      i++;
    } else if (arg === "--dry-run") {
      flags["dry-run"] = true;
      i++;
    } else if (arg === "--confirm") {
      flags.confirm = true;
      i++;
    } else if (arg === "--help" || arg === "-h") {
      flags.help = true;
      i++;
    } else if (!arg.startsWith("--")) {
      positional.push(arg);
      i++;
    } else {
      i++;
    }
  }

  return { command, positional, code, flags };
}

function printHelp(): void {
  console.log(`skillport v${VERSION} — CLI for Skillport plugin marketplace

Usage: skillport <command> [options] --code <CODE>

Commands:
  get <plugin>         Download plugin/skill from marketplace
  save <plugin> <bump> Push local changes (bump: patch|minor|major)
  list                 List plugins and skills
  info <plugin>        Show plugin/skill details
  updates              Check for version updates
  create <name>        Scaffold new plugin or skill locally
  deactivate <plugin>  Remove plugin from marketplace
  reactivate <plugin>  Restore deactivated plugin
  delete <plugin>      Delete plugin files (must be deactivated)
  sync                 Regenerate marketplace.json
  whoami               Show authenticated user

Options:
  --code <CODE>        Auth code (from MCP auth.get_code)
  --skill <name>       Target a specific skill within a plugin
  --skills-only        Target all skills as standalone
  --format <type>      Output format: plugin (.plugin ZIP) or skill (.skill ZIP)
  --surface <tag>      Filter by surface tag (CC, CD, CAI, etc.)
  --dry-run            Preview changes without writing (sync)
  --help, -h           Show help
  --version, -v        Show version`);
}

// Main entry point (only runs when executed directly, not when imported for tests)
const isMain =
  typeof process !== "undefined" &&
  typeof import.meta?.url === "string" &&
  (process.argv[1] === new URL(import.meta.url).pathname ||
    process.argv[1]?.endsWith("/skillport"));

if (isMain) {
  const args = parseArgs(process.argv.slice(2));

  if (args.command === "help") {
    printHelp();
    process.exit(0);
  }

  if (args.command === "version") {
    console.log(VERSION);
    process.exit(0);
  }

  // Commands that require --code
  const REMOTE_COMMANDS = [
    "list", "info", "updates", "whoami",
    "get", "save", "deactivate", "reactivate", "delete", "sync",
  ];

  if (REMOTE_COMMANDS.includes(args.command) && !args.code) {
    console.error(`Error: --code is required for '${args.command}'.`);
    console.error("Get a code via MCP: execute({ method: \"auth.get_code\" })");
    process.exit(1);
  }

  // Local-only commands (no --code needed)
  if (args.command === "create") {
    const { runCreate } = await import("./commands/create");
    await runCreate(args);
    process.exit(0);
  }

  // Remote commands — check for updates, then build API client
  const baseUrl = (args.flags["base-url"] as string) || "https://skillport-connector.jack-ivers.workers.dev";

  // Auto-update: check server version, download + re-exec if outdated
  const { checkForUpdate } = await import("./update");
  if (checkForUpdate(VERSION, baseUrl)) {
    process.exit(0); // Re-exec completed successfully
  }

  const { ApiClient } = await import("./api-client");
  const api = new ApiClient(baseUrl, args.code!);

  try {
    switch (args.command) {
      case "list": {
        const { runList } = await import("./commands/list");
        await runList(args, api);
        break;
      }
      case "info": {
        const { runInfo } = await import("./commands/info");
        await runInfo(args, api);
        break;
      }
      case "updates": {
        const { runUpdates } = await import("./commands/updates");
        await runUpdates(args, api);
        break;
      }
      case "whoami": {
        const { runWhoami } = await import("./commands/whoami");
        await runWhoami(args, api);
        break;
      }
      case "get": {
        const { runGet } = await import("./commands/get");
        await runGet(args, api);
        break;
      }
      case "save": {
        const { runSave } = await import("./commands/save");
        await runSave(args, api);
        break;
      }
      case "deactivate": {
        const { runDeactivate } = await import("./commands/lifecycle");
        await runDeactivate(args, api);
        break;
      }
      case "reactivate": {
        const { runReactivate } = await import("./commands/lifecycle");
        await runReactivate(args, api);
        break;
      }
      case "delete": {
        const { runDelete } = await import("./commands/lifecycle");
        await runDelete(args, api);
        break;
      }
      case "sync": {
        const { runSync } = await import("./commands/sync");
        await runSync(args, api);
        break;
      }
      default:
        console.error(`Command '${args.command}' is not yet implemented.`);
        process.exit(1);
    }
  } catch (error) {
    if (error && typeof error === "object" && "name" in error && error.name === "ApiError") {
      const apiErr = error as { status: number; message: string };
      if (apiErr.status === 401) {
        console.error("Error: Code expired or invalid. Get a new one via MCP auth.get_code.");
      } else {
        console.error(`Error: ${apiErr.message}`);
      }
    } else {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
    process.exit(1);
  }
}
