# Changelog

All notable changes to DynoRun. Dates are ISO, newest first.

## Unreleased

### Hands-free motorcycle capture (headline change)

A rider cannot touch the phone mid-pull, so both halves of the workflow now have
a hands-free variant: start it while stopped, put the phone in a pocket, ride,
come to a stop. Nothing needs a tap while moving.

- **Hands-free calibration.** New capture mode in the calibration wizard
  (`CalibrationSessionController` + `src/analysis/plateau-detection.ts`): record
  the whole ride, then find every steady-speed hold in it afterwards and let the
  rider pick the one that was their deliberate attempt. Each candidate shows its
  mean speed, how long it was held, the spread, and the rollout it would imply.
  A qualifying hold is announced out loud as it happens (`Steady at 90`), so the
  rider knows it registered without looking. The wizard defaults to this mode
  when the vehicle is a motorcycle and to the on-screen mode otherwise.
- **Nothing is captured mid-ride, by design.** The interactive wizard latches on
  the FIRST steady window it sees, which on any real ride is the cruise out to
  the test road in the wrong gear. Deferring the choice to a review screen is
  what makes hands-free capture safe: a wrong-gear plateau becomes one more row
  to ignore rather than a silently wrong calibration.
- **Sessions and calibration recordings finish themselves.** `StandstillDetector`
  ends a recording after roughly 20 s stopped, so detection has already run by
  the time the phone comes back out. It arms only once the vehicle has actually
  moved, so a recording started in the garage cannot end itself while the rider
  puts their gloves on. Riding on cancels the countdown, which is spoken once.
- The hold-to-finish button stays, for finishing immediately rather than waiting.
- Vehicle detail now leads with **Hands-free** for a motorcycle and with **New
  run** for a car, and the help drawer documents the mode.

### Fixed

- **A stationary start captured a calibration of 0 km/h.** Standing still is
  perfectly stable, so tapping "Start measurement" while parked satisfied the
  5 s stability window at 0 km/h, latched the wizard to `stable`, and stopped
  listening. The POST then failed with a 400, because the server rejects
  `speed_kmh <= 0`. `StabilityWindow.min_speed_kmh` (10 km/h) now floors the
  capture, and the panel says "too slow to calibrate" instead of showing a
  progress bar that fills and then sits there.
- **A hands-free recording could never end if the sensor went silent.** Every
  way a session ended was driven by an arriving sample, including the
  30-minute runaway cap, so a revoked permission or a webview suspended after a
  denied wake lock left it recording forever with a button press as the only
  escape. `SensorWatchdog` is a wall-clock backstop that closes the recording
  with what it has and says why.
- **GPS errors were published and never read.** Both speed sources exposed an
  `errors$` subject that nothing subscribed to, so a dead fix was
  indistinguishable from a quiet ride. The two incompatible payload shapes are
  now one `SensorError`, `SpeedSource` declares the channel, and both hands-free
  screens surface it as a banner that persists (not a toast, which the rider
  would never see from a pocket).
- **Plateau detection could have been fooled by a GPS gap.** `resample`
  interpolates straight through a dropout with no gap ceiling, and
  `performance.now()` keeps advancing while the app is suspended, so a
  suspend/resume would have fabricated a zero-spread plateau that outscored
  every real hold. Rejected now by a raw-coverage floor plus a max-gap check;
  the rate floor alone is blind to any hole shorter than half the window.
  Steadiness is measured on raw samples, never on the smoothed trace, which
  irons real jitter flat.

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

### Fixed after independent review

Two subagent reviews (security and correctness) were run against the auth
change before release. They found that native sign-in could not have worked:

- **Native OAuth died before reaching the app.** With a database configured
  better-auth also sets a signed `state` cookie and the callback requires it.
  Starting the flow from the webview put that cookie in the wrong browser, so
  every attempt ended on `?error=state_mismatch`. The flow now starts server
  side, in the system browser, via `GET /api/native/sign-in/:provider`.
- **`apiFetch` never sent the bearer token,** so even a successful native
  sign-in 401'd on every data request and bounced back to the login screen in a
  loop. Now covered by a test that fails without the fix.
- **The sign-in rate limit was bypassable two ways,** both confirmed against
  production: the API was listening on a public port with no firewall (skipping
  nginx, and better-auth skips rate limiting entirely when it cannot determine
  an IP), and nginx appended to a client-supplied `X-Forwarded-For` whose
  leftmost value better-auth trusts. The API now binds to loopback and nginx
  overwrites the header. Measured: 14 unthrottled attempts before, 429 at the
  11th after.
- **Shared deep links broke social sign-in.** better-auth rejects a
  `callbackURL` containing a colon, which `/grip/compare` links contain. The
  destination now travels in `sessionStorage` instead.
- Password reset now revokes existing sessions, OAuth tokens are encrypted at
  rest, a failed reset email no longer reports success, a blocked social link
  explains itself instead of showing an unbranded error page, and the sign-in
  button no longer sticks on "Working…" after a browser Back.

Remaining known limitation, documented in `docs/native-build-setup.md`: the
native callback uses a custom URL scheme, which is not an exclusive claim, so
App Links and Universal Links are required before either app ships to a store.

### Data protection and operations

- **Fixed: account deletion and export skipped grip sessions.** `grip_sessions`
  is the fifth table keyed by `user_id` and was missing from both, so deleting
  an account left multi-MB GPS traces orphaned in the database and the data
  export answered access requests incompletely. A test now derives the
  user-scoped table list from the schema, so a newly added table cannot be
  forgotten in the same way.
- **Added nightly database backups** with verified restore, 14 day retention.
  There were none before this release.

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
