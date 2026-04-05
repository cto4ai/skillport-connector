import type { ParsedArgs } from "../index";
import type { ApiClient } from "../api-client";

interface WhoamiResponse {
  id: string;
  email: string;
  name: string;
  provider: string;
}

export async function runWhoami(
  _args: ParsedArgs,
  api: ApiClient,
): Promise<void> {
  const data = await api.get<WhoamiResponse>("/api/whoami");
  console.log(`${data.name} <${data.email}>`);
  console.log(`ID: ${data.id}`);
}
