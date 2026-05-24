import { useState } from 'react';
import { authClient } from '@/auth/auth-client';

export function LoginScreen() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await authClient.signIn.magicLink({ email, callbackURL: '/' });
    setLoading(false);
    if (res.error) {
      setError(res.error.message ?? 'Something went wrong');
    } else {
      setSent(true);
    }
  }

  if (sent) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 bg-zinc-950">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-2xl font-bold text-zinc-100 mb-2">Check your email</h1>
          <p className="text-zinc-400">We sent a sign-in link to <strong className="text-zinc-200">{email}</strong>.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-zinc-950">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <h1 className="text-3xl font-bold text-zinc-100">DynoRun</h1>
        <p className="text-zinc-400">Enter your email to sign in.</p>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:border-zinc-700 focus:outline-none transition-colors"
        />
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-blue-600 px-4 py-2 text-zinc-100 font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 transition-colors"
        >
          {loading ? 'Sending…' : 'Send magic link'}
        </button>
      </form>
    </div>
  );
}
