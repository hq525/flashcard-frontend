import { getApiConfig } from './config';

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export interface RequestOptions {
  params?: Record<string, string>;
  body?: unknown;
}

export async function request<T = unknown>(
  method: string,
  path: string,
  opts: RequestOptions = {},
): Promise<T> {
  const { baseUrl, apiKey } = getApiConfig();
  const url = new URL(baseUrl + path);
  for (const [key, value] of Object.entries(opts.params ?? {})) {
    url.searchParams.set(key, value);
  }

  const headers: Record<string, string> = {};
  if (apiKey) headers['X-Api-Key'] = apiKey;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(url, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (!res.ok) {
    let message = `Request failed with status ${res.status}`;
    try {
      const data = (await res.json()) as { message?: unknown };
      if (typeof data.message === 'string') message = data.message;
    } catch {
      // non-JSON error body — keep the fallback message
    }
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as T;
}
