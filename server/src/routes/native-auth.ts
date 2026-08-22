import { Hono } from 'hono';
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

nativeAuthRoute.get('/native/sign-in/:provider', async (c) => {
  const provider = c.req.param('provider');
  if (!PROVIDER_PATTERN.test(provider)) {
    return c.json({ error: 'Unknown provider' }, 400);
  }

  try {
    return await auth.api.signInSocial({
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
    // A provider with no credentials configured throws PROVIDER_NOT_FOUND.
    // Bounce to the callback page so the app is told, rather than leaving the
    // browser sheet open on a JSON error body.
    const reason = encodeURIComponent(`${provider} sign-in is not available`);
    return c.redirect(`${NATIVE_SCHEME}://auth?error=${reason}`, 302);
  }
});
