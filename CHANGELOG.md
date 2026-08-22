# Changelog

All notable changes to DynoRun. Dates are ISO, newest first.

## 1.0.0 - 2026-08-22

First tagged release. DynoRun has been live at https://wasgoht.ch for some
months; this marks the point where the web and native version numbers were
aligned and the release process was written down.

### Authentication (this release's headline change)

- **Replaced magic-link sign-in with email and password.** Magic links were one
  better-auth plugin, not the library, so the swap needed no change of auth
  stack. Resend now sends exactly one kind of mail, the password reset.
- **Added social sign-in for Google, Apple and Discord.** Each provider
  registers only when its credential pair is present in the environment, and
  `GET /api/auth-providers` publishes the live list so the login screen renders
  exactly the buttons that work. A button for an unprovisioned provider would
  otherwise dead-end on an opaque OAuth error.
- **Added password reset** (`/forgot-password`, `/reset-password`) and open
  self-service sign-up. Email verification is deliberately off: gating first
  sign-in on a clicked link would reinstate the round trip magic links were
  dropped to avoid.
- **Moved the captcha off the sign-in path.** Turnstile now gates only
  `/sign-up/email` and `/request-password-reset`, the two endpoints that create
  an account or send mail to an attacker-chosen address. Credential stuffing is
  covered by explicit rate limits instead (10 sign-ins, 5 sign-ups, 3 reset
  requests per minute).
- **Added native OAuth for the iOS and Android builds.** Providers refuse to
  render consent screens in an embedded webview, so sign-in runs in the system
  browser, where the resulting session cookie is unreachable from the app. A
  `/native-callback` page converts that cookie into a single-use token and hands
  it to the app over the `com.dynorun.app://` scheme; the app exchanges it for a
  bearer token. `requireAuth` is unchanged.
- Deleted four dormant accounts that held no data, leaving the single admin.

### Existing feature set at 1.0.0

- **Virtual dyno.** Drive one gear, the phone's GPS records speed, and the
  pipeline derives a wheel power and torque curve from `F=ma`. Calibration
  captures a gear ratio as a single rollout figure without needing tyre size or
  transmission ratios.
- **Hands-free session mode** for motorcycles: record a whole ride, auto-detect
  the pulls, save the ones worth keeping.
- **Grip Utilization.** Upload a RaceBox track CSV and get a traction envelope,
  per-corner scores against your own best at the same turn, load-transfer
  transients and lap playback. All headline numbers are absolute scores, not
  ratios, so they compare across laps, sessions, bikes and riders.
- **Lap compare.** Up to six laps on a shared spatial axis: where the time went
  and why, with per-turn payoff verdicts, segment splits and a theoretical best.
- **Replay Lab** for re-running the pipeline offline against recorded sensor data.
- **Admin panel** with role-gated KPIs, growth charts and system health.
- **Legal and privacy**: imprint, privacy policy, cookie notice, account export
  and account deletion.
- **Prerendered landing page** at `/hello` that ships zero JavaScript.
