import { useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL ?? '';
const DEFAULT_EMAIL = (import.meta.env.VITE_DEV_LOGIN_EMAIL as string | undefined) ?? '';

/**
 * Dev-only sign-in shortcut. Posts to the server's DEV_LOGIN bypass, which mints
 * a session cookie without the magic-link email + captcha. Rendered only under
 * `import.meta.env.DEV`, so Vite strips it entirely from the production bundle —
 * it can never ship to prod, and the backing route isn't mounted there either.
 */
export function DevLoginPanel() {
  const [email, setEmail] = useState(DEFAULT_EMAIL);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function devLogin() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/dev/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) {
        const msg = res.status === 404
          ? 'Dev login is off — set DEV_LOGIN=true in server/.env and restart the API'
          : `Dev login failed (${res.status})`;
        setError(msg);
        setLoading(false);
        return;
      }
      // Full reload so AuthProvider re-reads the freshly set session cookie.
      window.location.assign(import.meta.env.BASE_URL);
    } catch {
      setError('Could not reach the API — is `npm run dev` running in server/?');
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm space-y-3 rounded-lg border border-dashed border-amber-700/50 bg-amber-950/20 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-500/80">
        Dev sign-in (no email)
      </p>
      <div className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="dev@example.com"
          className="min-w-0 flex-1 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 placeholder-zinc-600 focus:border-amber-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={devLogin}
          disabled={loading || !email.trim()}
          className="shrink-0 rounded-md bg-amber-600 px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-amber-500 active:bg-amber-700 disabled:opacity-50"
        >
          {loading ? '…' : 'Sign in'}
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
