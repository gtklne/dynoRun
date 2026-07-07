import { Subject } from '@/shared/observable';

const BASE = import.meta.env.VITE_API_URL ?? '';

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

// Broadcasts every non-401 failed API request so the ToastProvider can surface
// the error without each repository having to know about UI.
export const apiErrors$ = new Subject<unknown>();

export interface ApiFetchOptions extends RequestInit {
  /** When true, a 401 response throws ApiError instead of redirecting to /login.
   *  Set this for endpoints that are intentionally callable without a session,
   *  e.g. public share reads served to logged-out visitors. */
  publicEndpoint?: boolean;
}

export async function apiFetch<T>(path: string, init?: ApiFetchOptions): Promise<T> {
  const { publicEndpoint, ...rest } = init ?? {};
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...rest,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...rest.headers,
      },
    });
  } catch (err) {
    apiErrors$.next(err);
    throw err;
  }
  if (res.status === 401) {
    if (publicEndpoint) {
      throw new ApiError(401, 'Unauthorized');
    }
    // Imperative nav (not basename-aware). App is served at root, so → /login.
    window.location.href = '/login';
    throw new ApiError(401, 'Unauthorized');
  }
  if (!res.ok) {
    const text = await res.text();
    const err = new ApiError(res.status, text || `HTTP ${res.status}`);
    if (!publicEndpoint) apiErrors$.next(err);
    throw err;
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
