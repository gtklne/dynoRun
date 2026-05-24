# DynoRun — Design Spec

**Date:** 2026-05-24
**Status:** Approved (design phase). Implementation plan pending.

## 1. Product summary

DynoRun lets a driver or rider perform a "dyno-style" power-curve measurement using only a smartphone. The user:

1. Calibrates a chosen gear once by holding a steady RPM and recording the corresponding speed (giving a speed↔RPM ratio).
2. Performs a wide-open-throttle acceleration run in the same gear.
3. Receives a wheel-power and wheel-torque curve derived from GPS speed over time, vehicle mass, and the calibration ratio.

The output is intentionally **comparative, not absolute**. Numbers will systematically under-read real horsepower because aerodynamic drag and rolling resistance are excluded from the prototype model. The product value is in run-vs-run comparison: "did changing my exhaust shift the curve?"

## 2. Platforms and packaging

- **Primary target:** iOS, via a packaged Capacitor app.
- **Secondary target:** Android, via the same Capacitor codebase.
- **Tertiary target:** PWA in any modern browser, in degraded mode (no background location, no Bluetooth on iOS Safari).
- Single codebase: TypeScript + React + Vite, packaged for native targets via Capacitor.

iOS Safari does not expose Web Bluetooth, so the future OBD-II feature will be limited to packaged apps and (when used from a browser) Chrome/Android.

## 3. Tech stack

| Layer | Choice |
| --- | --- |
| Build / app shell | Vite + Capacitor 6+ |
| UI framework | React 18 + TypeScript |
| Charting | uPlot (canvas-based, designed for streaming data at high update rates) |
| Local storage | SQLite via `@capacitor-community/sqlite` (native) with `sql.js` web fallback — same SQL on both |
| Sensors (native + web) | `@capacitor/geolocation`, `@capacitor/motion` |
| Wake lock | `@capacitor-community/keep-awake` |
| Future OBD-II | `@capacitor-community/bluetooth-le` (added later, no architectural change required) |
| Testing | Vitest, React Testing Library, in-memory `sql.js` for DB tests |

## 4. System architecture

Six internal layers, strict one-way dependencies (UI → run controller → sensors + analysis + storage):

1. **Sensor layer** (`src/sensors/`) — typed abstractions over GPS, motion, and (future) Bluetooth. The single most important architectural lever: it makes OBD-II an additive feature later, not a rewrite.
2. **Run controller** (`src/run/`) — finite state machine owning the lifecycle of one run. Receives sensor streams, drives transitions, persists results.
3. **Analysis pipeline** (`src/analysis/`) — pure TypeScript functions (no I/O, no React). Trivially unit-testable.
4. **Storage layer** (`src/storage/`) — repository pattern over SQLite. Schema is Postgres-compatible from day one.
5. **UI layer** (`src/ui/`) — React components and pages. Live chart updates are pushed imperatively into uPlot via a ref so high-frequency sensor samples do not re-render the React tree.
6. **App services** (`src/app/`) — wake lock, permission gating, error reporting, platform detection.

Local-only today. No backend. Future cloud sync is an additive sync layer over the existing repositories.

## 5. Sensor abstraction

Core interfaces in `src/sensors/`:

```ts
interface SensorSample<T> {
  t_ms: number;          // monotonic, relative to run start
  value: T;
  quality: number;       // 0–1, source-specific confidence
}

interface SensorSource<T> {
  readonly id: string;
  readonly capabilities: Capability[];
  start(): Promise<void>;
  stop(): Promise<void>;
  samples$: Observable<SensorSample<T>>;
}

interface SpeedSource extends SensorSource<{ speed_mps: number }> {}
interface RpmSource   extends SensorSource<{ rpm: number }> {}
interface AccelSource extends SensorSource<{ ax: number; ay: number; az: number }> {}
```

**Implementations on day one:**

- `GpsSpeedSource` — wraps `@capacitor/geolocation` with `watchPosition({enableHighAccuracy: true})`. Background location enabled on native with appropriate Info.plist / manifest entries.
- `MotionAccelSource` — wraps `@capacitor/motion`. Used as a second opinion on longitudinal acceleration and to detect run-start (sudden longitudinal g).
- `DerivedRpmSource` — composes a `SpeedSource` and a `Calibration` to emit RPM. Feeds the live RPM display when no OBD is present.

