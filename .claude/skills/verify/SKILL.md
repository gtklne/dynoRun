---
name: verify
description: Runtime-verify DynoRun changes by driving the real app (Vite + API + prod-DB tunnel) with Playwright and mocked GPS.
---

# Verifying DynoRun end-to-end

## Boot the stack

1. Tunnel (skip if already up): `ssh -N -L 5433:localhost:5432 dynorun-prod` (background).
2. API: `cd server && npm run dev` (its dev.sh checks the tunnel; listens on :3000).
3. Frontend: `npm run dev` (Vite :5173, proxies `/api` → :3000, so cookies are same-origin).

⚠️ Local dev hits the **live prod Postgres**. Create disposable entities (a `TEST …` vehicle) and delete them after — `DELETE /api/vehicles/:id` cascades runs, samples, curves, calibrations, and recordings.

## Auth without email

Magic-link login always sends real mail via Resend. Instead mint a session:
insert a row into `session` (columns: id, "expiresAt", token, "createdAt",
"updatedAt", "ipAddress", "userAgent", "userId") and sign the token with
better-auth's own helper so the format can't drift:

```js
const { serializeSignedCookie } = await import('<repo>/server/node_modules/better-call/dist/cookies.mjs');
const setCookie = await serializeSignedCookie('better-auth.session_token', token, env.BETTER_AUTH_SECRET, {});
// cookie value = setCookie.split(';')[0] after the first '='
```

`DATABASE_URL` + `BETTER_AUTH_SECRET` come from `server/.env`. Delete the session row when done.

## Driving GPS-dependent screens

Playwright lives in the npx cache (`~/.npm/_npx/*/node_modules/playwright`), not in the project.
Override geolocation with `context.addInitScript` — replace
`navigator.geolocation.watchPosition/clearWatch/getCurrentPosition` with a 1 Hz
scripted emitter of `{coords: {latitude, longitude, accuracy: 4, altitude, heading, speed}, timestamp}`.
Native `coords.speed` is consumed directly; accuracy ≤ 10 for ≥ 2 s unlocks the start buttons.
Set the session cookie via `context.addCookies` for `http://localhost:5173`.

Gotchas seen in practice:
- Headless Chromium **denies Wake Lock** — anything that `await`s `WakeLock.acquire()` un-guarded dies.
- Hold-to-press buttons: `mouse.down()` → `waitForTimeout` → `mouse.up()`; a plain `.click()` is the negative probe.
- Calibrations can be created via API (`POST /api/vehicles/:id/calibrations {gear_label, rpm, speed_kmh, notes}`) to skip the GPS wizard.
