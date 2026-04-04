import type { ParsedArgs } from "../index";
import type { ApiClient } from "../api-client";

interface SyncResponse {
  success: boolean;
  plugins: number;
  added: string[];
  removed: string[];
}

interface SyncDryRunResponse {
  dryRun: true;
  current: number;
  proposed: number;
  added: string[];
  removed: string[];
  kept: string[];
}

export async function runSync(
  args: ParsedArgs,
  api: ApiClient,
): Promise<void> {
  const dryRun = args.flags["dry-run"] as boolean | undefined;
  const endpoint = dryRun ? "/api/sync?dry_run=true" : "/api/sync";

  const data = await api.post<SyncResponse | SyncDryRunResponse>(endpoint, {});

  if ("dryRun" in data && data.dryRun) {
    const dr = data as SyncDryRunResponse;
    console.log(`Dry run: ${dr.current} current → ${dr.proposed} proposed`);
    if (dr.added.length > 0) {
      console.log(`  Added: ${dr.added.join(", ")}`);
    }
    if (dr.removed.length > 0) {
      console.log(`  Removed: ${dr.removed.join(", ")}`);
    }
    console.log("No changes written.");
    return;
  }

  const result = data as SyncResponse;
  console.log(`Marketplace synced: ${result.plugins} plugin(s)`);
  if (result.added.length > 0) {
    console.log(`  Added: ${result.added.join(", ")}`);
  }
  if (result.removed.length > 0) {
    console.log(`  Removed: ${result.removed.join(", ")}`);
  }
}
