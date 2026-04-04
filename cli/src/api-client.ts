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

export class ApiClient {
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
    let response: Response;
    try {
      response = await fetch(url, init);
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
