/**
 * Human wording for the OAuth failures better-auth signals with a code in the
 * error callback URL. Without this the user lands on better-auth's own
 * unbranded /api/auth/error page with a bare code and no way back.
 */
const MESSAGES: Record<string, string> = {
  account_not_linked:
    'That email already has a DynoRun account with a password. Sign in with your password below, or reset it if you have forgotten it.',
  state_mismatch:
    'The sign-in took too long or was opened in a different browser. Please try again.',
  access_denied: 'You cancelled the sign-in before it finished.',
  state_security_mismatch:
    'The sign-in could not be verified. Please try again.',
};

export function describeAuthError(code: string | null): string | null {
  if (!code) return null;
  return MESSAGES[code] ?? 'Sign-in did not complete. Please try again.';
}
