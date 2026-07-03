# DynoRun

GPS-based virtual dyno. User drives in a single gear; the phone records GPS speed; the app derives a wheel-power-vs-RPM curve from `F=ma`. Web app + iOS/Android (Capacitor). Lives at https://wasgoht.ch.

**Workflow rule:** commit and push after every implementation.

## Commands

Frontend (project root):

| Command | Description |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | `tsc -b && vite build` → `dist/` (gets deployed) |
| `npm test` | Vitest run (jsdom) |
| `npm run test:watch` | Vitest watch |
| `npm run typecheck` | `tsc -b` only |
| `npm run cap:sync` | Build + `npx cap sync` (copies `dist/` into iOS/Android projects) |
| `npm run cap:run:ios` / `cap:run:android` | Sync + run on device/sim |

Server (`cd server`):

| Command | Description |
|---|---|
| `npm run dev` | `tsx watch src/index.ts` (Hono API on `:3000`) |
| `npm run build` | `tsc --outDir dist` |
| `npm run db:push` | `drizzle-kit push` against `$DATABASE_URL` |

## Architecture

```
src/
  analysis/      Pure-function dyno pipeline (RawSpeedSample[] → power curve)
  run/           RunController + CalibrationController + their state machines
  sensors/       SpeedSource abstraction (GPS-web, GPS-native, recorded, mock) + SensorRecorder
  api/           apiFetch client + per-table repository implementations (server-backed)
  app/           Platform glue: wake lock, geolocation permission, export, isNative()
  auth/          better-auth React client + AuthProvider context
  shared/        Types, units (km/h ↔ m/s, RPM ↔ ω), observable Subject, haversine, UUID, ISO time
  ui/            Screens (garage, calibration wizard, run, recordings, compare, settings) + chart components
server/src/
  schema.ts      Drizzle schema — source of truth for Postgres (vehicles, calibrations, runs, samples, recordings, derived_curves)
  index.ts       Hono app, CORS, mounts /api/* routes + better-auth /api/auth/**
  auth.ts        better-auth config (magic-link via Resend + Cloudflare Turnstile captcha → /etc/dynorun.env)
  routes/        vehicles, calibrations, runs, samples, curves, recordings
  middleware/    requireAuth: validates session, sets c.var.userId
  lib/           runBelongsToUser ownership check
  db.ts          pg Pool + drizzle instance
seed/init-auth-tables.sql  One-time setup for better-auth tables (NOT drizzle-managed)
tests/           Vitest suites mirror src/ layout
docs/            native-build-setup.md, superpowers/ (plans & specs)
android/, ios/   Capacitor native projects (checked in; build artifacts gitignored)
```

## Domain model

**Calibration captures a gear ratio without knowing tire size or transmission ratios.** User drives at a known RPM (e.g. "4th gear, 3000 RPM") and the GPS measures the resulting steady-state speed. Server computes:

```
rollout_m_per_rev = (speed_kmh / 3.6) / (rpm / 60)
```

This single number bundles tire circumference × gear ratio × final drive. From it, `rpm = (speed_mps / rollout) × 60` at any time during a run.

**Run analysis** (`src/analysis/pipeline.ts`, `PIPELINE_VERSION = 1` in `types.ts`) — pure functions composed:

1. `trimToAccelPhase` — keep only samples up to peak speed (coast-down would yield negative power and pollute RPM bins)
2. `resample` — interpolate to a uniform 100 ms grid
3. `smoothSavitzkyGolay` — window=11 (odd, ≥3)
4. `differentiate` — central difference → `accel_ms2`
5. `powerAndTorque` — `F = m·a`, `P = F·v`, `τ = P / ω`. Drops samples where `speed ≤ 0`.
6. `binByRpm` — 100 RPM bins, average power/torque per bin

