import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { authClient } from '@/auth/auth-client';
import {
  listenForNativeAuthCallback,
  signInWithSocial,
  type SocialProvider,
} from '@/auth/social-sign-in';
import { TurnstileWidget, type TurnstileWidgetHandle } from '@/ui/auth/turnstile-widget';
import { DevLoginPanel } from '@/ui/auth/dev-login-panel';
import { SocialButtons } from '@/ui/auth/social-buttons';
import {
  AuthLayout,
  BrandHeader,
  LegalFootnote,
  inputClass,
  primaryButtonClass,
} from '@/ui/auth/auth-layout';

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string;

type Mode = 'signin' | 'signup';

export function safeCallbackPath(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('/')) return null;
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function LoginScreen() {
  const location = useLocation();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);

  // RequireAuth supplies this state for deep links. Keep the callback same-origin
  // even if this screen is reached with manually supplied router state or after
  // an expired session has redirected the browser to /login?next=….
  const statePath = (location.state as { from?: unknown } | null)?.from;
  const requestedPath = typeof statePath === 'string'
    ? statePath
    : new URLSearchParams(location.search).get('next');
  const callbackURL = safeCallbackPath(requestedPath) ?? '/home';

  // Only sign-up is captcha'd: see the captcha endpoints in server/src/auth.ts.
  const needsCaptcha = mode === 'signup';

  // Native social sign-in finishes asynchronously, when the OS hands back the
  // deep link, so the result arrives here rather than from the click handler.
  useEffect(() => {
    let dispose: (() => void) | undefined;
    void listenForNativeAuthCallback(
      () => { window.location.assign(callbackURL); },
      (message) => { setError(message); setLoading(false); },
    ).then((cleanup) => { dispose = cleanup; });
    return () => { dispose?.(); };
  }, [callbackURL]);

  function resetCaptcha() {
    setCaptchaToken(null);
    turnstileRef.current?.reset();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = mode === 'signup'
        ? await authClient.signUp.email({
            email,
            password,
            name: name.trim() || email.split('@')[0],
            callbackURL,
            fetchOptions: { headers: { 'x-captcha-response': captchaToken! } },
          })
        : await authClient.signIn.email({ email, password });

      if (res.error) {
        setError(res.error.message ?? 'Something went wrong');
        if (needsCaptcha) resetCaptcha();
        return;
      }
      navigate(callbackURL, { replace: true });
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
      if (needsCaptcha) resetCaptcha();
    } finally {
      setLoading(false);
    }
  }

  async function handleSocial(provider: SocialProvider) {
    setLoading(true);
    setError(null);
    try {
      // On web this navigates away and never resolves meaningfully; on native
      // it returns once the system browser is open and the deep-link listener
      // above takes it from there.
      await signInWithSocial(provider, callbackURL);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start sign-in');
      setLoading(false);
    }
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setPassword('');
    resetCaptcha();
  }

  const submitLabel = mode === 'signup' ? 'Create account' : 'Sign in';

  return (
    <AuthLayout>
      <form onSubmit={handleSubmit} className="w-full space-y-6">
        <BrandHeader />
        <div className="space-y-4">
          {mode === 'signup' && (
            <div className="space-y-1">
              <label htmlFor="name" className="text-sm text-zinc-400">Name</label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Optional"
                autoComplete="name"
                className={inputClass}
              />
            </div>
          )}

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
              aria-describedby={error ? 'login-error' : undefined}
              className={inputClass}
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-baseline justify-between">
              <label htmlFor="password" className="text-sm text-zinc-400">Password</label>
              {mode === 'signin' && (
                <Link to="/forgot-password" className="text-xs text-zinc-500 hover:text-amber-400 underline">
                  Forgot password?
                </Link>
              )}
            </div>
            <input
              id="password"
              type="password"
              required
              minLength={mode === 'signup' ? 8 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'signup' ? 'At least 8 characters' : '••••••••'}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              className={inputClass}
            />
          </div>

          {needsCaptcha && (
            <TurnstileWidget
              ref={turnstileRef}
              siteKey={TURNSTILE_SITE_KEY}
              onToken={setCaptchaToken}
              onExpire={() => setCaptchaToken(null)}
              onError={() => setCaptchaToken(null)}
            />
          )}

          {error && <p id="login-error" role="alert" className="text-red-400 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading || (needsCaptcha && !captchaToken)}
            className={primaryButtonClass}
          >
            {loading ? 'Working…' : submitLabel}
          </button>

          <SocialButtons
            onSelect={handleSocial}
            disabled={loading}
            verb={mode === 'signup' ? 'Sign up' : 'Sign in'}
          />

          <p className="text-center text-sm text-zinc-500">
            {mode === 'signin' ? (
              <>
                No account yet?{' '}
                <button type="button" onClick={() => switchMode('signup')} className="text-amber-400 hover:text-amber-300 underline">
                  Create one
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button type="button" onClick={() => switchMode('signin')} className="text-amber-400 hover:text-amber-300 underline">
                  Sign in
                </button>
              </>
            )}
          </p>
        </div>
        <LegalFootnote />
      </form>
      {import.meta.env.DEV && <DevLoginPanel />}
    </AuthLayout>
  );
}
