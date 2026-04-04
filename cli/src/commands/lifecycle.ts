import type { ParsedArgs } from "../index";
import type { ApiClient } from "../api-client";

interface LifecycleResponse {
  success: boolean;
  plugin: string;
  action: string;
}

interface DeleteResponse {
  success: boolean;
  skill: string;
  plugin: string;
  pluginDeleted: boolean;
  deletedFiles: string[];
}

export async function runDeactivate(
  args: ParsedArgs,
  api: ApiClient,
): Promise<void> {
  const name = args.positional[0];
  if (!name) {
    console.error("Usage: skillport deactivate <name> --code <CODE>");
    throw new Error("Missing plugin name");
  }

  const data = await api.post<LifecycleResponse>(
    `/api/skills/${encodeURIComponent(name)}/deactivate`,
    {},
  );

  console.log(`${data.plugin} deactivated.`);
  console.log("Removed from marketplace. Use 'reactivate' to restore.");
}

export async function runReactivate(
  args: ParsedArgs,
  api: ApiClient,
): Promise<void> {
  const name = args.positional[0];
  if (!name) {
    console.error("Usage: skillport reactivate <name> --code <CODE>");
    throw new Error("Missing plugin name");
  }

  const data = await api.post<LifecycleResponse>(
    `/api/skills/${encodeURIComponent(name)}/reactivate`,
    {},
  );

  console.log(`${data.plugin} reactivated.`);
  console.log("Re-added to marketplace.");
}

export async function runDelete(
  args: ParsedArgs,
  api: ApiClient,
): Promise<void> {
  const name = args.positional[0];
  if (!name) {
    console.error("Usage: skillport delete <name> --confirm --code <CODE>");
    throw new Error("Missing skill name");
  }

  if (!args.flags.confirm) {
    console.error("Error: --confirm flag is required for delete.");
    console.error("This permanently removes files from the marketplace.");
    throw new Error("Missing --confirm flag");
  }

  const data = await api.delete<DeleteResponse>(
    `/api/skills/${encodeURIComponent(name)}?confirm=true`,
  );

  console.log(`Deleted ${data.skill} (${data.deletedFiles.length} file(s) removed)`);
  if (data.pluginDeleted) {
    console.log(`Plugin ${data.plugin} removed (was last skill).`);
  }
}