Output is **wheel power**. No driveline-loss or aero/rolling-resistance corrections — this is a comparative measurement, not a calibrated absolute. **If you change the math, bump `PIPELINE_VERSION` so stored `derived_curves` rows can be invalidated.**

## State machines

`src/run/run-state-machine.ts` and `calibration-state-machine.ts` are pure reducers; the controllers (`run-controller.ts`, `calibration-controller.ts`) own side effects (sensor subscription, repo writes, recorder lifecycle).

```
Run:         idle → ready → running → analyzing → reviewing → saved | aborted
Calibration: idle → measuring → stable → confirmed
```

Both controllers expose `warmup()` (sensor running, live samples flow to UI, **no DB writes**) and `start()` (promotes to recording). The `LiveRunScreen` calls `warmup()` on mount and gates the `Start run` button on GPS accuracy ≤ 10 m sustained ≥ 2 s (`REQUIRED_GOOD_MS`); shows a "poor GPS" warning after 15 s and allows a manual override.

**Auto-stop:** `AutoStopDetector` requires at least one positive-acceleration sample, then triggers `finishRun` once a 1 s rolling window shows non-positive Δspeed (`zero_accel_window_ms = 1000`).

**Calibration stability:** `CalibrationStabilityDetector` requires ±1 km/h over a 5 s window (`DEFAULT_STABILITY_WINDOW`).

## Routes

Frontend (`src/App.tsx`, react-router-dom 6, all behind `RequireAuth` except `/login`):

| Path | Screen |
|---|---|
| `/login` | Magic-link sign-in (Resend) |
| `/` | Garage (vehicle list) |
| `/vehicles/:id` | Detail + calibrations + run history |
| `/vehicles/:vehicleId/calibrations/new` | 3-step wizard: gear → measure → confirm |
| `/vehicles/:vehicleId/calibrations/:calibrationId/run` | Live run (warmup + record + auto-stop) |
| `/vehicles/:vehicleId/calibrations/:calibrationId/session` | Hands-free session (motorcycle): record whole ride, auto-detect pulls, save selected as runs |
| `/runs/:runId/review` | Curve + peak + notes + save/discard |
| `/vehicles/:vehicleId/compare` | Overlay multiple runs' curves |
| `/recordings` | List/manage raw sensor recordings |
| `/replay` | Upload JSON fixture, run pipeline offline |
| `/settings` | Load replay recording, view permissions |
| `/admin` | Admin panel (admins only): user/content KPIs, growth & activity charts, users table, recent runs, leaderboard, system health |

API (Hono, all `/api/*` require session cookie):

| Method | Path | Purpose |
|---|---|---|
| CRUD | `/api/vehicles[/:id]` | Vehicles |
| GET, POST | `/api/vehicles/:vehicleId/calibrations` | Calibrations per vehicle |
| GET, DELETE | `/api/calibrations/:id` | Single calibration |
| GET | `/api/vehicles/:vehicleId/runs` | Runs per vehicle |
| POST, GET, PATCH, DELETE | `/api/runs[/:id]` | Run lifecycle |
| POST, GET | `/api/runs/:id/samples` | Bulk insert / list raw samples |
| GET, PUT | `/api/runs/:id/curve` | Upsert derived RPM-bin curve |
| CRUD | `/api/recordings[/:id]` | Raw sensor recordings (jsonb) |
| GET | `/api/admin/{overview,timeseries,users,activity}` | Admin stats (requireAdmin) |
| ALL | `/api/auth/**` | Delegated to better-auth |

`requireAuth` middleware sets `c.var.userId`; every query filters by it. Run-scoped routes use `runBelongsToUser` for ownership.

**Admin access:** `user.role` column (added via `init-auth-tables.sql`, NOT drizzle-managed) defaults to `'user'`. `requireAdmin` re-reads the role from the DB per request and answers **404** (not 403) to non-admins so the route surface stays invisible. The role is declared as a better-auth additional field with `input: false`, so no auth API call can ever set it — grant admin only via manual SQL: `UPDATE "user" SET role = 'admin' WHERE email = '...'`. The frontend `RequireAdmin` wrapper and nav links keyed on `useAuth().isAdmin` are cosmetic only.

