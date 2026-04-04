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
 * Get a proxy-aware fetch function.
 * Node's native fetch ignores https_proxy env var.
 * When a proxy is detected, use undici's ProxyAgent (ships with Node 18+).
 */
async function getProxyFetch(): Promise<typeof fetch> {
  const proxyUrl =
    process.env.https_proxy ||
    process.env.HTTPS_PROXY ||
    process.env.http_proxy ||
    process.env.HTTP_PROXY;

  if (!proxyUrl) return fetch;

  try {
    const undici = await import("undici");
    const dispatcher = new undici.ProxyAgent(proxyUrl);
    return (input: string | URL | Request, init?: RequestInit) =>
      undici.fetch(input, { ...init, dispatcher } as any) as Promise<Response>;
  } catch {
    // undici not available — fall back to native fetch
    return fetch;
  }
}

export class ApiClient {
  private proxyFetch: typeof fetch | null = null;

  constructor(
    private baseUrl: string,
    private code: string,
  ) {}

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.code}`,
      "Content-Type": "application/json",
    };
  }

  private async getFetch(): Promise<typeof fetch> {
    if (!this.proxyFetch) {
      this.proxyFetch = await getProxyFetch();
    }
    return this.proxyFetch;
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

    return this.request<T>(url, { method: "GET", headers: this.headers() });
  }

  async post<T = unknown>(path: string, body: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    return this.request<T>(url, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });
  }

  private async request<T>(url: string, init: RequestInit): Promise<T> {
    const doFetch = await this.getFetch();
    let response: Response;
    try {
      response = await doFetch(url, init);
    } catch (error) {
      throw new ApiError(
        `Network error: ${error instanceof Error ? error.message : String(error)}`,
        0,
      );
    }

    if (!response.ok) {
      let details: string | undefined;
      try {
        const body = await response.json();
        details = body.details || body.error || JSON.stringify(body);
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
