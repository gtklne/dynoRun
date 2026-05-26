import { useState } from 'react';
import { authClient } from '@/auth/auth-client';
import { BrandLogo } from '@/ui/components/brand-logo';

function BrandHeader() {
  return (
    <div className="flex flex-col items-center text-center space-y-2">
      <BrandLogo size={56} />
      <h1 className="text-3xl font-bold text-zinc-100">DynoRun</h1>
      <p className="text-zinc-500 text-sm">Your phone is a dyno.</p>
    </div>
  );
}

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
        <div className="w-full max-w-sm space-y-6 text-center">
          <BrandHeader />
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-zinc-100">Check your email</h2>
            <p className="text-zinc-400 text-sm">
              We sent a sign-in link to <strong className="text-zinc-200">{email}</strong>.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-zinc-950">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-6">
        <BrandHeader />
        <div className="space-y-4">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:border-amber-500 focus:outline-none transition-colors"
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-amber-500 hover:bg-amber-400 active:bg-amber-600 px-4 py-2 text-zinc-950 font-semibold disabled:opacity-50 disabled:hover:bg-amber-500 transition-colors"
          >
            {loading ? 'Sending…' : 'Send magic link'}
          </button>
        </div>
      </form>
    </div>
  );
}
