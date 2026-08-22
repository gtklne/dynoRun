import { authClient } from './auth-client';
import { isNative } from '@/app/platform';

export const SOCIAL_PROVIDERS = ['google', 'apple', 'discord'] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];

export const SOCIAL_PROVIDER_LABELS: Record<SocialProvider, string> = {
  google: 'Google',
  apple: 'Apple',
  discord: 'Discord',
};

/** Must match NATIVE_SCHEME in server/src/auth.ts, the iOS CFBundleURLSchemes
 *  entry, and the Android intent-filter. */
export const NATIVE_SCHEME = 'com.dynorun.app';
export const NATIVE_CALLBACK_URL = `${NATIVE_SCHEME}://auth`;

/** Where the API (and therefore the web app) lives. Native builds are served
 *  from the webview's own origin, so they cannot use a relative callback. */
const API_ORIGIN = (import.meta.env.VITE_API_URL as string | undefined) || window.location.origin;

/**
 * On web this navigates away and never returns. On native it opens the system
 * browser and returns immediately: sign-in completes later, when the OS hands
 * the app back the `com.dynorun.app://auth?token=` deep link that
 * `listenForNativeAuthCallback` is waiting on.
 */
export async function signInWithSocial(
  provider: SocialProvider,
  callbackPath: string,
): Promise<void> {
  if (!isNative()) {
    const res = await authClient.signIn.social({ provider, callbackURL: callbackPath });
    if (res.error) throw new Error(res.error.message ?? `Could not sign in with ${provider}`);
    return;
  }

  // disableRedirect makes better-auth return the provider's authorize URL
  // instead of 302ing, because the webview must hand that URL to the system
  // browser rather than follow it itself.
  const res = await authClient.signIn.social({
    provider,
    callbackURL: `${API_ORIGIN}/native-callback`,
    disableRedirect: true,
  });
  if (res.error) throw new Error(res.error.message ?? `Could not sign in with ${provider}`);
  const url = res.data?.url;
  if (!url) throw new Error('The sign-in provider did not return a URL');

  const { Browser } = await import('@capacitor/browser');
  await Browser.open({ url });
}

/**
 * Registers the deep-link handler that finishes a native social sign-in.
 * Returns a cleanup function. No-op on web.
 *
 * The system browser holds the session cookie once OAuth completes, and that
 * cookie is unreachable from the webview, so /native-callback mints a one-time
 * token and redirects here with it. Verifying that token issues a session whose
 * bearer form the app can store.
 */
export async function listenForNativeAuthCallback(
  onSignedIn: () => void,
  onError: (message: string) => void,
): Promise<() => void> {
  if (!isNative()) return () => {};

  const [{ App }, { Browser }] = await Promise.all([
    import('@capacitor/app'),
    import('@capacitor/browser'),
  ]);

  const handle = await App.addListener('appUrlOpen', async ({ url }) => {
    if (!url.startsWith(NATIVE_CALLBACK_URL)) return;
    // A custom scheme is not a hierarchical URL everywhere, so read the query
    // off the raw string rather than trusting URL() to populate searchParams.
    const query = url.includes('?') ? url.slice(url.indexOf('?') + 1) : '';
    const params = new URLSearchParams(query);
    const token = params.get('token');
    const failure = params.get('error');

    await Browser.close().catch(() => {
      // Already dismissed by the OS on some Android versions.
    });

    if (failure || !token) {
      onError(failure ?? 'Sign-in was cancelled before it completed.');
      return;
    }

    const res = await authClient.oneTimeToken.verify({ token });
    if (res.error || !res.data) {
      onError(res.error?.message ?? 'That sign-in link had already been used.');
      return;
    }
    onSignedIn();
  });

  return () => {
    void handle.remove();
  };
}
