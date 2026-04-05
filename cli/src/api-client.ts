import { execFileSync } from "child_process";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Check if we're in a proxy environment (e.g. Claude.ai sandbox).
 * Node's native fetch doesn't respect https_proxy, so we fall back to curl.
 */
function hasProxy(): boolean {
  return !!(
    process.env.https_proxy ||
    process.env.HTTPS_PROXY ||
    process.env.http_proxy ||
    process.env.HTTP_PROXY
  );
}

/**
 * Make an HTTP request via curl. Used in proxy environments where
 * Node's native fetch can't route through the proxy.
 */
// Unique separator that won't appear in response bodies
const CURL_SEPARATOR = "---SKILLPORT_HTTP_STATUS---";

function curlRequest(
  url: string,
  method: string,
  headers: Record<string, string>,
  body?: string,
): { status: number; body: string } {
  const args = [
    "-s",
    "-w",
    `${CURL_SEPARATOR}%{http_code}`,
    "-X",
    method,
  ];

  for (const [k, v] of Object.entries(headers)) {
    args.push("-H", `${k}: ${v}`);
  }

  if (body) {
    args.push("-d", body);
  }

  args.push(url);

  const raw = execFileSync("curl", args, {
    encoding: "utf-8",
    timeout: 30000,
  });

  // Split on our unique separator to extract status code
  const sepIdx = raw.lastIndexOf(CURL_SEPARATOR);
  if (sepIdx === -1) {
    return { status: 0, body: raw };
  }

  const responseBody = raw.slice(0, sepIdx);
  const status = parseInt(raw.slice(sepIdx + CURL_SEPARATOR.length), 10);

  return { status, body: responseBody };
}

export class ApiClient {
  private useProxy: boolean;

  constructor(
    private baseUrl: string,
    private code: string,
  ) {
    this.useProxy = hasProxy();
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.code}`,
      "Content-Type": "application/json",
    };
  }

  async get<T = unknown>(
    path: string,
    params?: Record<string, string | undefined>,
  ): Promise<T> {
    let url = `${this.baseUrl}${path}`;

    if (params) {
      const filtered = Object.entries(params).filter(
        ([, v]) => v !== undefined,
      ) as [string, string][];
      if (filtered.length > 0) {
        url += "?" + new URLSearchParams(filtered).toString();
      }
    }

    return this.request<T>(url, "GET");
  }

  async post<T = unknown>(path: string, body: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    return this.request<T>(url, "POST", JSON.stringify(body));
  }

  async put<T = unknown>(path: string, body: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    return this.request<T>(url, "PUT", JSON.stringify(body));
  }

  async delete<T = unknown>(pathWithQuery: string): Promise<T> {
    const url = `${this.baseUrl}${pathWithQuery}`;
    return this.request<T>(url, "DELETE");
  }

  private async request<T>(
    url: string,
    method: string,
    body?: string,
  ): Promise<T> {
    const hdrs = this.headers();

    if (this.useProxy) {
      return this.requestViaCurl<T>(url, method, hdrs, body);
    }

    return this.requestViaFetch<T>(url, method, hdrs, body);
  }

  private requestViaCurl<T>(
    url: string,
    method: string,
    headers: Record<string, string>,
    body?: string,
  ): T {
    let result: { status: number; body: string };
    try {
      result = curlRequest(url, method, headers, body);
    } catch (error) {
      throw new ApiError(
        `Network error: ${error instanceof Error ? error.message : String(error)}`,
        0,
      );
    }

    if (result.status >= 400) {
      let details: string | undefined;
      try {
        const parsed = JSON.parse(result.body);
        details = parsed.details || parsed.error || result.body;
      } catch {
        details = result.body || `HTTP ${result.status}`;
      }
      throw new ApiError(
        details || `HTTP ${result.status}`,
        result.status,
        details,
      );
    }

    try {
      return JSON.parse(result.body) as T;
    } catch {
      throw new ApiError(`Invalid JSON response from ${url}`, 0);
    }
  }

  private async requestViaFetch<T>(
    url: string,
    method: string,
    headers: Record<string, string>,
    body?: string,
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(url, { method, headers, body });
    } catch (error) {
      throw new ApiError(
        `Network error: ${error instanceof Error ? error.message : String(error)}`,
        0,
      );
    }

    if (!response.ok) {
      let details: string | undefined;
      try {
        const respBody = await response.json();
        details = respBody.details || respBody.error || JSON.stringify(respBody);
      } catch {
        details = `HTTP ${response.status}`;
      }
      throw new ApiError(
        details || `HTTP ${response.status}`,
        response.status,
        details,
      );
    }

    return response.json() as Promise<T>;
  }
}
