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

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    });
  } catch (err) {
    apiErrors$.next(err);
    throw err;
  }
  if (res.status === 401) {
    window.location.href = '/login';
    throw new ApiError(401, 'Unauthorized');
  }
  if (!res.ok) {
    const text = await res.text();
    const err = new ApiError(res.status, text || `HTTP ${res.status}`);
    apiErrors$.next(err);
    throw err;
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
