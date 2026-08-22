/**
 * Keeps a post-sign-in destination same-origin and relative.
 *
 * Shared so the login screen, the OAuth continue screen and the tests all
 * apply the identical rule; a second, slightly different copy is how an open
 * redirect gets in.
 */
export function safeCallbackPath(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('/')) return null;
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}