## Conventions

- **TypeScript strict** + `noUnusedLocals`/`noUnusedParameters` everywhere. Path alias `@/* → src/*` in `vite.config.ts`, `vitest.config.ts`, `tsconfig.json`.
- **Repository pattern**: UI/controllers depend on `I*Repository` interfaces (`src/api/repositories/types.ts`), implementations in sibling files call `apiFetch`.
- **Observable**: tiny in-house `Subject<T>` (`src/shared/observable.ts`) — no RxJS.
- **Sensor abstraction**: `SpeedSource` is swappable. `speed-source-factory.ts` picks `RecordedSpeedSource` if a replay is active, else `CapacitorGpsSpeedSource` on native, else browser `GpsSpeedSource`. UI consumes via `SpeedSourceContext`, which makes test injection trivial.
- **Recordings**: `SensorRecorder` (`src/sensors/recording.ts`) captures GPS + DeviceMotion in a versioned (`version: 1`) JSON envelope. Stored as Postgres `jsonb` AND held in memory (`replay-state.ts`) so a just-finished run can be downloaded or re-used for replay.
- **No comments restating code.** Only document the *why* (subtle invariants, workarounds, hidden constraints).

## Gotchas

- **`samples.t_ms` and `recordings.duration_ms` are integer columns** but the client computes them from `performance.now()`, which carries sub-ms float drift (e.g. `9197.000000000002`). Server `Math.round`s defensively in `routes/samples.ts` and `routes/recordings.ts`. Symptom of skipping this: a single malformed sample rejects the whole batch and strands the run in `analyzing` forever.
- **`crypto.randomUUID()` requires a secure context** (HTTPS or localhost). `src/shared/uuid.ts` falls back to `crypto.getRandomValues` so plain-HTTP environments don't crash.
- **better-auth tables (`user`, `session`, `account`, `verification`) are NOT in `schema.ts`.** They're created once via `server/seed/init-auth-tables.sql`. `drizzle.config.ts` has a `tablesFilter` allowlist precisely to prevent `drizzle-kit push` from dropping them.
- **CI fail-fast for destructive migrations:** `drizzle-kit push` sometimes exits 0 even when it bailed on a data-loss prompt. The deploy workflow greps its output for `"Error:|data-loss|cannot be reverted|Interactive prompts"` and fails the job. To rename or drop a column: apply manually via `docker exec postgres psql -U dynorun -d dynorun` first, then push the schema change.
- **iOS native speed can be -1** (unknown). `CapacitorGpsSpeedSource` and `GpsSpeedSource` both treat null/-1/0 as unavailable and fall back to haversine distance between consecutive fixes.
- **`PIPELINE_VERSION` is stored on every `derived_curves` row.** Bump it when the math changes so stale curves can be detected/recomputed (no migration runs automatically).
- **`samples.t_ms` is relative to `performance.now()` at sensor start**, not wall-clock — so it resets each session. Use `runs.started_at` for absolute time.
- **Turnstile captcha gates every magic-link request** (`server/src/auth.ts`, `captcha({ endpoints: ['/sign-in/magic-link'] })`) — since there's no separate sign-up flow, returning users solve a captcha on every sign-in too, not just new-account creation. If `TURNSTILE_SECRET_KEY` is unset server-side, every sign-in silently fails.
- **`@capacitor-community/sqlite` is in `package.json` but unused** — leftover from a pre-Postgres local-first architecture. Safe to remove if you want to slim the install (would also drop `sql.js`, `localforage`, `jeep-sqlite` transitive deps). Not removed yet because no functional impact.
- **`crypto.randomUUID` is used in `server/routes/*.ts`** assuming Node 18+; build env pins Node 22.
- **Frontend builds on Node 20, server builds on Node 22** in CI (`.github/workflows/deploy.yml`). Don't unify without checking — they're separate jobs.
- **The `samples` repository's `deleteByRun` is a no-op** (`src/api/repositories/sample-repository.ts`). Real cascade happens server-side in `DELETE /api/runs/:id` via a transaction. Don't add it to the API client without removing the server-side cascade.

