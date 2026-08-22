import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { authClient } from '@/auth/auth-client';
import { TurnstileWidget, type TurnstileWidgetHandle } from '@/ui/auth/turnstile-widget';
import {
  AuthLayout,
  BrandHeader,
  LegalFootnote,
  inputClass,
  primaryButtonClass,
} from '@/ui/auth/auth-layout';

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string;

export function ForgotPasswordScreen() {
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
    try {
      const res = await authClient.requestPasswordReset({
        email,
        // better-auth mails a link to its own /reset-password/:token endpoint,
        // which validates the token and then redirects here with ?token=.
        redirectTo: '/reset-password',
        fetchOptions: { headers: { 'x-captcha-response': captchaToken! } },
      });
      if (res.error) {
        setError(res.error.message ?? 'Something went wrong');
        setCaptchaToken(null);
        turnstileRef.current?.reset();
        return;
      }
      setSent(true);
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
      setCaptchaToken(null);
      turnstileRef.current?.reset();
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <AuthLayout>
        <div className="w-full space-y-6 text-center">
          <BrandHeader title="Check your email" subtitle="Password reset" />
          <p className="text-zinc-400 text-sm">
            If an account exists for <strong className="text-zinc-200">{email}</strong>, a reset
            link is on its way. It expires in 1 hour.
          </p>
          <Link to="/login" className="inline-block text-sm text-amber-400 hover:text-amber-300 underline">
            Back to sign in
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <form onSubmit={handleSubmit} className="w-full space-y-6">
        <BrandHeader title="Reset password" subtitle="We will email you a link." />
        <div className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="email" className="text-sm text-zinc-400">Email address</label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'forgot-error' : undefined}
              className={inputClass}
            />
          </div>
          <TurnstileWidget
            ref={turnstileRef}
            siteKey={TURNSTILE_SITE_KEY}
            onToken={setCaptchaToken}
            onExpire={() => setCaptchaToken(null)}
            onError={() => setCaptchaToken(null)}
          />
          {error && <p id="forgot-error" role="alert" className="text-red-400 text-sm">{error}</p>}
          <button type="submit" disabled={loading || !captchaToken} className={primaryButtonClass}>
            {loading ? 'Sending…' : 'Send reset link'}
          </button>
          <p className="text-center text-sm text-zinc-500">
            <Link to="/login" className="text-amber-400 hover:text-amber-300 underline">Back to sign in</Link>
          </p>
        </div>
        <LegalFootnote />
      </form>
    </AuthLayout>
  );
}
