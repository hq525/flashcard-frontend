import { getAuthSession } from '../auth/session';
import { getApiConfig } from './config';

export class ApiError extends Error {
  readonly status: number;
  readonly outcomeUnknown: boolean;

  constructor(status: number, message: string, outcomeUnknown = false) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.outcomeUnknown = outcomeUnknown;
  }
}

export interface RequestOptions {
  params?: Record<string, string>;
  body?: unknown;
  file?: File;
}

export async function request<T = unknown>(
  method: string,
  path: string,
  opts: RequestOptions = {},
): Promise<T> {
  const { baseUrl } = getApiConfig();
  const session = getAuthSession();
  const generation = session.generation;
  let token: string;
  try { token = await session.getIdToken(); }
  catch { throw new ApiError(401, 'Sign in to continue.'); }
  const url = new URL(baseUrl + path);
  for (const [key, value] of Object.entries(opts.params ?? {})) {
    url.searchParams.set(key, value);
  }

  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (opts.file) headers['Content-Type'] = opts.file.type;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

  const body = opts.file ? await opts.file.arrayBuffer() : opts.body !== undefined ? JSON.stringify(opts.body) : undefined;
  if (generation !== session.generation) throw new ApiError(401, 'Session ended. Sign in again.');
  const writing = !['GET', 'HEAD'].includes(method.toUpperCase());
  let res: Response;
  try {
    res = await fetch(url, { method, headers, body, cache: 'no-store', redirect: 'error' });
  } catch {
    throw new ApiError(0, 'Connection interrupted. The request result could not be confirmed.', writing);
  }

  // A write may already have committed even though this session can no longer
  // receive its response. Callers must not blindly replay an uncertain write.
  if (generation !== session.generation) throw new ApiError(401, 'Session ended. Sign in again.', writing);
  if (res.status === 401) await session.lock();
  if (res.status === 403) await session.clear();
  if (!res.ok) {
    let message = `Request failed with status ${res.status}`;
    try {
      const data = (await res.json()) as { message?: unknown };
      if (typeof data.message === 'string') message = data.message;
    } catch {
      // non-JSON error body — keep the fallback message
    }
    throw new ApiError(res.status, message, writing && res.status >= 500);
  }
  let result: T;
  try { result = (await res.json()) as T; }
  catch { throw new ApiError(0, 'The server response could not be read.', writing); }
  if (generation !== session.generation) throw new ApiError(401, 'Session ended. Sign in again.', writing);
  return result;
}
