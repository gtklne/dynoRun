import { isNative } from '@/app/platform';

const STORAGE_KEY = 'dynorun.session_token';

/**
 * Session token store for the native builds only.
 *
 * On the web the session is an HttpOnly cookie and nothing here is ever used.
 * Native cannot work that way: a social sign-in happens in the *system browser*
 * (SFSafariViewController / Chrome Custom Tab), so the cookie better-auth sets
 * lands in that browser's jar and the Capacitor webview never sees it. The app
 * therefore trades a one-time token for a session token and presents it as
 * `Authorization: Bearer`, which better-auth's bearer plugin converts back into
 * a session cookie server-side, so `requireAuth` is unchanged.
 *
 * localStorage rather than @capacitor/preferences because better-auth's client
 * reads the token synchronously. WKWebView can evict localStorage under storage
 * pressure; the cost of that is one extra sign-in, not data loss.
 */
export function getNativeToken(): string | null {
  if (!isNative()) return null;
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setNativeToken(token: string): void {
  if (!isNative()) return;
  try {
    localStorage.setItem(STORAGE_KEY, token);
  } catch {
    // A webview with storage disabled degrades to a session that ends with the
    // process, which is preferable to failing the sign-in outright.
  }
}

export function clearNativeToken(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear.
  }
}
