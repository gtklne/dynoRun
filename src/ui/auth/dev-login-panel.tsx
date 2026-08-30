import { useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL ?? '';
const DEFAULT_EMAIL = (import.meta.env.VITE_DEV_LOGIN_EMAIL as string | undefined) ?? '';

/**
 * Dev-only sign-in shortcut. Posts to the server's DEV_LOGIN bypass, which mints
 * a session cookie for any email without needing a password. Rendered only under
 * `import.meta.env.DEV`, so Vite strips it entirely from the production bundle.
 * It can never ship to prod, and the backing route isn't mounted there either.
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
          ? 'Dev login is off. Set DEV_LOGIN=true in server/.env and restart the API'
          : `Dev login failed (${res.status})`;
        setError(msg);
        setLoading(false);
        return;
      }
      // Full reload so AuthProvider re-reads the freshly set session cookie.
      window.location.assign(import.meta.env.BASE_URL);
    } catch {
      setError('Could not reach the API. Is `npm run dev` running in server/?');
      setLoading(false);
    }
  }

  return (
    <section
      className="box px-3 py-3"
      aria-label="Dev sign-in"
      style={{ borderColor: 'var(--color-caution)', background: 'var(--color-caution-plane)' }}
    >
      <p className="t-annotation" style={{ color: 'var(--color-caution)' }}>
        Dev sign-in (no email)
      </p>
      <div className="mt-2 flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="dev@example.com"
          aria-label="Dev sign-in email"
          className="field min-w-0 flex-1"
        />
        <button
          type="button"
          onClick={devLogin}
          disabled={loading || !email.trim()}
          className="ctl shrink-0"
        >
          {loading ? 'Working' : 'Go'}
        </button>
      </div>
      {error && (
        <p className="t-annotation mt-2" style={{ color: 'var(--color-caution)' }}>{error}</p>
      )}
    </section>
  );
}
