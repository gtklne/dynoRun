import { useEffect, useState } from 'react';
import { NATIVE_CALLBACK_URL } from '@/auth/social-sign-in';
import { BrandLogo } from '@/ui/components/brand-logo';

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

/**
 * The last web page of a native social sign-in, and the only one that runs in
 * the *system browser* rather than in the app.
 *
 * OAuth has just completed, so this origin holds the session cookie. The
 * Capacitor webview cannot read that cookie, so this page converts it into a
 * one-time token and hands it to the app over the custom URL scheme. The token
 * is single-use and short-lived, which is what makes it safe to put in a URL
 * that the OS logs and routes.
 *
 * Reached only from a native OAuth round trip. On a desktop browser it just
 * fails to leave, which is why it says so rather than spinning forever.
 */
export function NativeCallbackScreen() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function handoff() {
      try {
        const res = await fetch(`${API_BASE}/api/auth/one-time-token/generate`, {
          credentials: 'include',
        });
        if (!res.ok) throw new Error(`Handoff failed (${res.status})`);
        const { token } = (await res.json()) as { token?: string };
        if (!token) throw new Error('No token was issued');
        if (cancelled) return;
        window.location.replace(`${NATIVE_CALLBACK_URL}?token=${encodeURIComponent(token)}`);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Sign-in could not be completed';
        setError(message);
        // Tell the app rather than stranding it on a browser sheet that will
        // never close by itself.
        window.location.replace(`${NATIVE_CALLBACK_URL}?error=${encodeURIComponent(message)}`);
      }
    }

    void handoff();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-950 p-6 text-center">
      <BrandLogo size={48} />
      {error ? (
        <>
          <p className="text-sm text-red-400">{error}</p>
          <p className="text-xs text-zinc-500">You can close this window and try again in the app.</p>
        </>
      ) : (
        <>
          <p className="text-sm text-zinc-300">Signing you in…</p>
          <p className="text-xs text-zinc-500">Returning you to the DynoRun app.</p>
        </>
      )}
    </div>
  );
}
