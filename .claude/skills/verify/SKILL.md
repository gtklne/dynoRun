---
name: verify
description: Runtime-verify DynoRun changes by driving the real app (Vite + API + prod-DB tunnel) with Playwright and mocked GPS.
---

# Verifying DynoRun end-to-end

## Boot the stack

1. Tunnel (skip if already up): `ssh -N -L 5433:localhost:5432 dynorun-prod` (background).
2. API: `cd server && npm run dev` (its dev.sh checks the tunnel; listens on :3000).
3. Frontend: `npm run dev` (Vite :5173, proxies `/api` → :3000, so cookies are same-origin).

⚠️ Local dev hits the **live prod Postgres**. Create disposable entities (a `TEST …` vehicle) and delete them after, `DELETE /api/vehicles/:id` cascades runs, samples, curves, calibrations, and recordings.

## Auth

Sign-in is email + password, so a test can just log in. Two ways, cheapest first:

1. **Dev bypass, no password needed.** Set `DEV_LOGIN=true` in `server/.env` and
   `POST /api/dev/login {email}`; the response sets a real session cookie.
   Mounted only when that flag is set, so it does not exist in prod.
2. **A real sign-in**, when the thing under test is the login flow itself:
   `POST /api/auth/sign-in/email {email, password}`. No captcha on this endpoint
   (Turnstile only gates `/sign-up/email` and `/request-password-reset`), so it
   works headless. It is rate limited to 10/min per IP.

Grab the `set-cookie` from either and hand it to `context.addCookies`. Only
`/sign-up/email` and `/request-password-reset` need a Turnstile solve, and for
those use Cloudflare's always-passes test keys rather than driving the widget.

Hand-minting a `session` row is no longer necessary and is the wrong reflex now.

## Driving GPS-dependent screens

Playwright lives in the npx cache (`~/.npm/_npx/*/node_modules/playwright`), not in the project.
Override geolocation with `context.addInitScript`, replace
`navigator.geolocation.watchPosition/clearWatch/getCurrentPosition` with a 1 Hz
scripted emitter of `{coords: {latitude, longitude, accuracy: 4, altitude, heading, speed}, timestamp}`.
Native `coords.speed` is consumed directly; accuracy ≤ 10 for ≥ 2 s unlocks the start buttons.
Set the session cookie via `context.addCookies` for `http://localhost:5173`.

Gotchas seen in practice:
- Headless Chromium **denies Wake Lock**: anything that `await`s `WakeLock.acquire()` un-guarded dies.
- Hold-to-press buttons: `mouse.down()` → `waitForTimeout` → `mouse.up()`; a plain `.click()` is the negative probe.
- Calibrations can be created via API (`POST /api/vehicles/:id/calibrations {gear_label, rpm, speed_kmh, notes}`) to skip the GPS wizard.
