import { execFileSync } from "child_process";
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
  } catch (error) {
    // Log but don't block — update check is non-critical
    console.error(`[update] Version check failed: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }

  if (serverVersion === localVersion || serverVersion === "unknown") {
    return false;
  }

  // Only update if server version is newer (simple semver comparison)
  if (!isNewer(serverVersion, localVersion)) {
    return false;
  }

  console.error(`Updating CLI: ${localVersion} → ${serverVersion}`);

  // Step 1: Download new bundle
  const selfPath = process.argv[1];
  try {
    downloadBundle(baseUrl, selfPath);
  } catch (error) {
    console.error(`[update] Download failed: ${error instanceof Error ? error.message : String(error)}`);
    console.error("Continuing with current version.");
    return false;
  }

  // Step 2: Re-exec with new bundle
  try {
    execFileSync("node", process.argv.slice(1), {
      stdio: "inherit",
      env: { ...process.env, SKILLPORT_SKIP_UPDATE: "1" },
    });
    return true;
  } catch (error) {
    console.error(`[update] CLI updated to ${serverVersion} but re-exec failed: ${error instanceof Error ? error.message : String(error)}`);
    console.error("Try running your command again.");
    return true; // Binary is updated, caller should exit
  }
}

/**
 * Version comparison: returns true if server > local.
 * Handles formats like "3.0.0" and "3.0.0-42.af6a286" (base-commitCount.sha).
 * Compares major.minor.patch first, then commit count if base versions match.
 */
function isNewer(server: string, local: string): boolean {
  const parse = (v: string) => {
    const [base, pre] = v.split("-", 2);
    const [major, minor, patch] = base.split(".").map((s) => parseInt(s, 10) || 0);
    const commitCount = pre ? parseInt(pre.split(".")[0], 10) || 0 : 0;
    return { major, minor, patch, commitCount };
  };
  const s = parse(server);
  const l = parse(local);
  if (s.major !== l.major) return s.major > l.major;
  if (s.minor !== l.minor) return s.minor > l.minor;
  if (s.patch !== l.patch) return s.patch > l.patch;
  return s.commitCount > l.commitCount;
}

function fetchVersion(baseUrl: string): string {
  const url = `${baseUrl}/cli/version`;
  const raw = execFileSync("curl", ["-s", "--max-time", "5", url], {
    encoding: "utf-8",
    timeout: 10000,
  });

  let data: { version?: string };
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`Server returned non-JSON: ${raw.slice(0, 100)}`);
  }

  if (!data.version) {
    throw new Error(`Server response missing 'version' field`);
  }

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
