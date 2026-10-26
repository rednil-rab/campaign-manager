import { DomainError } from '@questkeeper/domain';

/**
 * Any failed API call. It extends DomainError so the existing forms, which already show
 * DomainError messages inline, also show server and network errors without changes.
 */
export class ApiError extends DomainError {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

let onUnauthorized: (() => void) | undefined;

/** Called when a request that needed a session gets a 401 (e.g. the session expired). */
export const setUnauthorizedHandler = (fn: () => void) => {
  onUnauthorized = fn;
};

export async function api<T = void>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.');
  }

  if (res.status === 204) return undefined as T;
  const data: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const message =
      data && typeof data === 'object' && typeof (data as { error?: unknown }).error === 'string'
        ? (data as { error: string }).error
        : `Request failed (${res.status})`;
    if (res.status === 401) onUnauthorized?.();
    throw new ApiError(res.status, message);
  }
  return data as T;
}
