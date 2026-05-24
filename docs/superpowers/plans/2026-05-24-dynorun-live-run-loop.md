# DynoRun Live Run Loop Implementation Plan (Phase 2 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the live-driving experience on top of Plan 1's foundation: a calibration wizard that detects steady-speed windows, a real-time run screen with a streaming uPlot chart, auto-stop detection, a run controller state machine wiring sensors to storage, the run review screen, and integration into the existing Garage UI.

**Architecture:** Two small state machines (calibration, run) drive headless controllers (`CalibrationController`, `RunController`) that depend only on the `SensorSource` and repository interfaces from Plan 1. React screens render the controller's state via subscription callbacks. Chart updates are pushed imperatively into uPlot via a ref so React never re-renders at sensor rate. Wake lock and geolocation permissions are isolated services with their own tests.

**Tech Stack:** Same as Plan 1 — Vite, React 18, TypeScript, Vitest, uPlot, sql.js. No new dependencies.

---

## Prerequisites

Plan 1 complete. Repo at `/Users/jnothstein/Documents/websites/dynoRun` with 49 tests passing, typecheck clean, build clean. All Plan 1 commit author flags continue: `-c user.email=gutelkaune+claude@gmail.com -c user.name="DynoRun"` with no Claude co-author trailer.

## File structure produced by this plan

```
src/
  run/
    types.ts                            # CalibrationState, RunState, etc.
    calibration-state-machine.ts        # pure FSM
    run-state-machine.ts                # pure FSM
    calibration-stability-detector.ts   # speed-stable-for-N-seconds detector
    auto-stop-detector.ts               # deceleration trigger
    calibration-controller.ts           # wires sensor → detector → state machine → storage
    run-controller.ts                   # wires sensor → detector → state machine → storage → pipeline
  app/
    wake-lock.ts                        # navigator.wakeLock wrapper
    geolocation-permission.ts           # navigator.permissions wrapper
  ui/
    components/
      streaming-chart.tsx               # uPlot wrapper with imperative pushSample(...)
      stability-bar.tsx                 # visual indicator for calibration stability
    calibration/
      calibration-wizard-screen.tsx     # 3-step wizard host
      calibration-step-gear.tsx
      calibration-step-measure.tsx
      calibration-step-confirm.tsx
    run/
      live-run-screen.tsx               # the live driving screen
      run-review-screen.tsx
  ui/garage/
    vehicle-detail.tsx                  # MODIFY: add "New Calibration" / "New Run" buttons
  App.tsx                               # MODIFY: register new routes
tests/
  run/
    calibration-state-machine.test.ts
    run-state-machine.test.ts
    calibration-stability-detector.test.ts
    auto-stop-detector.test.ts
    calibration-controller.test.ts
    run-controller.test.ts
  app/
    wake-lock.test.ts
    geolocation-permission.test.ts
  ui/
    calibration-wizard.test.tsx
    live-run-screen.test.tsx
    run-review-screen.test.tsx
```

---

## Phase A — State machines & detectors

### Task 1: Run domain types

**Files:**
- Create: `src/run/types.ts`

- [ ] **Step 1: Implement**

```ts
import type { UUID } from '@/shared/types';

export type CalibrationState =
  | { kind: 'idle' }
  | { kind: 'measuring'; gear_label: string; user_rpm: number; started_at_ms: number }
  | { kind: 'stable'; gear_label: string; user_rpm: number; captured_speed_kmh: number }
  | { kind: 'confirmed'; calibration_id: UUID };

export type RunState =
  | { kind: 'idle' }
  | { kind: 'ready'; vehicle_id: UUID; calibration_id: UUID; gear_label: string }
  | { kind: 'running'; run_id: UUID; started_t_ms: number }
  | { kind: 'analyzing'; run_id: UUID }
  | { kind: 'reviewing'; run_id: UUID }
  | { kind: 'saved'; run_id: UUID }
  | { kind: 'aborted'; run_id: UUID };

export interface StabilityWindow {
  duration_ms: number;
  max_speed_delta_kmh: number;
}

export const DEFAULT_STABILITY_WINDOW: StabilityWindow = {
  duration_ms: 5000,
  max_speed_delta_kmh: 1.0,
};

export interface AutoStopConfig {
  zero_accel_window_ms: number;
}

export const DEFAULT_AUTO_STOP_CONFIG: AutoStopConfig = {
  zero_accel_window_ms: 1000,
};
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck` → exit 0.

- [ ] **Step 3: Commit**

```bash
git -c user.email=gutelkaune+claude@gmail.com -c user.name="DynoRun" commit -am "feat(run): state machine types"
```

### Task 2: Calibration state machine

**Files:**
- Create: `src/run/calibration-state-machine.ts`
- Test: `tests/run/calibration-state-machine.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { calibrationReducer, initialCalibrationState } from '@/run/calibration-state-machine';

describe('calibrationReducer', () => {
  it('starts measuring on START', () => {
    const s = calibrationReducer(initialCalibrationState(), {
      type: 'START',
      gear_label: '3rd',
      user_rpm: 3000,
      now_ms: 100,
    });
    expect(s).toEqual({ kind: 'measuring', gear_label: '3rd', user_rpm: 3000, started_at_ms: 100 });
  });

  it('transitions to stable when STABILITY_DETECTED fires during measuring', () => {
    const s = calibrationReducer(
      { kind: 'measuring', gear_label: '3rd', user_rpm: 3000, started_at_ms: 0 },
      { type: 'STABILITY_DETECTED', captured_speed_kmh: 80.2 },
    );
    expect(s).toEqual({ kind: 'stable', gear_label: '3rd', user_rpm: 3000, captured_speed_kmh: 80.2 });
  });

  it('CONFIRM only valid in stable state', () => {
    const stable = { kind: 'stable' as const, gear_label: '3rd', user_rpm: 3000, captured_speed_kmh: 80.2 };
    const s = calibrationReducer(stable, { type: 'CONFIRM', calibration_id: 'cal-1' });
    expect(s).toEqual({ kind: 'confirmed', calibration_id: 'cal-1' });
  });

  it('CONFIRM from idle is a no-op', () => {
    const s = calibrationReducer(initialCalibrationState(), { type: 'CONFIRM', calibration_id: 'cal-1' });
    expect(s).toEqual({ kind: 'idle' });
  });

  it('RESTART returns to idle from any state', () => {
    const s = calibrationReducer(
      { kind: 'measuring', gear_label: '3rd', user_rpm: 3000, started_at_ms: 0 },
      { type: 'RESTART' },
    );
    expect(s).toEqual({ kind: 'idle' });
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `npm test -- calibration-state-machine` → FAIL.

- [ ] **Step 3: Implement**

```ts
import type { CalibrationState } from './types';
import type { UUID } from '@/shared/types';

export type CalibrationEvent =
  | { type: 'START'; gear_label: string; user_rpm: number; now_ms: number }
  | { type: 'STABILITY_DETECTED'; captured_speed_kmh: number }
  | { type: 'CONFIRM'; calibration_id: UUID }
  | { type: 'RESTART' };

export const initialCalibrationState = (): CalibrationState => ({ kind: 'idle' });

export function calibrationReducer(state: CalibrationState, event: CalibrationEvent): CalibrationState {
  if (event.type === 'RESTART') return { kind: 'idle' };

  switch (state.kind) {
    case 'idle':
      if (event.type === 'START') {
        return {
          kind: 'measuring',
          gear_label: event.gear_label,
          user_rpm: event.user_rpm,
          started_at_ms: event.now_ms,
        };
      }
      return state;
    case 'measuring':
      if (event.type === 'STABILITY_DETECTED') {
        return {
          kind: 'stable',
          gear_label: state.gear_label,
          user_rpm: state.user_rpm,
          captured_speed_kmh: event.captured_speed_kmh,
        };
      }
      return state;
    case 'stable':
      if (event.type === 'CONFIRM') {
        return { kind: 'confirmed', calibration_id: event.calibration_id };
      }
      return state;
    case 'confirmed':
      return state;
  }
}
```

- [ ] **Step 4: Run, expect PASS**

Run: `npm test -- calibration-state-machine` → 5 passed.

- [ ] **Step 5: Commit**

```bash
git -c user.email=gutelkaune+claude@gmail.com -c user.name="DynoRun" commit -am "feat(run): calibration state machine"
```

### Task 3: Run state machine

**Files:**
- Create: `src/run/run-state-machine.ts`
- Test: `tests/run/run-state-machine.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { runReducer, initialRunState } from '@/run/run-state-machine';

