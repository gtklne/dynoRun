import { Subject } from '@/shared/observable';
import { getNativeToken } from '@/auth/native-token';

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
  const headers = new Headers(rest.headers);
  // Avoid an unnecessary CORS preflight on read-only requests. JSON is the
  // default for this API's write payloads, but a GET has no content to type.
  if (rest.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  // Native builds have no usable cookie: the webview origin
  // (capacitor://localhost) is cross-site to the API, and better-auth's session
  // cookie is SameSite=Lax, so `credentials: 'include'` sends nothing. Without
  // this header every request from the app 401s and the 401 handler below
  // bounces it back to /login, in a loop, however successful the sign-in was.
  // Returns null on web, where the cookie is the session. See native-token.ts.
  const nativeToken = getNativeToken();
  if (nativeToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${nativeToken}`);
  }
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...rest,
      credentials: 'include',
      headers,
    });
  } catch (err) {
    apiErrors$.next(err);
    throw err;
  }
  if (res.status === 401) {
    if (publicEndpoint) {
      throw new ApiError(401, 'Unauthorized');
    }
    // Session expiry can happen on a deep screen. Preserve it through the
    // sign-in flow instead of always returning the person to Home.
    const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.href = `/login?next=${encodeURIComponent(currentPath)}`;
    throw new ApiError(401, 'Unauthorized');
  }
  if (!res.ok) {
    const text = await res.text();
    let message = text || `HTTP ${res.status}`;
    try {
      const payload: unknown = JSON.parse(text);
      if (payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string') {
        message = payload.error;
      }
    } catch {
      // Plain-text error responses are valid too.
    }
    const err = new ApiError(res.status, message);
    if (!publicEndpoint) apiErrors$.next(err);
    throw err;
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
