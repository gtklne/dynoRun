import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { captcha, bearer, oneTimeToken } from 'better-auth/plugins';
import { Resend } from 'resend';
import { pool } from './db.js';

const resend = new Resend(process.env.RESEND_API_KEY);

/** Custom URL scheme the native builds register, so an OAuth round trip that
 *  happens in the system browser can hand control back to the app. Must match
 *  the iOS CFBundleURLSchemes entry and the Android intent-filter. */
export const NATIVE_SCHEME = 'com.dynorun.app';

/** A Capacitor webview is its own origin, so the native builds are cross-origin
 *  to this API even though the web app is same-origin behind nginx. iOS serves
 *  from capacitor://localhost; Android from https://localhost because
 *  capacitor.config.ts sets androidScheme: 'https'.
 *
 *  Plain `http://localhost` is deliberately absent. It is a browser-reachable
 *  origin, so allowing it with credentials: true would let anything serving on
 *  a user's own machine make credentialed calls to production and read the
 *  replies. The other two entries are not reachable from a browser. */
export const NATIVE_ORIGINS = [
  'capacitor://localhost',
  'https://localhost',
  `${NATIVE_SCHEME}://`,
];

/**
 * Only providers whose credentials are actually configured get registered.
 * A provider registered with an undefined clientId still renders a button and
 * still accepts /sign-in/social, it just fails at the OAuth redirect with an
 * opaque error, so a half-provisioned provider (Apple takes days to set up)
 * would look shipped and be broken. GET /api/auth-providers reports what this
 * returns, and the login screen renders exactly those buttons.
 */
type SocialProviders = NonNullable<BetterAuthOptions['socialProviders']>;

function configuredSocialProviders(): SocialProviders {
  // Typed as SocialProviders rather than a loose Record so a misspelt provider
  // key or option is a compile error instead of a silently ignored block.
  const providers: SocialProviders = {};

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    providers.google = {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    };
  }

  if (process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET) {
    providers.apple = {
      clientId: process.env.APPLE_CLIENT_ID,
      clientSecret: process.env.APPLE_CLIENT_SECRET,
      // Lets Apple ID tokens minted by the native iOS app (audience = the app
      // bundle id, not the web Services ID) validate against the same provider.
      appBundleIdentifier: process.env.APPLE_APP_BUNDLE_IDENTIFIER,
    };
  }

  if (process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET) {
    providers.discord = {
      clientId: process.env.DISCORD_CLIENT_ID,
      clientSecret: process.env.DISCORD_CLIENT_SECRET,
    };
  }

  return providers;
}

const socialProviders = configuredSocialProviders();
export const enabledSocialProviders = Object.keys(socialProviders);

export const auth = betterAuth({
  database: pool,
  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL: process.env.APP_URL!,
  trustedOrigins: [process.env.APP_URL!, ...NATIVE_ORIGINS],
  user: {
    additionalFields: {
      // input: false, role can never be set through any auth API call;
      // it is granted only by a manual UPDATE on the user table.
      role: { type: 'string', defaultValue: 'user', input: false },
    },
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    // Deliberately off: gating first sign-in on a clicked email link would
    // reintroduce exactly the magic-link round trip this replaced. Turnstile on
    // /sign-up/email is what keeps bots out, not the inbox.
    requireEmailVerification: false,
    // The usual reason to reset a password is that the account is compromised.
    // Without this, the attacker's existing session survives the reset.
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      const { error } = await resend.emails.send({
        from: `DynoRun <${process.env.FROM_EMAIL}>`,
        to: user.email,
        subject: 'Reset your DynoRun password',
        html: `<p>Click the link below to choose a new password. It expires in 1 hour.</p><p><a href="${url}">Reset your password</a></p><p>If you did not ask for this, ignore this email and your password stays unchanged.</p>`,
      });
      // The Resend SDK resolves with {data, error} rather than throwing, so an
      // unverified sender, a bad key or a suppressed address would otherwise be
      // discarded silently while the endpoint still answered 200 and the UI
      // still said the link was on its way. This is the only mail we send.
      if (error) {
        console.error('[auth] reset password email failed:', error);
        throw new Error('Could not send the reset email');
      }
    },
  },
  socialProviders,
  account: {
    // OAuth access/refresh/id tokens are written to the account table. Off by
    // default, which means a database compromise hands over usable provider
    // tokens alongside the rows.
    encryptOAuthTokens: true,
  },
  advanced: {
    ipAddress: {
      // nginx overwrites X-Forwarded-For with $remote_addr (it used to append
      // to the client's own value, which made every IP-keyed rate limit
      // spoofable), and the API binds to 127.0.0.1 so nothing can reach it
      // without passing through nginx first. Both halves are load-bearing:
      // better-auth reads the LEFTMOST element of this header, and skips rate
      // limiting entirely when it cannot determine an IP.
      ipAddressHeaders: ['x-forwarded-for'],
    },
  },
  rateLimit: {
    // better-auth only enables rate limiting in production by default; turning
    // it on unconditionally means the limits are exercised in dev too, rather
    // than first meeting real traffic in prod.
    enabled: true,
    customRules: {
      // Password sign-in carries no captcha (see above), so this is the only
      // thing standing between a stolen credential list and the login form.
      '/sign-in/email': { window: 60, max: 10 },
      '/sign-up/email': { window: 60, max: 5 },
      '/request-password-reset': { window: 60, max: 3 },
      '/reset-password': { window: 60, max: 5 },
    },
  },
  plugins: [
    captcha({
      provider: 'cloudflare-turnstile',
      secretKey: process.env.TURNSTILE_SECRET_KEY!,
      // Only the two endpoints that create something: an account, or an email
      // to an attacker-chosen address. /sign-in/email is deliberately absent,
      // because a captcha on every sign-in is the friction that made magic
      // links unbearable; the rateLimit rule below covers credential stuffing.
      // /sign-in/social needs none either: the provider does its own bot
      // defence, and a challenge there would gate every Google button press.
      // /request-password-reset, not /forget-password: better-auth 1.6 removed
      // the old name, and a captcha rule naming a path that no longer exists
      // silently protects nothing while looking configured.
      endpoints: ['/sign-up/email', '/request-password-reset'],
    }),
    // Cookies set during an OAuth round trip land in the *system browser*, not
    // in the Capacitor webview, so native sign-in cannot be cookie-based. The
    // app trades a one-time token for a session token and sends it as a bearer.
    oneTimeToken(),
    bearer(),
  ],
});
