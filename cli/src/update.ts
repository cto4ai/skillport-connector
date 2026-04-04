import { execFileSync, execSync } from "child_process";
import { writeFileSync } from "fs";

/**
 * Check for CLI updates and self-update if needed.
 * Compares local VERSION against server's /cli/version.
 * If outdated, downloads new bundle, overwrites self, re-execs.
 *
 * Returns true if re-exec happened (caller should exit).
 * Returns false if no update needed or check failed (continue normally).
 */
export function checkForUpdate(
  localVersion: string,
  baseUrl: string,
): boolean {
  // Don't check if explicitly skipped
  if (process.env.SKILLPORT_SKIP_UPDATE === "1") {
    return false;
  }

  let serverVersion: string;
  try {
    serverVersion = fetchVersion(baseUrl);
  } catch {
    // Version check failed — continue with current version
    return false;
  }

  if (serverVersion === localVersion || serverVersion === "unknown") {
    return false;
  }

  // Server has a different version — download and re-exec
  console.error(`Updating CLI: ${localVersion} → ${serverVersion}`);

  try {
    const selfPath = process.argv[1];
    downloadBundle(baseUrl, selfPath);

    // Re-exec with same args, skip update check to prevent loop
    const result = execFileSync("node", process.argv.slice(1), {
      stdio: "inherit",
      env: { ...process.env, SKILLPORT_SKIP_UPDATE: "1" },
    });
    return true;
  } catch (error) {
    // Download or re-exec failed — continue with current version
    console.error(`Update failed, continuing with v${localVersion}`);
    return false;
  }
}

function fetchVersion(baseUrl: string): string {
  const proxyUrl =
    process.env.https_proxy ||
    process.env.HTTPS_PROXY ||
    process.env.http_proxy ||
    process.env.HTTP_PROXY;

  const url = `${baseUrl}/cli/version`;

  if (proxyUrl) {
    // Use curl in proxy environments
    const raw = execFileSync("curl", ["-s", "--max-time", "5", url], {
      encoding: "utf-8",
      timeout: 10000,
    });
    const data = JSON.parse(raw);
    return data.version;
  }

  // Use curl anyway — simpler than async fetch in a sync context
  const raw = execFileSync("curl", ["-s", "--max-time", "5", url], {
    encoding: "utf-8",
    timeout: 10000,
  });
  const data = JSON.parse(raw);
  return data.version;
}

function downloadBundle(baseUrl: string, destPath: string): void {
  const url = `${baseUrl}/cli/skillport.js`;
  const content = execFileSync("curl", ["-s", "--max-time", "15", url], {
    encoding: "utf-8",
    timeout: 20000,
  });

  if (!content.includes("#!/usr/bin/env node")) {
    throw new Error("Downloaded content doesn't look like the CLI bundle");
  }

  writeFileSync(destPath, content, "utf-8");
}
