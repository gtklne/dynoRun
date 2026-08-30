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
import { PlateField } from '@/ui/plate';

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
        <BrandHeader title="Check your email" subtitle="Password reset" />
        <div className="box-frame px-4 py-4 sm:px-5 sm:py-5">
          <p className="t-body m-0">
            If an account exists for{' '}
            <strong className="t-data" style={{ fontWeight: 700 }}>{email}</strong>, a reset
            link is on its way. It expires in 1 hour.
          </p>
          <p className="mt-4">
            <Link to="/login" className="ctl no-underline">Back to sign in</Link>
          </p>
        </div>
        <LegalFootnote />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <BrandHeader title="Reset password" subtitle="We will email you a link" />
      <form onSubmit={handleSubmit} className="box-frame flex flex-col gap-4 px-4 py-4 sm:px-5 sm:py-5">
        <PlateField label="Email address" id="email">
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
        </PlateField>
        <TurnstileWidget
          ref={turnstileRef}
          siteKey={TURNSTILE_SITE_KEY}
          onToken={setCaptchaToken}
          onExpire={() => setCaptchaToken(null)}
          onError={(reason) => {
            setCaptchaToken(null);
            if (reason === 'load') {
              setError('The anti-bot check could not load. Disable your ad blocker for this page, or try another network.');
            }
          }}
        />
        {error && (
          <p id="forgot-error" role="alert" className="t-body m-0 text-[0.8125rem] leading-6" style={{ color: 'var(--color-caution)' }}>
            {error}
          </p>
        )}
        <button type="submit" disabled={loading || !captchaToken} className={primaryButtonClass}>
          {loading ? 'Sending…' : 'Send reset link'}
        </button>
        <p className="rule-t t-annotation pt-3 text-center">
          <Link to="/login" className="underline" style={{ color: 'var(--color-ink)' }}>Back to sign in</Link>
        </p>
      </form>
      <LegalFootnote />
    </AuthLayout>
  );
}
