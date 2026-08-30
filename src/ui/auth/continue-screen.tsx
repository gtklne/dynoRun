import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { takePostLoginPath } from '@/auth/social-sign-in';
import { safeCallbackPath } from '@/auth/callback-path';
import { AuthLayout, BrandHeader } from '@/ui/auth/auth-layout';

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
    <AuthLayout>
      <BrandHeader title="Signing you in" subtitle="Returning from your provider" />
      <div className="box-frame px-4 py-4 sm:px-5 sm:py-5">
        <p className="t-body m-0" role="status">
          Restoring the page you asked for.
        </p>
      </div>
    </AuthLayout>
  );
}
