import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authClient } from '@/auth/auth-client';
import {
  AuthLayout,
  BrandHeader,
  LegalFootnote,
  inputClass,
  primaryButtonClass,
} from '@/ui/auth/auth-layout';

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
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
      setTimeout(() => navigate('/login', { replace: true }), 1500);
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  if (linkError || !token) {
    return (
      <AuthLayout>
        <div className="w-full space-y-6 text-center">
          <BrandHeader title="Link expired" subtitle="Password reset" />
          <p className="text-zinc-400 text-sm">
            This reset link is no longer valid. Reset links can only be used once and expire after
            an hour.
          </p>
          <Link to="/forgot-password" className="inline-block text-sm text-amber-400 hover:text-amber-300 underline">
            Request a new link
          </Link>
        </div>
      </AuthLayout>
    );
  }

  if (done) {
    return (
      <AuthLayout>
        <div className="w-full space-y-6 text-center">
          <BrandHeader title="Password changed" subtitle="You can sign in now." />
          <Link to="/login" className="inline-block text-sm text-amber-400 hover:text-amber-300 underline">
            Continue to sign in
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <form onSubmit={handleSubmit} className="w-full space-y-6">
        <BrandHeader title="Choose a password" subtitle="Pick something new." />
        <div className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="password" className="text-sm text-zinc-400">New password</label>
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
          </div>
          <div className="space-y-1">
            <label htmlFor="confirm" className="text-sm text-zinc-400">Repeat password</label>
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
          </div>
          {error && <p id="reset-error" role="alert" className="text-red-400 text-sm">{error}</p>}
          <button type="submit" disabled={loading} className={primaryButtonClass}>
            {loading ? 'Saving…' : 'Set new password'}
          </button>
        </div>
        <LegalFootnote />
      </form>
    </AuthLayout>
  );
}
