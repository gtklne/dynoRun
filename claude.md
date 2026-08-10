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
  analysis/grip/ Pure-function grip pipeline (RaceBox CSV → envelope, corners, load transfer)
                 + turns.ts/turn-cluster.ts: stable track turn ids across a session's laps
                 + align.ts/compare.ts/compare-stats.ts: spatial lap comparison
  run/           RunController + CalibrationController + their state machines
  sensors/       SpeedSource abstraction (GPS-web, GPS-native, recorded, mock) + SensorRecorder
  api/           apiFetch client + per-table repository implementations (server-backed)
  app/           Platform glue: wake lock, geolocation permission, export, isNative()
  auth/          better-auth React client + AuthProvider context
  shared/        Types, units (km/h ↔ m/s, RPM ↔ ω), observable Subject, haversine, UUID, ISO time
  ui/            Screens (garage, calibration wizard, run, recordings, compare, grip, settings) + chart components
  prerender/     landing-document.tsx: renders LandingScreen to a script-free HTML document
scripts/         prerender-landing.mjs: post-build step writing dist/landing.html
server/src/
  schema.ts      Drizzle schema — source of truth for Postgres (vehicles, calibrations, runs, samples, recordings, derived_curves, grip_sessions)
  index.ts       Hono app, CORS, mounts /api/* routes + better-auth /api/auth/**
  auth.ts        better-auth config (magic-link via Resend + Cloudflare Turnstile captcha → /etc/dynorun.env)
  routes/        vehicles, calibrations, runs, samples, curves, recordings, grip-sessions
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

**Grip Utilization** (`src/analysis/grip/`) is the second tool in the suite: upload a RaceBox track-session CSV (25 Hz GPS + lean), and pure functions derive g-force channels (long g = speed derivative + fixed aero-drag/rolling-resistance correction so it reads *tire demand*, not net decel — generic race bike CdA 0.40 m²/260 kg by design, no per-bike tuning; the uncorrected `alongRaw` drives only the weight-transfer readout; lat g from `tan(lean)` — empirically ≈ GPS lateral g within 3%, RaceBox exports effective lean), detect corners per lap (speed minima confirmed by lean, windows clipped at the midpoint between adjacent apexes so no sample belongs to two corners), and compute load-transfer transients (`|dG/dt|`). **All headline metrics are absolute scores, not ratios: score = measured g demand × 100 (100 ≈ 1 g), comparable across laps/sessions/bikes/riders.** The per-rider **traction envelope** (per angular bin, timed laps only, max-preserving smoothing) is descriptive only — traction-circle boundary + session score (100 × RMS envelope radius) — never a divisor. Its per-bin statistic is a **minimum drop count, not a percentile**: the boundary must be exceeded by `DROP_MIN = 12` samples (0.48 s at 25 Hz, capped at a quarter of a sparse bin) before it moves, because a percentile could not do the job — most angular bins hold under 100 samples, so "p99" was literally the bin max, and one artifact smeared over ~10 samples by the smoothing moved `sessionScore` by 4+ points and `gref` from 1.27 to 2.25 g. Samples are also excluded from the fit above 2.5 g combined *or* 1.4 g longitudinal (a speed step, not a tyre). `fitSamples === 0` means there is no envelope, not a 0 g one — the UI must print "—", never a number. **The session score grows ~+8 points from lap count alone** (1 → 10 laps of identical riding), so it is only comparable at equal lap budget: `equalBudgetEnvelope` does that for compare, and the analyzer header prints the lap count beside it. Colour ramps are anchored to a tyre-class g setting (`anchorG`); corner cards compare each corner against the rider's best **at the same track turn** across laps (`spareScore` flag). Deliberate consequence of the 2026-07 audit: a p90-percentile-of-all-samples "utilization %" guaranteed >100% readings and hid slow days; scores don't. Only the parsed base channels are persisted (`grip_sessions.data` jsonb envelope, `GRIP_DATA_VERSION = 1` in `types.ts`, pack/unpack in `storage.ts`); every derived channel is recomputed client-side on load, so tuning never invalidates stored sessions. Tunable estimates live in `settings.ts` (`GRIP_SETTINGS_SCHEMA` is the single source of truth for defaults/bounds/UI); tuned values persist per session via debounced PATCH. Screens in `src/ui/grip/`: `/grip` session library + CSV dropzone, `/grip/sessions/:id` analyzer (track map, traction circle, load timeline, corner cards, lap playback — plain canvas 2D, no chart lib; the static layers are cached offscreen via `useStaticLayer` because playback otherwise repainted ~3,900 paths per frame for a cursor dot).

**Track turn identity** (`turns.ts`) — `GripCorner.n` is the order a corner was detected *within its own lap*, and detection is unstable: ten laps of one circuit yield 6 to 9 corners. So `analyzeGripSession` assigns `GripCorner.turn`, a **track** id stable across every lap: the session's fastest lap becomes a spatial axis (the same `align.ts` construction compare uses), every lap's apexes are projected onto it, and apexes at the same distance are one turn, numbered in track order. Verified to reproduce the compare screen's turn numbering exactly on both fixtures (7 and 11 turns, zero mismatches) — the two screens must never disagree about what T4 is. A detection no supporting cluster claims keeps `turn = 0` ("Extra bend") so numbering never shifts. `turn-cluster.ts` holds the linkage both callers share. Before this, the "best at this corner" reference was keyed on `n`, which on the local fixture made the spare flag wrong on **10 of 74 corner cards, by up to 30 points against a 10-point threshold**.

**Lap compare** (`/grip/compare`) puts up to 6 laps — one session or several — on a **spatial** axis and answers "where did the time go, and why". The whole feature rests on one primitive in `align.ts`: the reference lap's racing line becomes the axis, and every other lap is mapped onto it by forward-walking nearest-point projection, then resampled to a uniform 2 m grid (`compare.ts`). Aligning by each lap's own cumulative distance instead is wrong by up to **0.86 s** on real data (a 13 m tighter line arrives "early" on its own odometer everywhere), and the classic ∫(1/v)ds time-gain formula fails the same way — use interpolated time-at-distance, never either of those. Each lap's clock is zeroed at the interpolated moment it crosses the axis zero, not at its own first sample: RaceBox's `Lap` column flips at the first sample *after* the timing line, so a per-lap bias of up to one sample period (measured 39 ms) otherwise shifts the entire delta curve. With the spatial anchor plus ±6 samples of lap padding, finish deltas reproduce RaceBox's own lap times to **max 1.4 ms / mean 0.8 ms** across ten real laps (pinned in `compare-fixtures.test.ts`). Derived read-outs live in `compare-stats.ts`: per-turn windows identical in space for every lap, a payoff verdict from sign(Δt)×sign(Δdemand), segment splits and a theoretical-best lap, duty in **metres** of brake/coast/drive (from `along`, the drag-corrected channel — a true coast sits at along ≈ 0) restricted to the lap's own common section, and **equal-lap-budget** envelopes because the envelope score grows ~8 points from lap count alone. `resolveCompareSettings` forces one settings snapshot across the comparison (shared value where sessions agree, else defaults, so the result never depends on which lap is the reference). Laps that only partly share the reference layout are compared over their **common section** with `grid.dt` set to `NaN` outside it — masked, never clamped, because a clamped projection dumps a whole divergent loop into a few metres of axis and reads ~10× wrong. That mask is a contract every consumer owes: `grid.dt` is the only NaN-bearing channel, so anything reading `spd`/`along`/`comb`/`metric` outside a lap's `section` is reading a held end value, not a measurement — the trace chart and `dutyMetres` both take the section explicitly for exactly that reason. `turnPayoff` returns `'unmeasured'` rather than falling through NaN comparisons to `'level'`. Nothing is persisted: the URL (`?sessions=&laps=&ref=&m=`) is the shareable artefact.

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
| `/` | `RootRoute`: signed in → `/home`, native → `/login`, else the public landing page (prerendered in prod, see below) |
| `/home` | System home (tool launcher) |
| `/garage` | Garage (vehicle list) |
| `/vehicles/:id` | Detail + calibrations + run history |
| `/vehicles/:vehicleId/calibrations/new` | 3-step wizard: gear → measure → confirm |
| `/vehicles/:vehicleId/calibrations/:calibrationId/run` | Live run (warmup + record + auto-stop) |
| `/vehicles/:vehicleId/calibrations/:calibrationId/session` | Hands-free session (motorcycle): record whole ride, auto-detect pulls, save selected as runs |
| `/runs/:runId/review` | Curve + peak + notes + save/discard |
| `/vehicles/:vehicleId/compare` | Overlay multiple runs' curves |
| `/recordings` | List/manage raw sensor recordings |
| `/grip` | Grip Utilization: saved track sessions + RaceBox CSV dropzone |
| `/grip/sessions/:sessionId` | Grip session analyzer (map, traction circle, corners, playback) |
| `/grip/compare?sessions=&laps=&ref=&m=` | Lap compare: delta-vs-distance, delta-coloured map, channel overlay, turn table, envelopes |
| `/replay` | Upload JSON fixture, run pipeline offline |
| `/settings` | Load replay recording, view permissions |
| `/admin` | Admin panel (admins only): user/content KPIs, growth & activity charts, users table, recent runs, leaderboard, system health |

**The landing page is prerendered and ships zero JS.** `npm run build` runs `scripts/prerender-landing.mjs` after `vite build`: it renders `LandingScreen` via `src/prerender/landing-document.tsx` and writes `dist/landing.html` — a standalone document with **no `<script>` tag at all** and the entry stylesheet inlined into `<style>`. In prod nginx serves that file for exactly `/` (see *Deployment layout*), so the one page crawlers and first-time visitors get needs no JS, no hydration, and no sub-resource beyond the favicon and manifest. Build-time, not request-time: the page has no dynamic data, so an SSR round-trip through the API would only add a dependency and a latency floor. Consequences worth knowing:

- **`LandingScreen` must stay hook-free and `<Link>`-free.** It is rendered by both the prerender and the SPA (dev, and prod visitors with a stale session cookie), and `renderToStaticMarkup` runs no effects while a react-router `<Link>` needs a Router that a script-free page will never boot. Plain `<a>` works in both. The page title lives in the two `<head>`s, not in a `useEffect`.
- **The CSS is inlined because nginx here only gzips `text/html`** (`gzip_types` is left at its default). Inlined, the 60 kB stylesheet reaches the browser as ~11 kB and blocks nothing; as `/assets/index-*.css` the same bytes would be served uncompressed.
- **`build.manifest: true` in `vite.config.ts` exists for this** — the script reads the entry's hashed stylesheet out of `dist/.vite/manifest.json`.
- The script **fails the build** if the output contains `<script` or the body renders under 2 kB. A silently blank or silently scripted landing page would deploy happily and look fine to anyone testing with JS on.

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
| CRUD | `/api/grip-sessions[/:id]` | Grip track sessions (columnar jsonb channels; summary columns derived server-side from the envelope) |
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
- **Dev login bypass (no email):** magic-link sends real mail, which is painful on dev. `POST /api/dev/login {email}` (`server/src/routes/dev-auth.ts`) mints a real better-auth session cookie for that email (find-or-create, same semantics as magic-link verify) and skips the email + captcha. Gated by `DEV_LOGIN=true` in `server/.env` (absent from prod `/etc/dynorun.env`, so the route is never mounted in prod). The login screen shows a "Dev sign-in" panel under `import.meta.env.DEV` — Vite strips it from prod builds. Prefill the panel via `VITE_DEV_LOGIN_EMAIL` (root `.env`); the endpoint defaults to `DEV_LOGIN_EMAIL` when the body omits one. Restart the API after adding the env var (`--env-file` is read at process start, not on watch-reload).
- **`@capacitor-community/sqlite` is in `package.json` but unused** — leftover from a pre-Postgres local-first architecture. Safe to remove if you want to slim the install (would also drop `sql.js`, `localforage`, `jeep-sqlite` transitive deps). Not removed yet because no functional impact.
- **The two local RaceBox fixtures are NOT the same track layout**, despite both CSVs declaring `Track,Anneau Du Rhin` / `Configuration,Short` and having start/finish fixes ~2 m apart. Their laps are **2739 m** and **3411 m**: the second runs a ~690 m extension and rejoins before the line, sharing 88.5% of the first. Track name + configuration + a common start line is **not** layout identity — verify geometrically (`compare.ts` uses ordered-projection coverage + length ratio). This pair is the acceptance case for the partial-overlap path.
- **`GripCorner.n` is a per-lap detection index, never a track turn ID.** On ten laps of the same physical circuit, corner detection finds anywhere from **6 to 9** corners, so lap 3's "corner 5" and lap 1's "corner 5" are different bends. Use `GripCorner.turn` (assigned by `turns.ts`, see above) for anything that pairs corners across laps or that a rider reads as a turn number; `n` is only good for keying a map within one lap. `turn === 0` means "no other lap agrees this is a bend" — exclude it from cross-lap comparisons rather than treating it as turn zero.
- **`align.ts` uses WGS84 local radii of curvature; `project.ts` still uses the flat 111320/110540 constants.** The flat pair reads 0.2–0.6% short (8.5 m per 2.7 km lap). That is invisible in `project.ts` because the session track map auto-fits its own extent, but compare prints metres and integrates them, so it needs the correct scales. Don't "unify" them by copying the flat constants into `align.ts`.
- **The projection must never global-search its first sample.** On a closed circuit the axis begins and ends at the same physical point, so a global nearest-point search can snap sample 0 to `u ≈ length`; the monotone clamp then pins the whole projection there and the lap's delta comes out as minus a lap time. Measured margin on real data is as thin as 1 m. `FIRST_WINDOW_M` in `align.ts` is what prevents it.
- **Grip session uploads are multi-MB POST bodies** (a 30-min RaceBox session ≈ 2–3 MB of columnar jsonb even with per-channel rounding in `packGripData`). nginx's default `client_max_body_size` is 1 MB, so prod sets `client_max_body_size 20m` in the `/api/` location — without it uploads 413 and the error surfaces as a generic toast. Vite's dev proxy has no such limit, so the bug only appears in prod.
- **`crypto.randomUUID` is used in `server/routes/*.ts`** assuming Node 18+; build env pins Node 22.
- **Frontend builds on Node 20, server builds on Node 22** in CI (`.github/workflows/deploy.yml`). Don't unify without checking — they're separate jobs.
- **A RaceBox row with no GPS fix must never become the coordinate 0,0.** `0,0` is a real place in the Gulf of Guinea ~5300 km from any circuit: one such sample stretched the compare axis from 2.7 km to **10 700 km**, allocating a 5.4M-element `Float32Array` per channel per lap, and collapsed the session track map to a single dot. `parse-racebox.ts` holds the last known fix instead (and back-fills leading rows), so the sample count and time base survive; it reports the count as `ParsedGripSession.noFix`. A file with no fix anywhere is rejected outright.
- **The parser requires a strictly increasing clock.** Every grip derivative divides by `t[i+3] − t[i−3]` and guards it with `dt > 0`, so a duplicate or out-of-order timestamp does not *degrade* the reading — it fabricates an exactly 0 g / 0 g/s plateau in whatever section it lands. Such rows are dropped and counted in `ParsedGripSession.dropped`.
- **Two different clocks measure a lap, and they differ by ~52 ms.** `GripLap.time` / `CompareLapResult.lapTime` come from the RaceBox CSV metadata; `compareSegments`' times come from the spatial axis (zeroed at the interpolated crossing of `u = 0`, ending at `u = length`). Subtracting one from the other invents a gain: the compare legend reported a 0.05 s "theoretical best" advantage even when the reference lap won every segment. Compare axis figures only against `SegmentBreakdown.referenceTotal`.
- **`grip-session-cache.ts` is an LRU of 6, and every write path must invalidate it.** A parsed session retains ~3.5 MB, and the key carries `updated_at`, so an unbounded map grew a *new* full copy on every debounced settings save while the old one stayed reachable — measured ~21 MB of dead channel data after six analyzer↔compare round-trips, which is a discarded tab on mobile Safari. The analyzer reads through the cache (so the round-trip does not re-download), which means its settings/label/vehicle PATCHes and the home screen's delete all call `invalidateGripSession`.
- **Canvas draw code does not run in jsdom, and asserting "no console.error" does not test it.** `tests/ui/compare-canvas.test.tsx` and `tests/ui/session-canvas.test.tsx` stub `getBoundingClientRect` to force the draws, then wrap the 2D context in a counting Proxy and assert a floor on `stroke`/`beginPath` — verified by mutating `useCanvasDraw` to never draw, which now fails all of them and previously left 392 tests green. The session-canvas Proxy additionally throws on any non-finite coordinate; that is how the one-sample-lap divide-by-zero in `load-timeline.tsx` was found.
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

- Web root: `/var/www/dynorun` (owned by `deploy:deploy`) — static SPA build (`index.html` + `assets/`) plus the prerendered `landing.html`
- Web server: nginx (`/etc/nginx/sites-enabled/dynorun`), HTTPS on port 443, SPA fallback to `/index.html`, `/api/` proxied to `:3000`
- **`location = /` is cookie-switched, and it is not in the repo.** nginx serves the zero-JS `landing.html` at `/` to anonymous visitors, but must keep serving the SPA shell to signed-in ones or `RootRoute`'s redirect to `/home` never runs. A `map` on `$http_cookie` picks the file, which is why it is a `map` and not an `if`, and why the location sets `Vary: Cookie` (otherwise any cache in front could hand a signed-in user the landing page, or the reverse):
  ```nginx
  # http context, top of /etc/nginx/sites-enabled/dynorun
  map $http_cookie $wasgoht_root {
      default                        /landing.html;
      "~*better-auth\.session_token=" /index.html;   # matches the __Secure- prefixed name too
  }
  # inside the apex server block, before `location /`
  location = / {
      add_header Vary Cookie;
      add_header Cache-Control "no-cache";
      try_files $wasgoht_root /index.html;   # NOT =404 — see below
  }
  ```
  The fallback is `/index.html`, not `=404`: `landing.html` is a build artefact, so a build whose prerender step was skipped or renamed would otherwise **404 the homepage** rather than quietly degrade to the client-rendered SPA. CI only rsyncs `dist/`, so **this block survives deploys but is never re-applied by them** — it lives only on the server (backup of the pre-landing config: `/root/dynorun.nginx.bak.pre-landing`). If `/` ever starts serving the SPA to anonymous visitors, this block is what went missing. Always `nginx -t` before `systemctl reload nginx`.

  Verified live after applying: anonymous `GET /` → 68 kB, 0 `<script>`, `Vary: Cookie`, 15.5 kB gzipped on the wire; the same request carrying `better-auth.session_token` → the 1.6 kB SPA shell; every other route and `/api/` unchanged.
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
