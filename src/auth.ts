import { apiError, apiSuccess } from "./helpers";
import type { MethodResult } from "./types";

interface AuthUserProps {
  uid: string;
  provider: string;
  email: string;
  name: string;
}

const CODE_TTL_SECONDS = 8 * 60 * 60; // 8 hours

export async function handleAuth(
  method: string,
  args: Record<string, unknown>,
  env: Env,
  uid: string,
  userProps: AuthUserProps,
): Promise<MethodResult> {
  switch (method) {
    case "get_code":
      return authGetCode(env, uid, userProps);
    case "whoami":
      return authWhoami(userProps);
    default:
      return apiError(`auth.${method}`, "Unknown method. Available: get_code, whoami");
  }
}

async function authGetCode(
  env: Env,
  uid: string,
  userProps: AuthUserProps,
): Promise<MethodResult> {
  const code = generateCode();

  await env.OAUTH_KV.put(
    `cli_code:${code}`,
    JSON.stringify({
      uid: userProps.uid,
      provider: userProps.provider,
      email: userProps.email,
      name: userProps.name,
      created: Date.now(),
    }),
    { expirationTtl: CODE_TTL_SECONDS },
  );

  return apiSuccess({ code });
}

function authWhoami(userProps: AuthUserProps): Promise<MethodResult> {
  return Promise.resolve(
    apiSuccess({
      email: userProps.email,
      name: userProps.name,
    }),
  );
}

function generateCode(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