## Production server (Hetzner)

- hcloud context: `swiss-event` (already active)
- Server name: `dynorun-prod` (Hetzner Cloud, `cax11` ARM, Debian 12, Falkenstein)
- Public IPv4: `138.199.154.225`
- SSH key (local): `~/.ssh/dynorun_deploy` (matches Hetzner key `dynorun-deploy`)
- SSH as root: `ssh -i ~/.ssh/dynorun_deploy root@138.199.154.225`
- SSH as deploy: `ssh -i ~/.ssh/dynorun_deploy deploy@138.199.154.225`
- List/inspect server: `hcloud server list` / `hcloud server describe dynorun-prod`

### Deployment layout

- Web root: `/var/www/dynorun` (owned by `deploy:deploy`) — static SPA build (`index.html` + `assets/`)
- Web server: nginx (`/etc/nginx/sites-enabled/dynorun`), HTTPS on port 443, SPA fallback to `/index.html`, `/api/` proxied to `:3000`
- API service: `dynorun-api` systemd unit, Node.js Hono server at `/opt/dynorun-api/`, reads `/etc/dynorun.env`
- Database: PostgreSQL 16 in Docker (`docker exec postgres psql -U dynorun -d dynorun`), data at `/var/lib/pg-data`
- Deploy user: `deploy` (`/home/deploy`), used to rsync built frontend into `/var/www/dynorun`
- **Deploy = `git push origin main`** → GitHub Actions builds frontend + API, rsyncs both to server, runs `drizzle-kit push` against Postgres to apply schema changes, then restarts `dynorun-api`.

### Database migrations

- Source of truth: `server/src/schema.ts` (drizzle-orm).
- On every deploy, the workflow rsyncs `schema.ts` + `drizzle.config.ts` to the server and runs `npx drizzle-kit push` as root (so it can source `/etc/dynorun.env`). Additive changes (new tables, new columns, new indexes) apply automatically. Destructive changes (drop column, rename) require `--force` and will fail in CI — apply those manually first via `docker exec postgres psql -U dynorun -d dynorun`.
- To preview migrations locally: `cd server && DATABASE_URL=... npx drizzle-kit push --verbose` (read-only with `--dry-run` is not supported by drizzle-kit; use a scratch DB if you want to test).

### Public URL & TLS

- App lives at **https://wasgoht.ch** (apex). `www.wasgoht.ch`, any plain-HTTP URL, and bare-IP HTTP all 301 to the apex.
- TLS: Let's Encrypt cert covering `wasgoht.ch` + `www.wasgoht.ch`, renewed automatically by `certbot.timer` (runs twice daily).
- DNS: managed in Hetzner DNS (`dns.hetzner.com`), zone `wasgoht.ch`, A records for `@` and `www` → `138.199.154.225`.
- nginx config: `/etc/nginx/sites-enabled/dynorun` (3 server blocks: HTTP→HTTPS catch-all, HTTPS www→apex, HTTPS apex serving the SPA + `/api/` proxy to `localhost:3000`). Backup of pre-rewrite config: `/root/dynorun.nginx.bak`.
- Secure Context APIs (`crypto.randomUUID`, `crypto.subtle`, Service Workers, Geolocation on mobile) now work since the origin is HTTPS.

### Native (iOS / Android)

See `docs/native-build-setup.md`. TL;DR: `npm run cap:sync` after web changes, then `cap:run:ios` / `cap:run:android` or open in Xcode / Android Studio.
