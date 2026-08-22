import { Hono, type Context } from 'hono';
import { auth, NATIVE_SCHEME } from '../auth.js';

/**
 * Starts a social sign-in for the native apps, from inside the system browser.
 *
 * The obvious design (webview POSTs /sign-in/social, hands the returned
 * authorize URL to the system browser) cannot work. With a database
 * configured, better-auth uses storeStateStrategy 'database', which also sets
 * a signed `state` cookie, and the OAuth callback hard-requires that cookie to
 * match (state.ts, guarded by account.skipStateCookieCheck, which is off).
 * Initiating from the webview puts that cookie in the webview's jar while the
 * callback lands in the system browser, so every native sign-in died at
 * /api/auth/error?error=state_mismatch before reaching the app.
 *
 * Doing it here means the redirect and its Set-Cookie are both delivered to
 * the system browser, so state matches on the way back. asResponse hands the
 * whole Response through untouched, headers included: rebuilding it by hand is
 * how the cookie would get dropped again.
 */
export const nativeAuthRoute = new Hono();

const PROVIDER_PATTERN = /^[a-z]+$/;

/** Always hand failures back over the custom scheme. Anything else strands the
 *  app on a system-browser sheet that will not close by itself. */
function errorRedirect(c: Context, reason: string) {
  return c.redirect(`${NATIVE_SCHEME}://auth?error=${encodeURIComponent(reason)}`, 302);
}

nativeAuthRoute.get('/native/sign-in/:provider', async (c) => {
  const provider = c.req.param('provider');
  if (!PROVIDER_PATTERN.test(provider)) {
    return c.json({ error: 'Unknown provider' }, 400);
  }

  let res: Response;
  try {
    res = await auth.api.signInSocial({
      body: {
        provider,
        callbackURL: '/native-callback',
        // Failures must come back to a page that can tell the app, otherwise
        // the app sits on a browser sheet that never closes.
        errorCallbackURL: '/native-callback',
      },
      headers: c.req.raw.headers,
      asResponse: true,
    });
  } catch {
    return errorRedirect(c, `${provider} sign-in is not available`);
  }

  // asResponse turns an APIError into a Response rather than throwing, so an
  // unconfigured provider arrives here as a 404 body, not in the catch above.
  // Returning it unchanged left the browser sheet parked on a JSON error with
  // no way back into the app.
  if (res.status < 300 || res.status >= 400) {
    return errorRedirect(c, `${provider} sign-in is not available`);
  }
  return res;
});