**Implementations added later, without changing analysis or UI:**

- `ObdRpmSource`, `ObdSpeedSource`, `ObdThrottleSource` — wrap `@capacitor-community/bluetooth-le`, speak ELM327 (`010C` = RPM, `010D` = speed, `0111` = throttle).

A `SensorRegistry` resolves the best available source per capability at run start (e.g. prefer OBD RPM over derived RPM when both exist). Tests substitute `MockSpeedSource.fromFixture(...)` with no other changes.

## 6. Data model

All tables carry `id` (UUID), `user_id` (nullable, populated on future cloud migration), `created_at`, `updated_at`, and `synced_at` (nullable, used by the future sync engine).

- **`vehicles`** — `name`, `kind` (`car` | `motorcycle`), `mass_kg` (**total moving mass: vehicle curb weight + driver + typical fuel + cargo**; the form prompts for this explicitly), `drivetrain` (`fwd` | `rwd` | `awd` | `chain` | `shaft`), `frontal_area_m2` (nullable, reserved for future drag model), `drag_coefficient` (nullable, same), `notes`.
- **`calibrations`** — `vehicle_id`, `gear_label` (free text, e.g. "3rd"), `rpm`, `speed_kmh`, derived `rollout_m_per_rev`, `recorded_at`, `notes`.
- **`runs`** — `vehicle_id`, `calibration_id`, `started_at`, `ended_at`, `gear_label` (denormalized for safety against calibration deletion), `conditions` (JSON: ambient temp, wind, road slope, surface), `notes`, `status` (`complete` | `degraded` | `aborted`).
- **`samples`** — `run_id`, `t_ms`, `speed_mps`, `accel_long_ms2`, `accel_vert_ms2`, `lat` (nullable), `lon` (nullable), `hdop` (nullable). Indexed on `(run_id, t_ms)`.
- **`derived_curves`** — `run_id`, `rpm_min`, `rpm_max`, `points` (JSON array of `{rpm, wheel_power_kw, wheel_torque_nm}`), `pipeline_version`, `computed_at`. Cache of analysis output so the comparison view does not recompute.

Migrations are SQL files versioned against a `schema_versions` table. Same migration files run in `sql.js` (web) and Capacitor SQLite (native).

Repository interfaces (`VehicleRepository`, `RunRepository`, `CalibrationRepository`, `SampleRepository`, `DerivedCurveRepository`) hide SQL. Cloud sync, when added, wraps each repository — analysis and UI remain unchanged.

## 7. Run lifecycle

State machine in the run controller:

1. **Idle** — user picks a vehicle and a gear.
2. **Calibrating** — user holds steady RPM. App watches GPS speed for a stable window (e.g. 5 seconds where speed varies by < 1 km/h), records the speed/RPM ratio, asks the user to confirm.
3. **Ready** — calibration confirmed. App requests wake lock. Big "Start Run" button.
4. **Running** — sensor samples captured, live telemetry chart updates, user accelerates through the gear.
5. **Analyzing** — pipeline runs (sub-second), derived curve cached to `derived_curves`.
6. **Reviewing** — full chart shown, user can save with notes or discard.

**End-of-run trigger:** auto-detect with manual override. The run ends automatically when the app sees roughly 1 second of zero-or-negative longitudinal acceleration (driver lifted). Stop button is always available. Audio cue on auto-stop ("Run complete").

## 8. Analysis pipeline

Implemented as pure functions in `src/analysis/`. No I/O.

1. **Resample** raw GPS samples (variable rate, typically 1–5 Hz) onto a fixed 10 Hz timebase via linear interpolation.
2. **Smooth** the speed signal with a Savitzky-Golay filter (window ≈ 7–15 samples, polynomial order 2).
3. **Differentiate** smoothed speed via central differences to obtain longitudinal acceleration `a(t)`.
4. **Translate** speed to RPM at each sample using the calibration's `rollout_m_per_rev`.
5. **Force at wheels:** `F(t) = mass_kg * a(t)`. Aerodynamic drag and rolling resistance are **excluded** in the prototype.
6. **Power at wheels:** `P(t) = F(t) * speed_mps(t)`. **Torque at wheels:** `T(t) = P(t) / angular_velocity(t)`.
7. **RPM-bin** the resulting points (e.g. 100 RPM bins), averaging within each bin to produce the final `(rpm, power_kw, torque_nm)` curve.

