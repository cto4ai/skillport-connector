import type { MethodResult } from "./types";
import { handleAuth } from "./auth";

interface DispatchUserProps {
  uid: string;
  provider: string;
  email: string;
  name: string;
}

export async function dispatch(
  fullMethod: string,
  args: Record<string, unknown>,
  env: Env,
  uid: string,
  userProps: DispatchUserProps,
): Promise<MethodResult> {
  const dotIndex = fullMethod.indexOf(".");
  if (dotIndex === -1) {
    return {
      content: [{ type: "text", text: `Unknown method "${fullMethod}". Expected format: namespace.method (e.g. auth.get_code)` }],
      isError: true,
    };
  }

  const namespace = fullMethod.slice(0, dotIndex);
  const method = fullMethod.slice(dotIndex + 1);

  if (namespace === "auth") {
    return handleAuth(method, args, env, uid, userProps);
  }

  return {
    content: [{ type: "text", text: `Unknown method "${fullMethod}". Available namespaces: auth` }],
    isError: true,
  };
}
