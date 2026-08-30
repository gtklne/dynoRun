import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authClient } from '@/auth/auth-client';
import {
  AuthLayout,
  BrandHeader,
  LegalFootnote,
  inputClass,
  primaryButtonClass,
} from '@/ui/auth/auth-layout';
import { PlateField } from '@/ui/plate';

const MIN_PASSWORD_LENGTH = 8;

export function ResetPasswordScreen() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token');
  // better-auth redirects here with ?error=INVALID_TOKEN when the emailed link
  // has expired or was already used, rather than passing a token through.
  const linkError = params.get('error');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Without this the timer still fires after the user has clicked through
  // themselves, replacing whatever they navigated to 1.5 s later.
  useEffect(() => () => {
    if (redirectTimer.current) clearTimeout(redirectTimer.current);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    // Narrowing, not a runtime guard: the !token case already rendered the
    // expired-link screen below, so this form does not exist without a token.
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await authClient.resetPassword({ newPassword: password, token });
      if (res.error) {
        setError(res.error.message ?? 'Could not reset the password');
        return;
      }
      setDone(true);
      // The reset does not sign you in, so send them to sign in with the new
      // password rather than leaving them on a dead-end success screen.
      redirectTimer.current = setTimeout(() => navigate('/login', { replace: true }), 1500);
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  if (linkError || !token) {
    return (
      <AuthLayout>
        <BrandHeader title="Link expired" subtitle="Password reset" />
        <div className="box-frame px-4 py-4 sm:px-5 sm:py-5">
          <p className="t-body m-0">
            This reset link is no longer valid. Reset links can only be used once and expire after
            an hour.
          </p>
          <p className="mt-4">
            <Link to="/forgot-password" className="ctl no-underline">Request a new link</Link>
          </p>
        </div>
        <LegalFootnote />
      </AuthLayout>
    );
  }

  if (done) {
    return (
      <AuthLayout>
        <BrandHeader title="Password changed" subtitle="You can sign in now" />
        <div className="box-frame px-4 py-4 sm:px-5 sm:py-5">
          <p className="t-body m-0">
            Your password has been changed. Signing in with it is the next step.
          </p>
          <p className="mt-4">
            <Link to="/login" className="ctl ctl-solid no-underline">Continue to sign in</Link>
          </p>
        </div>
        <LegalFootnote />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <BrandHeader title="Choose a password" subtitle="Password reset" />
      <form onSubmit={handleSubmit} className="box-frame flex flex-col gap-4 px-4 py-4 sm:px-5 sm:py-5">
        <PlateField label="New password" id="password" hint={`At least ${MIN_PASSWORD_LENGTH} characters`}>
          <input
            id="password"
            type="password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
            autoComplete="new-password"
            className={inputClass}
          />
        </PlateField>
        <PlateField label="Repeat password" id="confirm">
          <input
            id="confirm"
            type="password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'reset-error' : undefined}
            className={inputClass}
          />
        </PlateField>
        {error && (
          <p id="reset-error" role="alert" className="t-body m-0 text-[0.8125rem] leading-6" style={{ color: 'var(--color-caution)' }}>
            {error}
          </p>
        )}
        <button type="submit" disabled={loading} className={primaryButtonClass}>
          {loading ? 'Saving…' : 'Set new password'}
        </button>
      </form>
      <LegalFootnote />
    </AuthLayout>
  );
}
