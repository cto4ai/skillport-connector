const VERSION = "3.0.0-alpha.1";

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

  console.log(`skillport v${VERSION}`);
  console.log(`Command: ${args.command}`);
  if (args.positional.length > 0) console.log(`Args: ${args.positional.join(", ")}`);
  if (args.code) console.log(`Code: ${args.code.slice(0, 4)}...`);
  console.log("(not yet implemented)");
  process.exit(1);
}
