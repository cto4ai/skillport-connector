import type { ParsedArgs } from "../index";
import type { ApiClient } from "../api-client";

interface Update {
  name: string;
  installedVersion: string;
  availableVersion: string;
}

interface UpdatesResponse {
  hasUpdates: boolean;
  updates: Update[];
}

export async function runUpdates(
  args: ParsedArgs,
  api: ApiClient,
): Promise<void> {
  const raw = args.flags.installed;
  if (!raw || typeof raw !== "string") {
    console.error("Error: --installed <json> is required.");
    console.error('Example: --installed \'[{"name":"foo","version":"1.0.0"}]\'');
    throw new Error("Missing --installed flag");
  }

  let installed: Array<{ name: string; version: string }>;
  try {
    installed = JSON.parse(raw);
  } catch {
    console.error("Error: --installed value is not valid JSON.");
    throw new Error("Invalid JSON in --installed");
  }

  const data = await api.post<UpdatesResponse>("/api/check-updates", {
    installed,
  });

  if (!data.hasUpdates || data.updates.length === 0) {
    console.log("All skills are up to date.");
    return;
  }

  const header = `${"Name".padEnd(30)} ${"Installed".padEnd(12)} ${"Latest".padEnd(12)}`;
  console.log(header);
  console.log("-".repeat(header.length));

  for (const u of data.updates) {
    if (!u.name || !u.installedVersion || !u.availableVersion) {
      console.error(`Warning: skipping malformed update entry: ${JSON.stringify(u)}`);
      continue;
    }
    console.log(
      `${u.name.padEnd(30)} ${u.installedVersion.padEnd(12)} ${u.availableVersion.padEnd(12)}`,
    );
  }

  console.log("");
  console.log(`${data.updates.length} update(s) available.`);
}
