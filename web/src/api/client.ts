/**
 * Requests to the blog API, on this site under /api/. Its session cookie goes along by itself;
 * the browser adds the Origin header that every change must carry.
 */

/** An answer other than success, with the API's own words for it. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    /** Seconds to wait, after too many requests. */
    readonly retryAfter?: number,
  ) {
    super(message);
  }
}

type Options = { method?: string; json?: unknown; body?: FormData };

export async function api<T>(path: string, { method, json, body }: Options = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: method ?? (json !== undefined || body ? 'POST' : 'GET'),
      headers: json !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: json !== undefined ? JSON.stringify(json) : body,
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(0, 'offline', 'No connection.');
  }
  if (response.ok) return (response.status === 204 ? undefined : await response.json()) as T;
  const said = (await response.json().catch(() => undefined)) as
    | { error?: string; message?: string }
    | undefined;
  const wait = Number(response.headers.get('retry-after'));
  throw new ApiError(
    response.status,
    said?.error ?? 'server_error',
    said?.message ?? 'Something went wrong.',
    Number.isFinite(wait) && wait > 0 ? wait : undefined,
  );
}

/** Where signing in starts, coming back to `next` (this page, unless told otherwise). */
export const signInUrl = (
  next = window.location.pathname + window.location.search + window.location.hash,
) => `/api/auth/login?next=${encodeURIComponent(next)}`;

/** A sentence for a failed request, for a reader. */
export function failure(error: unknown, doing: string) {
  if (!(error instanceof ApiError)) return `Couldn’t ${doing}. Please try again.`;
  if (error.code === 'offline') return `Couldn’t ${doing} without a connection.`;
  if (error.status === 429)
    return `That’s a lot at once. Please wait ${error.retryAfter ?? 60} seconds and try again.`;
  if (error.status === 400 || error.status === 413) return error.message;
  return `Couldn’t ${doing}. Please try again.`;
}
