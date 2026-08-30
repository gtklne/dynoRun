import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { authClient } from '@/auth/auth-client';
import { useAuth } from '@/auth/auth-context';
import {
  listenForNativeAuthCallback,
  signInWithSocial,
  type SocialProvider,
} from '@/auth/social-sign-in';
import { TurnstileWidget, type TurnstileWidgetHandle } from '@/ui/auth/turnstile-widget';
import { DevLoginPanel } from '@/ui/auth/dev-login-panel';
import { SocialButtons } from '@/ui/auth/social-buttons';
import { safeCallbackPath } from '@/auth/callback-path';
import { describeAuthError } from '@/auth/auth-errors';
import {
  AuthLayout,
  BrandHeader,
  LegalFootnote,
  inputClass,
  primaryButtonClass,
} from '@/ui/auth/auth-layout';
import { PlateField } from '@/ui/plate';

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string;

type Mode = 'signin' | 'signup';

export function LoginScreen() {
  const location = useLocation();
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    () => describeAuthError(new URLSearchParams(window.location.search).get('error')),
  );
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
    let cancelled = false;
    let dispose: (() => void) | undefined;
    listenForNativeAuthCallback(
      () => { window.location.assign(callbackURL); },
      (message) => { setError(message); setLoading(false); },
    ).then((cleanup) => {
      // The listener registration awaits two dynamic imports. Without the
      // cancelled check, an unmount before they resolve (StrictMode's double
      // invoke in dev does exactly this) leaves dispose undefined at cleanup
      // and the listener leaks. Leaked listeners then race on the single-use
      // token and an error overwrites a successful sign-in.
      if (cancelled) { cleanup(); return; }
      dispose = cleanup;
    }).catch(() => {
      if (!cancelled) setError('Sign-in is unavailable on this device.');
    });
    return () => { cancelled = true; dispose?.(); };
  }, [callbackURL]);

  // A social sign-in navigates away, so nothing here clears `loading`. Coming
  // back (browser Back, or dismissing the native browser sheet) restores this
  // component with loading stuck true and every control disabled until a manual
  // reload. pageshow covers the bfcache restore, which does not re-run effects.
  useEffect(() => {
    const revive = () => setLoading(false);
    window.addEventListener('pageshow', revive);
    return () => window.removeEventListener('pageshow', revive);
  }, []);

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
            // No callbackURL: with no verification email configured better-auth
            // ignores it, and it is rejected outright when the destination
            // contains a colon, which shared compare links do.
            fetchOptions: { headers: { 'x-captcha-response': captchaToken! } },
          })
        : await authClient.signIn.email({ email, password });

      if (res.error) {
        setError(res.error.message ?? 'Something went wrong');
        if (needsCaptcha) resetCaptcha();
        return;
      }
      // AuthProvider reads the session once on mount, so it still holds
      // `user === null` here. Navigating first makes RequireAuth bounce us
      // straight back to this screen, which looks like the sign-in silently
      // failed even though it succeeded.
      await refresh();
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
    setLoading(false);
    setPassword('');
    resetCaptcha();
  }

  const submitLabel = mode === 'signup' ? 'Create account' : 'Sign in';

  return (
    <AuthLayout>
      {/* No subtitle: "Account access" under "Sign in" and "New account" under
          "Create account" both restated the title directly above them. The
          reset and hand-off screens keep theirs, because those say something
          the title does not. */}
      <BrandHeader title={mode === 'signup' ? 'Create account' : 'Sign in'} />

      <form onSubmit={handleSubmit} className="box-frame flex flex-col gap-4 px-4 py-4 sm:px-5 sm:py-5">
        {mode === 'signup' && (
          <PlateField label="Name" id="name" hint="Optional">
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Optional"
              autoComplete="name"
              className={inputClass}
            />
          </PlateField>
        )}

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
            aria-describedby={error ? 'login-error' : undefined}
            className={inputClass}
          />
        </PlateField>

        <div>
          <PlateField label="Password" id="password">
            <input
              id="password"
              type="password"
              required
              minLength={mode === 'signup' ? 8 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'signup' ? 'At least 8 characters' : 'Your password'}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              className={inputClass}
            />
          </PlateField>
          {mode === 'signin' && (
            <p className="mt-1.5 text-right">
              <Link to="/forgot-password" className="t-annotation no-underline hover:underline">
                Forgot password?
              </Link>
            </p>
          )}
        </div>

        {needsCaptcha && (
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
        )}

        {error && (
          <p id="login-error" role="alert" className="t-body m-0 text-[0.8125rem] leading-6" style={{ color: 'var(--color-caution)' }}>
            {error}
          </p>
        )}

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

        <p className="rule-t t-annotation pt-3 text-center">
          {mode === 'signin' ? (
            <>
              No account yet?{' '}
              <button
                type="button"
                onClick={() => switchMode('signup')}
                className="underline"
                style={{ color: 'var(--color-ink)' }}
              >
                Create one
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => switchMode('signin')}
                className="underline"
                style={{ color: 'var(--color-ink)' }}
              >
                Sign in
              </button>
            </>
          )}
        </p>
      </form>

      <LegalFootnote />
      {import.meta.env.DEV && <DevLoginPanel />}
    </AuthLayout>
  );
}