Output is stored in `derived_curves` with a `pipeline_version`. Bumping the version on future improvements lets the app re-derive existing runs without losing the raw samples.

**Acknowledged limitations:**
- Numbers under-read real wheel power by 5–20% depending on speed (drag and rolling resistance not modeled).
- Slope and wind not corrected for. User is expected to use the same straight stretch of road for comparison runs.
- Comparison validity depends on consistent vehicle mass between runs.

The data model already has nullable `frontal_area_m2` and `drag_coefficient` columns so a future "include drag" toggle is a per-vehicle opt-in without a schema migration.

## 9. UI surface

Tab-based navigation: Garage / Runs / Settings.

1. **Garage** — list of vehicles. Tap to edit, "+" to add. Vehicle form: name, kind, mass (kg), drivetrain, notes. Aero fields hidden in prototype.
2. **Vehicle detail** — info, list of calibrations, list of runs, "New Run" button.
3. **Calibration wizard** — three steps: pick gear → hold steady RPM (visual stability indicator) → confirm captured ratio.
4. **Live run view** — large speed and RPM readouts, live uPlot streaming chart (speed and RPM vs. time, rolling window), Stop button. Audio cues on start and auto-stop. Wake lock active throughout.
5. **Run review** — power and torque curves, run metadata (peak power RPM, peak torque RPM, duration, start/end speed), notes field, Save / Discard.
6. **Compare** — accessed from the Runs list. Multi-select 2+ runs, overlay their power curves on one chart, colour-coded legend.

**Settings:** units (metric / imperial), permissions status, data export (JSON dump for backup until cloud sync exists).

## 10. Error handling

| Failure | Handling |
| --- | --- |
| Location / motion permission denied | Block flow with clear explanation; deep link to system settings to re-grant. |
| GPS signal weak or lost mid-run | Continue capture, mark run `degraded` on analyze; visible badge; greyed out by default in Compare. |
| App backgrounded or OS-killed mid-run | Wake lock prevents normally; if it happens, partial samples persist; on relaunch user sees "recover this run?" prompt. |
| Calibration implausible (run hits an inferred RPM far outside the calibrated range) | Warning before saving the run. |
| Storage full | Graceful warning, blocks new runs until user deletes some. |

## 11. Testing strategy

- **Analysis pipeline:** pure-function unit tests with synthetic input (known acceleration → known power curve).
- **Sensors:** mock implementations replay recorded JSON fixtures from real drives. Entire run-controller → analysis flow runs deterministically without a car.
- **Run controller:** state machine unit-tested with mock sensors.
- **Storage:** tests against in-memory `sql.js` with the same SQL used in production.
- **UI:** light integration tests on calibration wizard and live view via React Testing Library.
- **End-to-end smoke:** one test replays a fixture all the way through to a saved run + cached derived curve in the database.

## 12. Project structure

```
src/
  sensors/         # interfaces + GPS / motion / (future) BLE implementations
  run/             # state machine, run controller
  analysis/        # pure functions: smoothing, differentiation, power calc, binning
  storage/         # repositories, migrations, schema
  ui/              # React components, pages, charts
  app/             # capacitor bridge, permissions, wake lock, platform detection
  shared/          # types, units, utils
tests/
  fixtures/        # recorded sensor streams for replay
```

## 13. Out of scope for the prototype

- Backend, accounts, cloud sync (schema is forward-compatible; no code).
- OBD-II Bluetooth integration (sensor abstraction reserves space; no code).
- Aerodynamic drag and rolling resistance modelling (columns reserved; no code).
- Sharing runs publicly, leaderboards, social features.
- Microphone-based RPM detection (not needed; RPM derived from GPS + calibration).
- Multi-gear runs in a single recording.
