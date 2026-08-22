import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { takePostLoginPath } from '@/auth/social-sign-in';
import { safeCallbackPath } from '@/auth/callback-path';

/**
 * Where a web social sign-in lands, purely to restore the destination.
 *
 * better-auth rejects a callbackURL containing a colon or a comma, which real
 * shared links here do contain (`/grip/compare?...&laps=a:3`), so the provider
 * is always sent this constant path and the actual destination travels in
 * sessionStorage instead. See stashPostLoginPath.
 */
export function ContinueScreen() {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  useEffect(() => {
    const stashed = takePostLoginPath();
    // better-auth sends failures here too (errorCallbackURL), rather than to
    // its own unbranded error page with a bare code and no way back.
    const failure = params.get('error');
    if (failure) {
      navigate(`/login?error=${encodeURIComponent(failure)}`, { replace: true });
      return;
    }
    // Re-validate rather than trusting sessionStorage, which another script on
    // this origin could have written.
    navigate(safeCallbackPath(stashed) ?? '/home', { replace: true });
  }, [navigate, params]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-6">
      <p className="text-sm text-zinc-400">Signing you in…</p>
    </div>
  );
}
