import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { authClient } from '@/auth/auth-client';
import { BrandLogo } from '@/ui/components/brand-logo';
import { TurnstileWidget, type TurnstileWidgetHandle } from '@/ui/auth/turnstile-widget';

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string;

function BrandHeader() {
  return (
    <div className="flex flex-col items-center text-center space-y-2">
      <BrandLogo size={56} />
      <h1 className="text-3xl font-bold text-zinc-100">DynoRun</h1>
      <p className="text-zinc-500 text-sm">Your phone is a dyno.</p>
    </div>
  );
}

function LegalFootnote() {
  return (
    <p className="text-center text-xs text-zinc-500">
      By continuing you agree to our{' '}
      <Link to="/privacy" className="text-zinc-400 hover:text-amber-400 underline">
        Privacy Policy
      </Link>
      . <Link to="/imprint" className="text-zinc-400 hover:text-amber-400 underline">Imprint</Link>
    </p>
  );
}

// Desktop-only hero panel for the split login layout. Hidden below lg so the
// mobile screen stays the bare centered max-w-sm column.
function BrandPanel() {
  return (
    <div className="hidden lg:flex lg:flex-col lg:items-start lg:justify-center lg:gap-6 lg:bg-zinc-900 lg:border-r lg:border-zinc-800 lg:p-16">
      <BrandLogo size={96} />
      <div className="space-y-3">
        <h2 className="text-4xl font-bold tracking-tight text-zinc-100">
          Your phone is a dyno.
        </h2>
        <p className="max-w-md text-base leading-relaxed text-zinc-400">
          Measure wheel power and torque from a single GPS pull. No rollers, no
          straps — just one gear and an open road.
        </p>
      </div>
    </div>
  );
}

export function LoginScreen() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await authClient.signIn.magicLink({
      email,
      // Post-verify landing must be inside the app's base ('/dynorun/' on web,
      // '/' on native), not the suite homescreen at the domain root.
      callbackURL: import.meta.env.BASE_URL,
      fetchOptions: { headers: { 'x-captcha-response': captchaToken! } },
    });
    setLoading(false);
    if (res.error) {
      setError(res.error.message ?? 'Something went wrong');
      setCaptchaToken(null);
      turnstileRef.current?.reset();
    } else {
      setSent(true);
    }
  }

  if (sent) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 bg-zinc-950 lg:grid lg:grid-cols-2 lg:items-stretch lg:p-0">
        <BrandPanel />
        <div className="contents lg:flex lg:items-center lg:justify-center lg:p-4">
          <div className="w-full max-w-sm space-y-6 text-center">
            <BrandHeader />
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-zinc-100">Check your email</h2>
              <p className="text-zinc-400 text-sm">
                We sent a sign-in link to <strong className="text-zinc-200">{email}</strong>.
              </p>
            </div>
            <LegalFootnote />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-zinc-950 lg:grid lg:grid-cols-2 lg:items-stretch lg:p-0">
      <BrandPanel />
      <div className="contents lg:flex lg:items-center lg:justify-center lg:p-4">
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
            <TurnstileWidget
              ref={turnstileRef}
              siteKey={TURNSTILE_SITE_KEY}
              onToken={setCaptchaToken}
              onExpire={() => setCaptchaToken(null)}
              onError={() => setCaptchaToken(null)}
            />
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading || !captchaToken}
              className="w-full rounded-lg bg-amber-500 hover:bg-amber-400 active:bg-amber-600 px-4 py-2 text-zinc-950 font-semibold disabled:opacity-50 disabled:hover:bg-amber-500 transition-colors"
            >
              {loading ? 'Sending…' : 'Send magic link'}
            </button>
          </div>
          <LegalFootnote />
        </form>
      </div>
    </div>
  );
}
