const DEFAULT_CONNECTOR_URL = "https://skillport-connector.jack-ivers.workers.dev";

/**
 * Resolve and validate CONNECTOR_URL from env.
 * Strips trailing slashes, validates protocol, logs on fallback.
 */
export function resolveConnectorUrl(env: Env): string {
  const raw = env.CONNECTOR_URL;
  if (!raw) {
    console.warn("[CONFIG] CONNECTOR_URL not set, using default:", DEFAULT_CONNECTOR_URL);
    return DEFAULT_CONNECTOR_URL;
  }

  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) {
    console.warn("[CONFIG] CONNECTOR_URL is empty, using default:", DEFAULT_CONNECTOR_URL);
    return DEFAULT_CONNECTOR_URL;
  }

  try {
    const parsed = new URL(trimmed);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      console.error(`[CONFIG] CONNECTOR_URL has unexpected protocol "${parsed.protocol}", using default`);
      return DEFAULT_CONNECTOR_URL;
    }
    return trimmed;
  } catch {
    console.error(`[CONFIG] CONNECTOR_URL is not a valid URL: "${raw}", using default`);
    return DEFAULT_CONNECTOR_URL;
  }
}

/**
 * Get the CLI download URL for the given connector.
 */
export function getCliUrl(env: Env): string {
  return `${resolveConnectorUrl(env)}/cli/skillport.js`;
}