describe('runReducer', () => {
  it('starts in idle', () => {
    expect(initialRunState()).toEqual({ kind: 'idle' });
  });

  it('READY transitions idle -> ready', () => {
    const s = runReducer(initialRunState(), {
      type: 'READY',
      vehicle_id: 'v1',
      calibration_id: 'c1',
      gear_label: '3rd',
    });
    expect(s).toEqual({ kind: 'ready', vehicle_id: 'v1', calibration_id: 'c1', gear_label: '3rd' });
  });

  it('START transitions ready -> running', () => {
    const s = runReducer(
      { kind: 'ready', vehicle_id: 'v1', calibration_id: 'c1', gear_label: '3rd' },
      { type: 'START', run_id: 'r1', now_ms: 1000 },
    );
    expect(s).toEqual({ kind: 'running', run_id: 'r1', started_t_ms: 1000 });
  });

  it('STOP transitions running -> analyzing', () => {
    const s = runReducer(
      { kind: 'running', run_id: 'r1', started_t_ms: 0 },
      { type: 'STOP' },
    );
    expect(s).toEqual({ kind: 'analyzing', run_id: 'r1' });
  });

  it('ANALYSIS_DONE transitions analyzing -> reviewing', () => {
    const s = runReducer({ kind: 'analyzing', run_id: 'r1' }, { type: 'ANALYSIS_DONE' });
    expect(s).toEqual({ kind: 'reviewing', run_id: 'r1' });
  });

  it('SAVE transitions reviewing -> saved', () => {
    const s = runReducer({ kind: 'reviewing', run_id: 'r1' }, { type: 'SAVE' });
    expect(s).toEqual({ kind: 'saved', run_id: 'r1' });
  });

  it('DISCARD from reviewing -> aborted', () => {
    const s = runReducer({ kind: 'reviewing', run_id: 'r1' }, { type: 'DISCARD' });
    expect(s).toEqual({ kind: 'aborted', run_id: 'r1' });
  });

  it('ABORT from running -> aborted', () => {
    const s = runReducer({ kind: 'running', run_id: 'r1', started_t_ms: 0 }, { type: 'ABORT' });
    expect(s).toEqual({ kind: 'aborted', run_id: 'r1' });
  });

  it('events out of order are no-ops', () => {
    const s = runReducer(initialRunState(), { type: 'STOP' });
    expect(s).toEqual({ kind: 'idle' });
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `npm test -- run-state-machine` → FAIL.

- [ ] **Step 3: Implement**

```ts
import type { RunState } from './types';
import type { UUID } from '@/shared/types';

export type RunEvent =
  | { type: 'READY'; vehicle_id: UUID; calibration_id: UUID; gear_label: string }
  | { type: 'START'; run_id: UUID; now_ms: number }
  | { type: 'STOP' }
  | { type: 'ABORT' }
  | { type: 'ANALYSIS_DONE' }
  | { type: 'SAVE' }
  | { type: 'DISCARD' }
  | { type: 'RESET' };

export const initialRunState = (): RunState => ({ kind: 'idle' });

export function runReducer(state: RunState, event: RunEvent): RunState {
  if (event.type === 'RESET') return { kind: 'idle' };

  switch (state.kind) {
    case 'idle':
      if (event.type === 'READY') {
        return {
          kind: 'ready',
          vehicle_id: event.vehicle_id,
          calibration_id: event.calibration_id,
          gear_label: event.gear_label,
        };
      }
      return state;
    case 'ready':
      if (event.type === 'START') {
        return { kind: 'running', run_id: event.run_id, started_t_ms: event.now_ms };
      }
      return state;
    case 'running':
      if (event.type === 'STOP') return { kind: 'analyzing', run_id: state.run_id };
      if (event.type === 'ABORT') return { kind: 'aborted', run_id: state.run_id };
      return state;
    case 'analyzing':
      if (event.type === 'ANALYSIS_DONE') return { kind: 'reviewing', run_id: state.run_id };
      return state;
    case 'reviewing':
      if (event.type === 'SAVE') return { kind: 'saved', run_id: state.run_id };
      if (event.type === 'DISCARD') return { kind: 'aborted', run_id: state.run_id };
      return state;
    case 'saved':
    case 'aborted':
      return state;
  }
}
```

- [ ] **Step 4: Run, expect PASS**

Run: `npm test -- run-state-machine` → 9 passed.

- [ ] **Step 5: Commit**

```bash
git -c user.email=gutelkaune+claude@gmail.com -c user.name="DynoRun" commit -am "feat(run): run state machine"
```

### Task 4: Calibration stability detector

**Files:**
- Create: `src/run/calibration-stability-detector.ts`
- Test: `tests/run/calibration-stability-detector.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { CalibrationStabilityDetector } from '@/run/calibration-stability-detector';
import { mpsToKmh } from '@/shared/units';

describe('CalibrationStabilityDetector', () => {
  it('fires when speed stays within delta for the full window', () => {
    const det = new CalibrationStabilityDetector({ duration_ms: 1000, max_speed_delta_kmh: 1.0 });
    // 22.22 m/s ≈ 80 km/h, hold steady
    det.push({ t_ms: 0, speed_mps: 22.22 });
    det.push({ t_ms: 200, speed_mps: 22.30 });
    det.push({ t_ms: 400, speed_mps: 22.15 });
    det.push({ t_ms: 600, speed_mps: 22.22 });
    det.push({ t_ms: 800, speed_mps: 22.20 });
    expect(det.check(1000)).toBeNull();
    const result = det.check(1050);
    expect(result).not.toBeNull();
    expect(result!.captured_speed_kmh).toBeCloseTo(mpsToKmh(22.22), 0);
  });

  it('does not fire when speed deviates beyond delta', () => {
    const det = new CalibrationStabilityDetector({ duration_ms: 1000, max_speed_delta_kmh: 0.5 });
    det.push({ t_ms: 0, speed_mps: 22.22 });
    det.push({ t_ms: 500, speed_mps: 23.5 });  // way off
    det.push({ t_ms: 1100, speed_mps: 22.22 });
    expect(det.check(1100)).toBeNull();
  });

  it('reset() clears the buffer', () => {
    const det = new CalibrationStabilityDetector({ duration_ms: 500, max_speed_delta_kmh: 1.0 });
    det.push({ t_ms: 0, speed_mps: 10 });
    det.push({ t_ms: 600, speed_mps: 10 });
    det.reset();
    expect(det.check(700)).toBeNull();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `npm test -- calibration-stability-detector` → FAIL.

- [ ] **Step 3: Implement**

```ts
import { mpsToKmh, kmhToMps } from '@/shared/units';
import type { StabilityWindow } from './types';

interface Sample {
  t_ms: number;
  speed_mps: number;
}

export interface StabilityResult {
  captured_speed_kmh: number;
}

export class CalibrationStabilityDetector {
  private buffer: Sample[] = [];

  constructor(private readonly window: StabilityWindow) {}

  push(sample: Sample): void {
    this.buffer.push(sample);
  }

  reset(): void {
    this.buffer = [];
  }

  check(now_ms: number): StabilityResult | null {
    const cutoff = now_ms - this.window.duration_ms;
    const recent = this.buffer.filter((s) => s.t_ms >= cutoff);
    if (recent.length < 3) return null;

    const speedsKmh = recent.map((s) => mpsToKmh(s.speed_mps));
    const min = Math.min(...speedsKmh);
    const max = Math.max(...speedsKmh);

    if (max - min > this.window.max_speed_delta_kmh) return null;

    // Require the recent window to cover the requested duration
    const oldest = recent[0].t_ms;
    if (now_ms - oldest < this.window.duration_ms) return null;

    const avgMps = recent.reduce((a, s) => a + s.speed_mps, 0) / recent.length;
    return { captured_speed_kmh: mpsToKmh(avgMps) };
  }
}
```

(Note: `kmhToMps` is imported only for symmetry; if unused, remove the import.)

- [ ] **Step 4: Run, expect PASS**

Run: `npm test -- calibration-stability-detector` → 3 passed.

- [ ] **Step 5: Commit**

```bash
git -c user.email=gutelkaune+claude@gmail.com -c user.name="DynoRun" commit -am "feat(run): calibration stability detector"
```

### Task 5: Auto-stop detector

**Files:**
- Create: `src/run/auto-stop-detector.ts`
- Test: `tests/run/auto-stop-detector.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { AutoStopDetector } from '@/run/auto-stop-detector';

describe('AutoStopDetector', () => {
  it('does not fire while speed is increasing', () => {
    const det = new AutoStopDetector({ zero_accel_window_ms: 500 });
    det.push({ t_ms: 0, speed_mps: 10 });
    det.push({ t_ms: 100, speed_mps: 12 });
    det.push({ t_ms: 200, speed_mps: 14 });
    expect(det.check(200)).toBe(false);
  });

  it('fires after 500ms of non-positive acceleration', () => {
    const det = new AutoStopDetector({ zero_accel_window_ms: 500 });
    det.push({ t_ms: 0, speed_mps: 20 });
    det.push({ t_ms: 100, speed_mps: 25 });   // accelerating
    det.push({ t_ms: 200, speed_mps: 28 });   // accelerating
    det.push({ t_ms: 300, speed_mps: 28 });   // lift
    det.push({ t_ms: 500, speed_mps: 28 });
    det.push({ t_ms: 800, speed_mps: 27 });
    expect(det.check(800)).toBe(true);
  });

  it('resets if speed climbs again', () => {
    const det = new AutoStopDetector({ zero_accel_window_ms: 500 });
    det.push({ t_ms: 0, speed_mps: 20 });
    det.push({ t_ms: 200, speed_mps: 20 });
    det.push({ t_ms: 400, speed_mps: 22 });
    det.push({ t_ms: 600, speed_mps: 24 });
    expect(det.check(600)).toBe(false);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `npm test -- auto-stop-detector` → FAIL.

- [ ] **Step 3: Implement**

```ts
import type { AutoStopConfig } from './types';

interface Sample {
  t_ms: number;
  speed_mps: number;
}

export class AutoStopDetector {
  private buffer: Sample[] = [];

  constructor(private readonly config: AutoStopConfig) {}

  push(sample: Sample): void {
    this.buffer.push(sample);
  }

  reset(): void {
    this.buffer = [];
  }

  check(now_ms: number): boolean {
    const cutoff = now_ms - this.config.zero_accel_window_ms;
    const window = this.buffer.filter((s) => s.t_ms >= cutoff);
    if (window.length < 2) return false;
    const first = window[0];
    const last = window[window.length - 1];
    if (last.t_ms - first.t_ms < this.config.zero_accel_window_ms) return false;
    // Non-positive acceleration over the window: last speed <= first speed
    return last.speed_mps <= first.speed_mps;
  }
}
```

- [ ] **Step 4: Run, expect PASS**

Run: `npm test -- auto-stop-detector` → 3 passed.

- [ ] **Step 5: Commit**

```bash
git -c user.email=gutelkaune+claude@gmail.com -c user.name="DynoRun" commit -am "feat(run): auto-stop detector"
```

---

## Phase B — App services

### Task 6: WakeLock service

**Files:**
- Create: `src/app/wake-lock.ts`
- Test: `tests/app/wake-lock.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WakeLock } from '@/app/wake-lock';

describe('WakeLock', () => {
  const realNavigator = globalThis.navigator;

  beforeEach(() => {
    const release = vi.fn().mockResolvedValue(undefined);
    const request = vi.fn().mockResolvedValue({ release });
    (globalThis.navigator as unknown) = { wakeLock: { request } };
    (globalThis as unknown as { __mockRequest: typeof request }).__mockRequest = request;
  });

  afterEach(() => {
    (globalThis.navigator as unknown) = realNavigator;
  });

  it('acquire() calls navigator.wakeLock.request("screen")', async () => {
    const wl = new WakeLock();
    await wl.acquire();
    expect(
      (globalThis as unknown as { __mockRequest: ReturnType<typeof vi.fn> }).__mockRequest,
    ).toHaveBeenCalledWith('screen');
    expect(wl.held).toBe(true);
  });

  it('release() releases the held lock', async () => {
    const wl = new WakeLock();
    await wl.acquire();
    await wl.release();
    expect(wl.held).toBe(false);
  });

  it('acquire() is a no-op if wakeLock API is unavailable', async () => {
    (globalThis.navigator as unknown) = {};
    const wl = new WakeLock();
    await wl.acquire();
    expect(wl.held).toBe(false);
    expect(wl.supported).toBe(false);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `npm test -- wake-lock` → FAIL.

- [ ] **Step 3: Implement**

```ts
interface MaybeWakeLockSentinel {
  release(): Promise<void>;
}

interface MaybeWakeLockNavigator {
  wakeLock?: {
    request(type: 'screen'): Promise<MaybeWakeLockSentinel>;
  };
}

export class WakeLock {
  private sentinel: MaybeWakeLockSentinel | null = null;

  get supported(): boolean {
    return typeof navigator !== 'undefined' && !!(navigator as MaybeWakeLockNavigator).wakeLock;
  }

  get held(): boolean {
    return this.sentinel !== null;
  }

  async acquire(): Promise<void> {
    if (!this.supported) return;
    const nav = navigator as MaybeWakeLockNavigator;
    this.sentinel = (await nav.wakeLock!.request('screen')) ?? null;
  }

  async release(): Promise<void> {
    if (this.sentinel) {
      await this.sentinel.release();
      this.sentinel = null;
    }
  }
}
```

- [ ] **Step 4: Run, expect PASS**

Run: `npm test -- wake-lock` → 3 passed.

- [ ] **Step 5: Commit**

```bash
git -c user.email=gutelkaune+claude@gmail.com -c user.name="DynoRun" commit -am "feat(app): WakeLock service"
```

### Task 7: Geolocation permission helper

**Files:**
- Create: `src/app/geolocation-permission.ts`
- Test: `tests/app/geolocation-permission.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ensureGeolocation } from '@/app/geolocation-permission';

describe('ensureGeolocation', () => {
  const realNavigator = globalThis.navigator;

  afterEach(() => {
    (globalThis.navigator as unknown) = realNavigator;
  });

  it('returns "granted" when query returns granted', async () => {
    (globalThis.navigator as unknown) = {
      permissions: { query: vi.fn().mockResolvedValue({ state: 'granted' }) },
      geolocation: {},
    };
    const r = await ensureGeolocation();
    expect(r).toBe('granted');
  });

  it('returns "prompt" when state is prompt', async () => {
    (globalThis.navigator as unknown) = {
      permissions: { query: vi.fn().mockResolvedValue({ state: 'prompt' }) },
      geolocation: {},
    };
    expect(await ensureGeolocation()).toBe('prompt');
  });

  it('returns "denied" when state is denied', async () => {
    (globalThis.navigator as unknown) = {
      permissions: { query: vi.fn().mockResolvedValue({ state: 'denied' }) },
      geolocation: {},
    };
    expect(await ensureGeolocation()).toBe('denied');
  });

  it('returns "unsupported" when geolocation API is missing', async () => {
    (globalThis.navigator as unknown) = {};
    expect(await ensureGeolocation()).toBe('unsupported');
  });

  it('falls back to "prompt" when permissions API is missing but geolocation exists', async () => {
    (globalThis.navigator as unknown) = { geolocation: {} };
    expect(await ensureGeolocation()).toBe('prompt');
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `npm test -- geolocation-permission` → FAIL.

- [ ] **Step 3: Implement**

```ts
export type GeolocationStatus = 'granted' | 'prompt' | 'denied' | 'unsupported';

interface MaybePermissionsNavigator {
  permissions?: { query(input: { name: PermissionName }): Promise<{ state: PermissionState }> };
  geolocation?: Geolocation;
}

export async function ensureGeolocation(): Promise<GeolocationStatus> {
  if (typeof navigator === 'undefined') return 'unsupported';
  const nav = navigator as MaybePermissionsNavigator;
  if (!nav.geolocation) return 'unsupported';
  if (!nav.permissions) return 'prompt';
  try {
    const res = await nav.permissions.query({ name: 'geolocation' });
    return res.state as GeolocationStatus;
  } catch {
    return 'prompt';
  }
}
```

- [ ] **Step 4: Run, expect PASS**

Run: `npm test -- geolocation-permission` → 5 passed.

- [ ] **Step 5: Commit**

```bash
git -c user.email=gutelkaune+claude@gmail.com -c user.name="DynoRun" commit -am "feat(app): geolocation permission helper"
```

---

## Phase C — Controllers

### Task 8: CalibrationController

**Files:**
- Create: `src/run/calibration-controller.ts`
- Test: `tests/run/calibration-controller.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createWebDatabase } from '@/storage/database-web';
import { runMigrations } from '@/storage/migrations/runner';
import { VehicleRepository } from '@/storage/repositories/vehicle-repository';
import { CalibrationRepository } from '@/storage/repositories/calibration-repository';
import { MockSpeedSource } from '@/sensors/mock-speed-source';
import { CalibrationController } from '@/run/calibration-controller';
import type { Database } from '@/storage/database';
import type { CalibrationState } from '@/run/types';

describe('CalibrationController', () => {
  let db: Database;
  let vehicleId: string;

  beforeEach(async () => {
    db = await createWebDatabase(':memory:');
    await runMigrations(db);
    const v = await new VehicleRepository(db).create({
      name: 'Civic', kind: 'car', mass_kg: 1300, drivetrain: 'fwd',
      frontal_area_m2: null, drag_coefficient: null, notes: '',
    });
    vehicleId = v.id;
  });

  it('drives idle -> measuring -> stable on stable input', async () => {
    vi.useFakeTimers();
    const samples = [
      { t_ms: 0, value: { speed_mps: 22.2 }, quality: 1 },
      { t_ms: 1000, value: { speed_mps: 22.25 }, quality: 1 },
      { t_ms: 2000, value: { speed_mps: 22.2 }, quality: 1 },
      { t_ms: 3000, value: { speed_mps: 22.18 }, quality: 1 },
      { t_ms: 4000, value: { speed_mps: 22.22 }, quality: 1 },
      { t_ms: 5000, value: { speed_mps: 22.2 }, quality: 1 },
      { t_ms: 6000, value: { speed_mps: 22.21 }, quality: 1 },
    ];
    const sensor = new MockSpeedSource('mock', samples);
    const states: CalibrationState[] = [];
    const ctrl = new CalibrationController({
      vehicleId,
      speedSource: sensor,
      calibrationRepository: new CalibrationRepository(db),
      onStateChange: (s) => states.push(s),
    });

    await ctrl.start({ gear_label: '3rd', user_rpm: 3000 });
    await vi.advanceTimersByTimeAsync(7000);
    await ctrl.stop();

    const kinds = states.map((s) => s.kind);
    expect(kinds).toContain('measuring');
    expect(kinds).toContain('stable');
    const stable = states.find((s) => s.kind === 'stable');
    expect(stable && 'captured_speed_kmh' in stable && stable.captured_speed_kmh).toBeCloseTo(80, 0);

    vi.useRealTimers();
  });

  it('confirm() persists a calibration with the captured speed', async () => {
    vi.useFakeTimers();
    const samples = Array.from({ length: 12 }, (_, i) => ({
      t_ms: i * 500,
      value: { speed_mps: 22.2 },
      quality: 1,
    }));
    const sensor = new MockSpeedSource('mock', samples);
    const calRepo = new CalibrationRepository(db);
    const ctrl = new CalibrationController({
      vehicleId,
      speedSource: sensor,
      calibrationRepository: calRepo,
      onStateChange: () => {},
    });

    await ctrl.start({ gear_label: '3rd', user_rpm: 3000 });
    await vi.advanceTimersByTimeAsync(7000);
    const cal = await ctrl.confirm();
    await ctrl.stop();

    expect(cal.gear_label).toBe('3rd');
    expect(cal.rpm).toBe(3000);
    expect(cal.speed_kmh).toBeCloseTo(80, 0);
    expect(cal.vehicle_id).toBe(vehicleId);
    const persisted = await calRepo.listByVehicle(vehicleId);
    expect(persisted).toHaveLength(1);

    vi.useRealTimers();
  });

  it('throws if confirm() called outside stable state', async () => {
    const sensor = new MockSpeedSource('mock', []);
    const ctrl = new CalibrationController({
      vehicleId,
      speedSource: sensor,
      calibrationRepository: new CalibrationRepository(db),
      onStateChange: () => {},
    });
    await expect(ctrl.confirm()).rejects.toThrow(/stable/i);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `npm test -- calibration-controller` → FAIL.

- [ ] **Step 3: Implement**

```ts
import { CalibrationStabilityDetector } from './calibration-stability-detector';
import { calibrationReducer, initialCalibrationState } from './calibration-state-machine';
import { DEFAULT_STABILITY_WINDOW, type CalibrationState, type StabilityWindow } from './types';
import type { SpeedSource, SensorSample, SpeedValue } from '@/sensors/types';
import type { CalibrationRepository } from '@/storage/repositories/calibration-repository';
import type { Calibration } from '@/shared/types';
import type { Unsubscribe } from '@/shared/observable';

export interface CalibrationControllerOptions {
  vehicleId: string;
  speedSource: SpeedSource;
  calibrationRepository: CalibrationRepository;
  window?: StabilityWindow;
  onStateChange: (state: CalibrationState) => void;
}

export class CalibrationController {
  private state: CalibrationState = initialCalibrationState();
  private detector: CalibrationStabilityDetector;
  private unsub: Unsubscribe | null = null;
  private lastSample_t_ms = 0;
  private running = false;

  constructor(private readonly opts: CalibrationControllerOptions) {
    this.detector = new CalibrationStabilityDetector(opts.window ?? DEFAULT_STABILITY_WINDOW);
  }

  getState(): CalibrationState {
    return this.state;
  }

  async start(input: { gear_label: string; user_rpm: number }): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.detector.reset();
    this.transition({ type: 'START', gear_label: input.gear_label, user_rpm: input.user_rpm, now_ms: 0 });
    this.unsub = this.opts.speedSource.samples$.subscribe((s) => this.onSample(s));
    await this.opts.speedSource.start();
  }

  async stop(): Promise<void> {
    this.unsub?.();
    this.unsub = null;
    await this.opts.speedSource.stop();
    this.running = false;
  }

  async confirm(): Promise<Calibration> {
    if (this.state.kind !== 'stable') {
      throw new Error('confirm() requires stable state');
    }
    const { gear_label, user_rpm, captured_speed_kmh } = this.state;
    const cal = await this.opts.calibrationRepository.create({
      vehicle_id: this.opts.vehicleId,
      gear_label,
      rpm: user_rpm,
      speed_kmh: captured_speed_kmh,
      notes: '',
    });
    this.transition({ type: 'CONFIRM', calibration_id: cal.id });
    return cal;
  }

  restart(): void {
    this.detector.reset();
    this.transition({ type: 'RESTART' });
  }

  private onSample(sample: SensorSample<SpeedValue>): void {
    this.lastSample_t_ms = sample.t_ms;
    this.detector.push({ t_ms: sample.t_ms, speed_mps: sample.value.speed_mps });
    if (this.state.kind !== 'measuring') return;
    const stable = this.detector.check(sample.t_ms);
    if (stable) {
      this.transition({ type: 'STABILITY_DETECTED', captured_speed_kmh: stable.captured_speed_kmh });
    }
  }

  private transition(event: Parameters<typeof calibrationReducer>[1]): void {
    this.state = calibrationReducer(this.state, event);
    this.opts.onStateChange(this.state);
  }
}
```

- [ ] **Step 4: Run, expect PASS**

Run: `npm test -- calibration-controller` → 3 passed.

- [ ] **Step 5: Commit**

```bash
git -c user.email=gutelkaune+claude@gmail.com -c user.name="DynoRun" commit -am "feat(run): CalibrationController"
```

### Task 9: RunController

**Files:**
- Create: `src/run/run-controller.ts`
- Test: `tests/run/run-controller.test.ts`
- Modify: `src/storage/repositories/run-repository.ts` (add `updateNotes` method)

- [ ] **Step 0: Add `updateNotes` to RunRepository**

In `src/storage/repositories/run-repository.ts`, add this method to the `RunRepository` class (alongside `markComplete`, `markDegraded`, etc.):

```ts
async updateNotes(id: string, notes: string): Promise<void> {
  await this.db.execute(
    'UPDATE runs SET notes = ?, updated_at = ? WHERE id = ?',
    [notes, nowIso(), id],
  );
}
```

Verify `npm run typecheck` exits 0.

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createWebDatabase } from '@/storage/database-web';
import { runMigrations } from '@/storage/migrations/runner';
import { VehicleRepository } from '@/storage/repositories/vehicle-repository';
import { CalibrationRepository } from '@/storage/repositories/calibration-repository';
import { RunRepository } from '@/storage/repositories/run-repository';
import { SampleRepository } from '@/storage/repositories/sample-repository';
import { DerivedCurveRepository } from '@/storage/repositories/derived-curve-repository';
import { MockSpeedSource } from '@/sensors/mock-speed-source';
import { RunController } from '@/run/run-controller';
import type { Database } from '@/storage/database';
import type { RunState } from '@/run/types';

async function setup(db: Database) {
  await runMigrations(db);
  const v = await new VehicleRepository(db).create({
    name: 'Civic', kind: 'car', mass_kg: 1300, drivetrain: 'fwd',
    frontal_area_m2: null, drag_coefficient: null, notes: '',
  });
  const c = await new CalibrationRepository(db).create({
    vehicle_id: v.id, gear_label: '3rd', rpm: 3000, speed_kmh: 80, notes: '',
  });
  return { vehicleId: v.id, calibrationId: c.id };
}

function buildScript(): { t_ms: number; value: { speed_mps: number }; quality: number }[] {
  const out = [];
  let v = 30 / 3.6;
  let t = 0;
  for (; t <= 1000; t += 100) out.push({ t_ms: t, value: { speed_mps: v }, quality: 1 });
  for (; t <= 9000; t += 100) {
    v += 2 * 0.1;
    out.push({ t_ms: t, value: { speed_mps: v }, quality: 1 });
  }
  // tail of lift: constant speed for 1 second after the pull
  for (; t <= 11000; t += 100) out.push({ t_ms: t, value: { speed_mps: v }, quality: 1 });
  return out;
}

describe('RunController', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createWebDatabase(':memory:');
  });

  it('records samples, auto-stops, analyzes, and persists a derived curve', async () => {
    vi.useFakeTimers();
    const { vehicleId, calibrationId } = await setup(db);
    const sensor = new MockSpeedSource('mock', buildScript());
    const states: RunState[] = [];

    const ctrl = new RunController({
      sensor,
      vehicleRepository: new VehicleRepository(db),
      calibrationRepository: new CalibrationRepository(db),
      runRepository: new RunRepository(db),
      sampleRepository: new SampleRepository(db),
      derivedCurveRepository: new DerivedCurveRepository(db),
      onStateChange: (s) => states.push(s),
    });

    await ctrl.ready(vehicleId, calibrationId);
    await ctrl.start();
    await vi.advanceTimersByTimeAsync(12000);
    // The auto-stop should have fired during the post-pull constant-speed tail.
    expect(states.some((s) => s.kind === 'analyzing')).toBe(true);

    // Wait one microtask for analysis to complete.
    await vi.runAllTimersAsync();
    expect(states.some((s) => s.kind === 'reviewing')).toBe(true);

    const final = states[states.length - 1];
    expect(final.kind).toBe('reviewing');
    const runId = (final as { run_id: string }).run_id;
    const curve = await new DerivedCurveRepository(db).getByRun(runId);
    expect(curve).not.toBeNull();
    expect(curve!.points.length).toBeGreaterThan(3);

    await ctrl.save('baseline');
    expect(states[states.length - 1].kind).toBe('saved');

    vi.useRealTimers();
  });

  it('discard() marks the run aborted', async () => {
    vi.useFakeTimers();
    const { vehicleId, calibrationId } = await setup(db);
    const sensor = new MockSpeedSource('mock', buildScript());
    const ctrl = new RunController({
      sensor,
      vehicleRepository: new VehicleRepository(db),
      calibrationRepository: new CalibrationRepository(db),
      runRepository: new RunRepository(db),
      sampleRepository: new SampleRepository(db),
      derivedCurveRepository: new DerivedCurveRepository(db),
      onStateChange: () => {},
    });
    await ctrl.ready(vehicleId, calibrationId);
    await ctrl.start();
    await vi.advanceTimersByTimeAsync(12000);
    await vi.runAllTimersAsync();
    await ctrl.discard();
    expect(ctrl.getState().kind).toBe('aborted');
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `npm test -- run-controller` → FAIL.

- [ ] **Step 3: Implement**

```ts
import { AutoStopDetector } from './auto-stop-detector';
import { runReducer, initialRunState, type RunEvent } from './run-state-machine';
import { DEFAULT_AUTO_STOP_CONFIG, type AutoStopConfig, type RunState } from './types';
import type { SpeedSource, SensorSample, SpeedValue } from '@/sensors/types';
import type { Unsubscribe } from '@/shared/observable';
import type { VehicleRepository } from '@/storage/repositories/vehicle-repository';
import type { CalibrationRepository } from '@/storage/repositories/calibration-repository';
import type { RunRepository } from '@/storage/repositories/run-repository';
import type { SampleRepository } from '@/storage/repositories/sample-repository';
import type { DerivedCurveRepository } from '@/storage/repositories/derived-curve-repository';
import type { Calibration, Sample } from '@/shared/types';
import { analyzeRun } from '@/analysis/pipeline';
import { nowIso } from '@/shared/iso-time';

export interface RunControllerOptions {
  sensor: SpeedSource;
  vehicleRepository: VehicleRepository;
  calibrationRepository: CalibrationRepository;
  runRepository: RunRepository;
  sampleRepository: SampleRepository;
  derivedCurveRepository: DerivedCurveRepository;
  autoStop?: AutoStopConfig;
  onStateChange: (state: RunState) => void;
  onLiveSample?: (s: { t_ms: number; speed_mps: number; rpm: number }) => void;
}

export class RunController {
  private state: RunState = initialRunState();
  private detector: AutoStopDetector;
  private unsub: Unsubscribe | null = null;
  private samples: Sample[] = [];
  private calibration: Calibration | null = null;

  constructor(private readonly opts: RunControllerOptions) {
    this.detector = new AutoStopDetector(opts.autoStop ?? DEFAULT_AUTO_STOP_CONFIG);
  }

  getState(): RunState {
    return this.state;
  }

  async ready(vehicleId: string, calibrationId: string): Promise<void> {
    const cal = await this.opts.calibrationRepository.get(calibrationId);
    if (!cal) throw new Error(`calibration not found: ${calibrationId}`);
    this.calibration = cal;
    this.transition({
      type: 'READY',
      vehicle_id: vehicleId,
      calibration_id: cal.id,
      gear_label: cal.gear_label,
    });
  }

  async start(): Promise<void> {
    if (this.state.kind !== 'ready') throw new Error('start() requires ready state');
    if (!this.calibration) throw new Error('no calibration');
    const run = await this.opts.runRepository.create({
      vehicle_id: this.state.vehicle_id,
      calibration_id: this.state.calibration_id,
      gear_label: this.state.gear_label,
      conditions: {},
      notes: '',
    });
    this.detector.reset();
    this.samples = [];
    this.transition({ type: 'START', run_id: run.id, now_ms: 0 });

    this.unsub = this.opts.sensor.samples$.subscribe((s) => this.onSample(s, run.id));
    await this.opts.sensor.start();
  }

  async save(notes: string): Promise<void> {
    if (this.state.kind !== 'reviewing') throw new Error('save() requires reviewing state');
    const runId = this.state.run_id;
    await this.opts.runRepository.markComplete(runId);
    if (notes) {
      await this.opts.runRepository.updateNotes(runId, notes);
    }
    this.transition({ type: 'SAVE' });
  }

  async discard(): Promise<void> {
    if (this.state.kind === 'reviewing') {
      await this.opts.runRepository.markAborted(this.state.run_id);
      this.transition({ type: 'DISCARD' });
    } else if (this.state.kind === 'running') {
      await this.opts.runRepository.markAborted(this.state.run_id);
      this.transition({ type: 'ABORT' });
    }
  }

  reset(): void {
    this.transition({ type: 'RESET' });
    this.samples = [];
    this.calibration = null;
  }

  private onSample(s: SensorSample<SpeedValue>, run_id: string): void {
    if (this.state.kind !== 'running') return;
    if (!this.calibration) return;

    const sample: Sample = {
      run_id,
      t_ms: s.t_ms,
      speed_mps: s.value.speed_mps,
      accel_long_ms2: null,
      accel_vert_ms2: null,
      lat: null,
      lon: null,
      hdop: null,
    };
    this.samples.push(sample);
    this.detector.push({ t_ms: s.t_ms, speed_mps: s.value.speed_mps });

    if (this.opts.onLiveSample) {
      const rpm = (s.value.speed_mps / this.calibration.rollout_m_per_rev) * 60;
      this.opts.onLiveSample({ t_ms: s.t_ms, speed_mps: s.value.speed_mps, rpm });
    }

    if (this.detector.check(s.t_ms)) {
      void this.finishRun();
    }
  }

  async stopNow(): Promise<void> {
    if (this.state.kind === 'running') {
      await this.finishRun();
    }
  }

  private async finishRun(): Promise<void> {
    if (this.state.kind !== 'running') return;
    const runId = this.state.run_id;
    this.unsub?.();
    this.unsub = null;
    await this.opts.sensor.stop();
    await this.opts.runRepository.finalize(runId, nowIso());
    this.transition({ type: 'STOP' });

    if (!this.calibration) throw new Error('no calibration during analysis');
    const vehicle = await this.opts.vehicleRepository.get(this.calibration.vehicle_id);
    if (!vehicle) throw new Error('vehicle not found during analysis');

    await this.opts.sampleRepository.insertMany(this.samples);
    const result = analyzeRun({
      samples: this.samples.map((s) => ({ t_ms: s.t_ms, speed_mps: s.speed_mps })),
      mass_kg: vehicle.mass_kg,
      rollout_m_per_rev: this.calibration.rollout_m_per_rev,
    });
    await this.opts.derivedCurveRepository.upsert({
      run_id: runId,
      rpm_min: result.rpm_min,
      rpm_max: result.rpm_max,
      points: result.points,
      pipeline_version: result.pipeline_version,
      computed_at: nowIso(),
    });
    this.transition({ type: 'ANALYSIS_DONE' });
  }

  private transition(event: RunEvent): void {
    this.state = runReducer(this.state, event);
    this.opts.onStateChange(this.state);
  }
}
```

- [ ] **Step 4: Run, expect PASS**

Run: `npm test -- run-controller` → 2 passed.

- [ ] **Step 5: Commit**

```bash
git -c user.email=gutelkaune+claude@gmail.com -c user.name="DynoRun" commit -am "feat(run): RunController with auto-stop and pipeline integration"
```

---

## Phase D — Streaming chart component

### Task 10: StreamingChart component

**Files:**
- Create: `src/ui/components/streaming-chart.tsx`

This is a uPlot wrapper that exposes an imperative `pushSample(t_ms, speed_kmh, rpm)` so React doesn't re-render at 10 Hz. It maintains a rolling window (default 30 s).

- [ ] **Step 1: Implement**

```tsx
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';

export interface StreamingChartHandle {
  pushSample(t_ms: number, speed_kmh: number, rpm: number): void;
  reset(): void;
}

interface StreamingChartProps {
  windowSeconds?: number;
}

export const StreamingChart = forwardRef<StreamingChartHandle, StreamingChartProps>(
  function StreamingChart({ windowSeconds = 30 }, ref) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const plotRef = useRef<uPlot | null>(null);
    const tsRef = useRef<number[]>([]);
    const speedsRef = useRef<number[]>([]);
    const rpmsRef = useRef<number[]>([]);

    useEffect(() => {
      if (!containerRef.current) return;
      const opts: uPlot.Options = {
        width: containerRef.current.clientWidth,
        height: 280,
        scales: {
          x: { time: false },
          speed: {},
          rpm: {},
        },
        axes: [
          { label: 'Time (s)' },
          { label: 'Speed (km/h)', scale: 'speed' },
          { label: 'RPM', side: 1, scale: 'rpm', grid: { show: false } },
        ],
        series: [
          {},
          { label: 'Speed (km/h)', stroke: '#1f77b4', width: 2, scale: 'speed' },
          { label: 'RPM', stroke: '#d62728', width: 2, scale: 'rpm' },
        ],
      };
      const data: uPlot.AlignedData = [[], [], []];
      plotRef.current = new uPlot(opts, data, containerRef.current);
      return () => { plotRef.current?.destroy(); plotRef.current = null; };
    }, []);

    useImperativeHandle(ref, () => ({
      pushSample(t_ms, speed_kmh, rpm) {
        const t = t_ms / 1000;
        tsRef.current.push(t);
        speedsRef.current.push(speed_kmh);
        rpmsRef.current.push(rpm);
        const cutoff = t - windowSeconds;
        while (tsRef.current.length > 0 && tsRef.current[0] < cutoff) {
          tsRef.current.shift();
          speedsRef.current.shift();
          rpmsRef.current.shift();
        }
        plotRef.current?.setData([tsRef.current, speedsRef.current, rpmsRef.current]);
      },
      reset() {
        tsRef.current = [];
        speedsRef.current = [];
        rpmsRef.current = [];
        plotRef.current?.setData([[], [], []]);
      },
    }), [windowSeconds]);

    return <div ref={containerRef} />;
  },
);
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck` → exit 0.

- [ ] **Step 3: Commit**

```bash
git -c user.email=gutelkaune+claude@gmail.com -c user.name="DynoRun" commit -am "feat(ui): StreamingChart component with imperative pushSample"
```

---

## Phase E — Calibration wizard UI

### Task 11: Calibration wizard screen (host + step 1)

**Files:**
- Create: `src/ui/calibration/calibration-wizard-screen.tsx`
- Create: `src/ui/calibration/calibration-step-gear.tsx`

- [ ] **Step 1: Implement step 1 (`calibration-step-gear.tsx`)**

```tsx
import { useState } from 'react';

export interface GearInput {
  gear_label: string;
  user_rpm: number;
}

export function CalibrationStepGear({ onSubmit }: { onSubmit: (g: GearInput) => void }) {
  const [gearLabel, setGearLabel] = useState('3rd');
  const [rpm, setRpm] = useState('3000');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = parseFloat(rpm);
    if (!gearLabel.trim() || !isFinite(r) || r <= 0) return;
    onSubmit({ gear_label: gearLabel.trim(), user_rpm: r });
  }

  return (
    <form onSubmit={submit}>
      <h2>Step 1 — Choose gear and target RPM</h2>
      <label>
        Gear
        <input value={gearLabel} onChange={(e) => setGearLabel(e.target.value)} />
      </label>
      <label>
        Target RPM (you'll hold this steady)
        <input value={rpm} inputMode="decimal" onChange={(e) => setRpm(e.target.value)} />
      </label>
      <button type="submit">Next</button>
    </form>
  );
}
```

- [ ] **Step 2: Scaffold the wizard host (`calibration-wizard-screen.tsx`)**

```tsx
import { useParams, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { CalibrationStepGear, type GearInput } from './calibration-step-gear';
import { CalibrationStepMeasure } from './calibration-step-measure';
import { CalibrationStepConfirm } from './calibration-step-confirm';
import type { Calibration } from '@/shared/types';

type WizardStep = 'gear' | 'measure' | 'confirm';

export function CalibrationWizardScreen() {
  const { vehicleId = '' } = useParams();
  const navigate = useNavigate();
  const [step, setStep] = useState<WizardStep>('gear');
  const [gear, setGear] = useState<GearInput | null>(null);
  const [calibration, setCalibration] = useState<Calibration | null>(null);

  return (
    <section>
      <h1>New Calibration</h1>
      {step === 'gear' && (
        <CalibrationStepGear onSubmit={(g) => { setGear(g); setStep('measure'); }} />
      )}
      {step === 'measure' && gear && (
        <CalibrationStepMeasure
          vehicleId={vehicleId}
          gear={gear}
          onConfirmed={(cal) => { setCalibration(cal); setStep('confirm'); }}
          onCancel={() => navigate(-1)}
        />
      )}
      {step === 'confirm' && calibration && (
        <CalibrationStepConfirm
          calibration={calibration}
          onDone={() => navigate(`/vehicles/${vehicleId}`)}
        />
      )}
    </section>
  );
}
```

(The two screens used here are created in the next tasks; typecheck will fail until they exist. That's expected.)

- [ ] **Step 3: Commit**

```bash
git add -A
git -c user.email=gutelkaune+claude@gmail.com -c user.name="DynoRun" commit -m "feat(ui): calibration wizard scaffold + step 1"
```

### Task 12: Calibration step 2 (measure)

**Files:**
- Create: `src/ui/calibration/calibration-step-measure.tsx`
- Test: `tests/ui/calibration-wizard.test.tsx`

- [ ] **Step 1: Write failing integration test**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { createWebDatabase } from '@/storage/database-web';
import { runMigrations } from '@/storage/migrations/runner';
import { DbContext } from '@/storage/db-context';
import { VehicleRepository } from '@/storage/repositories/vehicle-repository';
import { CalibrationRepository } from '@/storage/repositories/calibration-repository';
import { CalibrationWizardScreen } from '@/ui/calibration/calibration-wizard-screen';
import { SpeedSourceContext } from '@/ui/calibration/speed-source-context';
import { MockSpeedSource } from '@/sensors/mock-speed-source';

async function setup() {
  const db = await createWebDatabase(':memory:');
  await runMigrations(db);
  const v = await new VehicleRepository(db).create({
    name: 'Civic', kind: 'car', mass_kg: 1300, drivetrain: 'fwd',
    frontal_area_m2: null, drag_coefficient: null, notes: '',
  });
  return { db, vehicleId: v.id };
}

describe('CalibrationWizardScreen', () => {
  it('captures a steady speed and persists a calibration', async () => {
    vi.useFakeTimers();
    const { db, vehicleId } = await setup();
    const samples = Array.from({ length: 16 }, (_, i) => ({
      t_ms: i * 500,
      value: { speed_mps: 22.22 },
      quality: 1,
    }));
    const speedSrc = new MockSpeedSource('mock', samples);

    render(
      <DbContext.Provider value={db}>
        <SpeedSourceContext.Provider value={() => speedSrc}>
          <MemoryRouter initialEntries={[`/vehicles/${vehicleId}/calibrations/new`]}>
            <Routes>
              <Route path="/vehicles/:vehicleId/calibrations/new" element={<CalibrationWizardScreen />} />
              <Route path="/vehicles/:vehicleId" element={<div>vehicle detail</div>} />
            </Routes>
          </MemoryRouter>
        </SpeedSourceContext.Provider>
      </DbContext.Provider>,
    );

    // Step 1: choose gear and RPM
    fireEvent.change(screen.getByLabelText(/gear/i), { target: { value: '3rd' } });
    fireEvent.change(screen.getByLabelText(/target rpm/i), { target: { value: '3000' } });
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    // Step 2: start measurement, advance time until stability
    fireEvent.click(await screen.findByRole('button', { name: /start measurement/i }));
    await vi.advanceTimersByTimeAsync(8000);

    // Confirm button should appear after stability is detected
    const confirm = await waitFor(() => screen.getByRole('button', { name: /save calibration/i }));
    fireEvent.click(confirm);

    // Step 3: done
    await waitFor(() => expect(screen.getByText(/vehicle detail/i)).toBeInTheDocument());

    const persisted = await new CalibrationRepository(db).listByVehicle(vehicleId);
    expect(persisted).toHaveLength(1);
    expect(persisted[0].rpm).toBe(3000);
    expect(persisted[0].speed_kmh).toBeCloseTo(80, 0);

    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run, expect FAIL (modules missing)**

Run: `npm test -- calibration-wizard` → FAIL.

- [ ] **Step 3: Create the speed-source context**

`src/ui/calibration/speed-source-context.tsx`:

```tsx
import { createContext, useContext } from 'react';
import type { SpeedSource } from '@/sensors/types';
import { GpsSpeedSource } from '@/sensors/gps-speed-source';

export type SpeedSourceFactory = () => SpeedSource;

export const SpeedSourceContext = createContext<SpeedSourceFactory>(() => new GpsSpeedSource());

export function useSpeedSourceFactory(): SpeedSourceFactory {
  return useContext(SpeedSourceContext);
}
```

- [ ] **Step 4: Implement `src/ui/calibration/calibration-step-measure.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import { useDatabase } from '@/storage/db-context';
import { CalibrationRepository } from '@/storage/repositories/calibration-repository';
import { CalibrationController } from '@/run/calibration-controller';
import { useSpeedSourceFactory } from './speed-source-context';
import type { GearInput } from './calibration-step-gear';
import type { Calibration } from '@/shared/types';
import type { CalibrationState } from '@/run/types';

interface Props {
  vehicleId: string;
  gear: GearInput;
  onConfirmed: (cal: Calibration) => void;
  onCancel: () => void;
}

export function CalibrationStepMeasure({ vehicleId, gear, onConfirmed, onCancel }: Props) {
  const db = useDatabase();
  const speedSourceFactory = useSpeedSourceFactory();
  const [state, setState] = useState<CalibrationState>({ kind: 'idle' });
  const ctrlRef = useRef<CalibrationController | null>(null);

  useEffect(() => {
    return () => {
      ctrlRef.current?.stop().catch(() => {});
      ctrlRef.current = null;
    };
  }, []);

  async function start() {
    const sensor = speedSourceFactory();
    const ctrl = new CalibrationController({
      vehicleId,
      speedSource: sensor,
      calibrationRepository: new CalibrationRepository(db),
      onStateChange: setState,
    });
    ctrlRef.current = ctrl;
    await ctrl.start({ gear_label: gear.gear_label, user_rpm: gear.user_rpm });
  }

  async function confirm() {
    if (!ctrlRef.current) return;
    const cal = await ctrlRef.current.confirm();
    await ctrlRef.current.stop();
    onConfirmed(cal);
  }

  return (
    <section>
      <h2>Step 2 — Hold steady at {gear.user_rpm} RPM in {gear.gear_label}</h2>
      <p>Drive at a constant {gear.user_rpm} RPM. The app will capture your speed when it stabilizes.</p>
      {state.kind === 'idle' && (
        <button onClick={start}>Start measurement</button>
      )}
      {state.kind === 'measuring' && (
        <p>Measuring… hold the RPM steady.</p>
      )}
      {state.kind === 'stable' && (
        <div>
          <p>Captured speed: <strong>{state.captured_speed_kmh.toFixed(1)} km/h</strong></p>
          <button onClick={confirm}>Save calibration</button>
        </div>
      )}
      <button type="button" onClick={onCancel}>Cancel</button>
    </section>
  );
}
```

- [ ] **Step 5: Run test**

Run: `npm test -- calibration-wizard` → may still fail because step 3 is not yet implemented. Move on.

- [ ] **Step 6: Commit**

```bash
git add -A
git -c user.email=gutelkaune+claude@gmail.com -c user.name="DynoRun" commit -m "feat(ui): calibration step 2 (measure) + SpeedSourceContext"
```

### Task 13: Calibration step 3 (confirm)

**Files:**
- Create: `src/ui/calibration/calibration-step-confirm.tsx`

- [ ] **Step 1: Implement**

```tsx
import type { Calibration } from '@/shared/types';

export function CalibrationStepConfirm({ calibration, onDone }: { calibration: Calibration; onDone: () => void }) {
  return (
    <section>
      <h2>Step 3 — Done</h2>
      <p>Saved calibration for gear <strong>{calibration.gear_label}</strong>:</p>
      <ul>
        <li>{calibration.rpm} RPM @ {calibration.speed_kmh.toFixed(1)} km/h</li>
        <li>Rollout: {calibration.rollout_m_per_rev.toFixed(4)} m/rev</li>
      </ul>
      <button onClick={onDone}>Done</button>
    </section>
  );
}
```

- [ ] **Step 2: Run the wizard test**

Run: `npm test -- calibration-wizard` → 1 passed.

- [ ] **Step 3: Commit**

```bash
git add -A
git -c user.email=gutelkaune+claude@gmail.com -c user.name="DynoRun" commit -m "feat(ui): calibration step 3 (confirm)"
```

---

## Phase F — Live run UI

### Task 14: Live run screen

**Files:**
- Create: `src/ui/run/live-run-screen.tsx`
- Test: `tests/ui/live-run-screen.test.tsx`

- [ ] **Step 1: Write failing integration test**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { createWebDatabase } from '@/storage/database-web';
import { runMigrations } from '@/storage/migrations/runner';
import { DbContext } from '@/storage/db-context';
import { VehicleRepository } from '@/storage/repositories/vehicle-repository';
import { CalibrationRepository } from '@/storage/repositories/calibration-repository';
import { LiveRunScreen } from '@/ui/run/live-run-screen';
import { SpeedSourceContext } from '@/ui/calibration/speed-source-context';
import { MockSpeedSource } from '@/sensors/mock-speed-source';

async function setup() {
  const db = await createWebDatabase(':memory:');
  await runMigrations(db);
  const v = await new VehicleRepository(db).create({
    name: 'Civic', kind: 'car', mass_kg: 1300, drivetrain: 'fwd',
    frontal_area_m2: null, drag_coefficient: null, notes: '',
  });
  const c = await new CalibrationRepository(db).create({
    vehicle_id: v.id, gear_label: '3rd', rpm: 3000, speed_kmh: 80, notes: '',
  });
  return { db, vehicleId: v.id, calibrationId: c.id };
}

function buildScript() {
  const out = [];
  let v = 30 / 3.6;
  let t = 0;
  for (; t <= 1000; t += 100) out.push({ t_ms: t, value: { speed_mps: v }, quality: 1 });
  for (; t <= 9000; t += 100) {
    v += 2 * 0.1;
    out.push({ t_ms: t, value: { speed_mps: v }, quality: 1 });
  }
  for (; t <= 11000; t += 100) out.push({ t_ms: t, value: { speed_mps: v }, quality: 1 });
  return out;
}

describe('LiveRunScreen', () => {
  it('records, auto-stops, analyzes, and shows the review state', async () => {
    vi.useFakeTimers();
    const { db, vehicleId, calibrationId } = await setup();
    const speedSrc = new MockSpeedSource('mock', buildScript());

    render(
      <DbContext.Provider value={db}>
        <SpeedSourceContext.Provider value={() => speedSrc}>
          <MemoryRouter initialEntries={[`/vehicles/${vehicleId}/calibrations/${calibrationId}/run`]}>
            <Routes>
              <Route
                path="/vehicles/:vehicleId/calibrations/:calibrationId/run"
                element={<LiveRunScreen />}
              />
              <Route path="/vehicles/:vehicleId" element={<div>vehicle detail</div>} />
              <Route path="/runs/:runId/review" element={<div>review</div>} />
            </Routes>
          </MemoryRouter>
        </SpeedSourceContext.Provider>
      </DbContext.Provider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: /start run/i }));
    await vi.advanceTimersByTimeAsync(12000);
    await vi.runAllTimersAsync();

    await waitFor(() => expect(screen.getByText(/review/i)).toBeInTheDocument());

    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `npm test -- live-run-screen` → FAIL.

- [ ] **Step 3: Implement `src/ui/run/live-run-screen.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useDatabase } from '@/storage/db-context';
import { VehicleRepository } from '@/storage/repositories/vehicle-repository';
import { CalibrationRepository } from '@/storage/repositories/calibration-repository';
import { RunRepository } from '@/storage/repositories/run-repository';
import { SampleRepository } from '@/storage/repositories/sample-repository';
import { DerivedCurveRepository } from '@/storage/repositories/derived-curve-repository';
import { RunController } from '@/run/run-controller';
import { WakeLock } from '@/app/wake-lock';
import { useSpeedSourceFactory } from '@/ui/calibration/speed-source-context';
import { StreamingChart, type StreamingChartHandle } from '@/ui/components/streaming-chart';
import { mpsToKmh } from '@/shared/units';
import type { RunState } from '@/run/types';

export function LiveRunScreen() {
  const { vehicleId = '', calibrationId = '' } = useParams();
  const db = useDatabase();
  const speedSourceFactory = useSpeedSourceFactory();
  const navigate = useNavigate();
  const [state, setState] = useState<RunState>({ kind: 'idle' });
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [currentRpm, setCurrentRpm] = useState(0);
  const ctrlRef = useRef<RunController | null>(null);
  const chartRef = useRef<StreamingChartHandle>(null);
  const wakeLockRef = useRef(new WakeLock());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sensor = speedSourceFactory();
      const ctrl = new RunController({
        sensor,
        vehicleRepository: new VehicleRepository(db),
        calibrationRepository: new CalibrationRepository(db),
        runRepository: new RunRepository(db),
        sampleRepository: new SampleRepository(db),
        derivedCurveRepository: new DerivedCurveRepository(db),
        onStateChange: (s) => {
          if (!cancelled) setState(s);
          if (s.kind === 'reviewing') {
            navigate(`/runs/${s.run_id}/review`);
          }
        },
        onLiveSample: ({ t_ms, speed_mps, rpm }) => {
          const sKmh = mpsToKmh(speed_mps);
          setCurrentSpeed(sKmh);
          setCurrentRpm(rpm);
          chartRef.current?.pushSample(t_ms, sKmh, rpm);
        },
      });
      ctrlRef.current = ctrl;
      await ctrl.ready(vehicleId, calibrationId);
    })();
    return () => {
      cancelled = true;
      void ctrlRef.current?.stopNow();
      void wakeLockRef.current.release();
    };
  }, [db, vehicleId, calibrationId, speedSourceFactory, navigate]);

  async function startRun() {
    if (!ctrlRef.current) return;
    await wakeLockRef.current.acquire();
    chartRef.current?.reset();
    await ctrlRef.current.start();
  }

  async function stopRun() {
    if (!ctrlRef.current) return;
    await ctrlRef.current.stopNow();
  }

  return (
    <section>
      <h1>Run</h1>
      <p style={{ fontSize: 48, margin: 0 }}>
        <strong>{currentSpeed.toFixed(0)}</strong> km/h
      </p>
      <p style={{ fontSize: 24, margin: 0 }}>{currentRpm.toFixed(0)} RPM</p>
      <StreamingChart ref={chartRef} />
      {state.kind === 'ready' && <button onClick={startRun}>Start run</button>}
      {state.kind === 'running' && <button onClick={stopRun}>Stop</button>}
      {state.kind === 'analyzing' && <p>Analyzing…</p>}
    </section>
  );
}
```

- [ ] **Step 4: Run test**

Run: `npm test -- live-run-screen` → 1 passed.

- [ ] **Step 5: Commit**

```bash
git -c user.email=gutelkaune+claude@gmail.com -c user.name="DynoRun" commit -am "feat(ui): LiveRunScreen with streaming chart and auto-stop"
```

### Task 15: Run review screen

**Files:**
- Create: `src/ui/run/run-review-screen.tsx`
- Test: `tests/ui/run-review-screen.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { createWebDatabase } from '@/storage/database-web';
import { runMigrations } from '@/storage/migrations/runner';
import { DbContext } from '@/storage/db-context';
import { VehicleRepository } from '@/storage/repositories/vehicle-repository';
import { CalibrationRepository } from '@/storage/repositories/calibration-repository';
import { RunRepository } from '@/storage/repositories/run-repository';
import { DerivedCurveRepository } from '@/storage/repositories/derived-curve-repository';
import { RunReviewScreen } from '@/ui/run/run-review-screen';

async function setup() {
  const db = await createWebDatabase(':memory:');
  await runMigrations(db);
  const v = await new VehicleRepository(db).create({
    name: 'Civic', kind: 'car', mass_kg: 1300, drivetrain: 'fwd',
    frontal_area_m2: null, drag_coefficient: null, notes: '',
  });
  const c = await new CalibrationRepository(db).create({
    vehicle_id: v.id, gear_label: '3rd', rpm: 3000, speed_kmh: 80, notes: '',
  });
  const r = await new RunRepository(db).create({
    vehicle_id: v.id, calibration_id: c.id, gear_label: '3rd', conditions: {}, notes: '',
  });
  await new DerivedCurveRepository(db).upsert({
    run_id: r.id,
    rpm_min: 2000, rpm_max: 6000,
    points: [
      { rpm: 2000, wheel_power_kw: 40, wheel_torque_nm: 190 },
      { rpm: 4000, wheel_power_kw: 80, wheel_torque_nm: 191 },
      { rpm: 6000, wheel_power_kw: 100, wheel_torque_nm: 160 },
    ],
    pipeline_version: 1,
    computed_at: '2026-05-24T00:00:00Z',
  });
  return { db, runId: r.id, vehicleId: v.id };
}

describe('RunReviewScreen', () => {
  it('renders the curve and saves notes', async () => {
    const { db, runId, vehicleId } = await setup();
    render(
      <DbContext.Provider value={db}>
        <MemoryRouter initialEntries={[`/runs/${runId}/review`]}>
          <Routes>
            <Route path="/runs/:runId/review" element={<RunReviewScreen />} />
            <Route path="/vehicles/:vehicleId" element={<div>vehicle detail</div>} />
          </Routes>
        </MemoryRouter>
      </DbContext.Provider>,
    );
    expect(await screen.findByText(/Peak power/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/notes/i), { target: { value: 'baseline' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(screen.getByText(/vehicle detail/i)).toBeInTheDocument());
    const saved = await new RunRepository(db).get(runId);
    expect(saved?.notes).toBe('baseline');
    expect(saved?.status).toBe('complete');
    expect(vehicleId).toBeDefined();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `npm test -- run-review-screen` → FAIL.

- [ ] **Step 3: Implement `src/ui/run/run-review-screen.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useDatabase } from '@/storage/db-context';
import { RunRepository } from '@/storage/repositories/run-repository';
import { DerivedCurveRepository } from '@/storage/repositories/derived-curve-repository';
import { PowerCurveChart } from '@/ui/components/power-curve-chart';
import type { Run, DerivedCurve } from '@/shared/types';

export function RunReviewScreen() {
  const { runId = '' } = useParams();
  const db = useDatabase();
  const navigate = useNavigate();
  const [run, setRun] = useState<Run | null>(null);
  const [curve, setCurve] = useState<DerivedCurve | null>(null);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    (async () => {
      const r = await new RunRepository(db).get(runId);
      const c = await new DerivedCurveRepository(db).getByRun(runId);
      setRun(r);
      setCurve(c);
      if (r) setNotes(r.notes);
    })();
  }, [db, runId]);

  if (!run || !curve) return <p>Loading…</p>;

  const peak = curve.points.reduce(
    (best, p) => (p.wheel_power_kw > best.wheel_power_kw ? p : best),
    curve.points[0],
  );

  async function save() {
    if (!run) return;
    const repo = new RunRepository(db);
    await repo.updateNotes(run.id, notes);
    await repo.markComplete(run.id);
    navigate(`/vehicles/${run.vehicle_id}`);
  }

  async function discard() {
    if (!run) return;
    await new RunRepository(db).markAborted(run.id);
    navigate(`/vehicles/${run.vehicle_id}`);
  }

  return (
    <section>
      <h1>Run review</h1>
      <p>Peak power: <strong>{peak.wheel_power_kw.toFixed(1)} kW</strong> @ {peak.rpm.toFixed(0)} RPM</p>
      <PowerCurveChart points={curve.points} />
      <label>
        Notes
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <div>
        <button onClick={save}>Save</button>
        <button onClick={discard}>Discard</button>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run test**

Run: `npm test -- run-review-screen` → 1 passed.

- [ ] **Step 5: Commit**

```bash
git add -A
git -c user.email=gutelkaune+claude@gmail.com -c user.name="DynoRun" commit -m "feat(ui): RunReviewScreen with save/discard"
```

---

## Phase G — Wire into existing UI

### Task 16: VehicleDetail buttons + App routes

**Files:**
- Modify: `src/ui/garage/vehicle-detail.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Modify `vehicle-detail.tsx`** to add "New Calibration" and "New Run" buttons. Replace the existing file with:

```tsx
import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useDatabase } from '@/storage/db-context';
import { VehicleRepository } from '@/storage/repositories/vehicle-repository';
import { CalibrationRepository } from '@/storage/repositories/calibration-repository';
import { RunRepository } from '@/storage/repositories/run-repository';
import type { Vehicle, Calibration, Run } from '@/shared/types';

export function VehicleDetail() {
  const { id } = useParams<{ id: string }>();
  const db = useDatabase();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [cals, setCals] = useState<Calibration[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setVehicle(await new VehicleRepository(db).get(id));
      setCals(await new CalibrationRepository(db).listByVehicle(id));
      setRuns(await new RunRepository(db).listByVehicle(id));
    })();
  }, [id, db]);

  if (!vehicle) return <p>Loading…</p>;

  return (
    <section>
      <p><Link to="/">← Garage</Link></p>
      <h1>{vehicle.name}</h1>
      <p>{vehicle.kind}, {vehicle.mass_kg} kg, {vehicle.drivetrain}</p>

      <h2>Calibrations ({cals.length})</h2>
      <ul>
        {cals.map((c) => (
          <li key={c.id}>
            {c.gear_label}: {c.rpm} RPM @ {c.speed_kmh.toFixed(1)} km/h{' '}
            <Link to={`/vehicles/${vehicle.id}/calibrations/${c.id}/run`}>New run</Link>
          </li>
        ))}
      </ul>
      <p><Link to={`/vehicles/${vehicle.id}/calibrations/new`}>+ New calibration</Link></p>

      <h2>Runs ({runs.length})</h2>
      <ul>
        {runs.map((r) => (
          <li key={r.id}>
            {r.started_at} — {r.gear_label} — {r.status}{' '}
            {r.status !== 'aborted' && <Link to={`/runs/${r.id}/review`}>review</Link>}
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 2: Modify `src/App.tsx`** to add the new routes:

```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { DbProvider } from './storage/db-context';
import { AppShell } from './ui/app-shell';
import { GarageScreen } from './ui/garage/garage-screen';
import { VehicleDetail } from './ui/garage/vehicle-detail';
import { FixtureReplayScreen } from './ui/fixture-replay/fixture-replay-screen';
import { CalibrationWizardScreen } from './ui/calibration/calibration-wizard-screen';
import { LiveRunScreen } from './ui/run/live-run-screen';
import { RunReviewScreen } from './ui/run/run-review-screen';

export default function App() {
  return (
    <DbProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<GarageScreen />} />
            <Route path="/vehicles/:id" element={<VehicleDetail />} />
            <Route path="/vehicles/:vehicleId/calibrations/new" element={<CalibrationWizardScreen />} />
            <Route path="/vehicles/:vehicleId/calibrations/:calibrationId/run" element={<LiveRunScreen />} />
            <Route path="/runs/:runId/review" element={<RunReviewScreen />} />
            <Route path="/replay" element={<FixtureReplayScreen />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </DbProvider>
  );
}
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck` → exit 0.
Run: `npm test` → all tests pass (expected ~74: 49 prior + tests added in this plan).
Run: `npm run build` → exit 0.

- [ ] **Step 4: Commit**

```bash
git add -A
git -c user.email=gutelkaune+claude@gmail.com -c user.name="DynoRun" commit -m "feat(ui): wire calibration wizard and live run into VehicleDetail + routes"
```

---

## Phase H — Smoke test in browser

### Task 17: Manual browser smoke

This is a manual verification, not a test file.

- [ ] **Step 1: Build and serve**

Run: `npm run build && npm run preview` → opens preview server on a localhost port.

- [ ] **Step 2: In a browser at the preview URL, walk through:**

1. Add a vehicle (e.g. "Test", car, 1300 kg, FWD).
2. Open it; click "New calibration".
3. Step 1: gear "3rd", RPM "3000". Next.
4. Step 2: click "Start measurement". The browser will prompt for Location permission. Grant it. Drive (or, since this is a smoke test, you can use Chrome devtools → Sensors → set a static location, then change speed). When stability detects, the "Save calibration" button appears. Save.
5. Step 3: done. Back on vehicle detail.
6. From the calibration entry, click "New run" → live run view. Start. The streaming chart should update. Auto-stop after deceleration. Land on review.
7. Save the run with notes.

If you can't perform a real drive: the FixtureReplayScreen (`/replay`) still works as a static-data sanity check from Plan 1.

- [ ] **Step 3: No commit needed for manual verification.**

---

## Done

After all 17 tasks, the prototype supports the complete loop:

1. Add a vehicle.
2. Calibrate a gear (steady-RPM detection + persistence).
3. Drive a run with live telemetry and auto-stop.
4. Review the derived power/torque curve and save with notes.

**What's left (Plan 3):** multi-run overlay comparison, settings + JSON export, Capacitor packaging for iOS and Android with native plugins (background location, native SQLite, native wake lock), on-device smoke tests.

**Known follow-ups** (carried forward from Plan 1 review):
- `SensorRegistry` priority not yet exercised because Plan 2 doesn't introduce a second source per capability — this becomes relevant when OBD-II ships in Plan 3.
- `PowerCurveChart` does not respond to container resize — Plan 3 should add a `ResizeObserver`.
- `DbProvider` doesn't close DB on unmount — immaterial for SPA, but worth noting.
- `MotionAccelSource` is intentionally not built in Plan 2; auto-stop based on GPS-derived deceleration is sufficient.
