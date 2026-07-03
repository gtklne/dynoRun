import { describe, it, expect, vi } from 'vitest';
import { SessionController } from '@/run/session-controller';
import type { SessionState } from '@/run/types';
import { Subject } from '@/shared/observable';
import type { SpeedSource, SensorSample, SpeedValue, Capability } from '@/sensors/types';
import type {
  IVehicleRepository, ICalibrationRepository, IRunRepository, ISampleRepository, IDerivedCurveRepository,
} from '@/api/repositories/types';
import type { Vehicle, Calibration, Run, Sample, DerivedCurve } from '@/shared/types';
import { kmhToMps } from '@/shared/units';

class FakeSpeedSource implements SpeedSource {
  readonly id = 'fake';
  readonly capabilities: Capability[] = ['speed'];
  readonly samples$ = new Subject<SensorSample<SpeedValue>>();
  started = 0;
  stopped = 0;
  async start(): Promise<void> { this.started++; }
  async stop(): Promise<void> { this.stopped++; }
  emit(t_ms: number, speed_mps: number): void {
    this.samples$.next({ t_ms, value: { speed_mps, accuracy_m: 5, altitude_m: 400 }, quality: 1 });
  }
}

const vehicle: Vehicle = {
  id: 'v1', user_id: null, name: 'SV650', kind: 'motorcycle', mass_kg: 280,
  drivetrain: 'chain', frontal_area_m2: null, drag_coefficient: null, body_shape: null,
  notes: '', make: null, model: null, year: null, tire_label: null,
  power_hp_factory: null, transmission: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', synced_at: null,
};

const calibration: Calibration = {
  id: 'c1', user_id: null, vehicle_id: 'v1', gear_label: '4th', rpm: 4000, speed_kmh: 90,
  rollout_m_per_rev: kmhToMps(90) / (4000 / 60),
  recorded_at: '2026-01-01T00:00:00Z', notes: '',
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', synced_at: null,
};

interface Repos {
  vehicleRepository: IVehicleRepository;
  calibrationRepository: ICalibrationRepository;
  runRepository: IRunRepository;
  sampleRepository: ISampleRepository;
  derivedCurveRepository: IDerivedCurveRepository;
  runs: Run[];
  samples: Sample[];
  curves: DerivedCurve[];
}

function makeRepos(): Repos {
  const runs: Run[] = [];
  const samples: Sample[] = [];
  const curves: DerivedCurve[] = [];
  let seq = 0;
  return {
    runs, samples, curves,
    vehicleRepository: {
      create: vi.fn(), list: vi.fn(), update: vi.fn(), delete: vi.fn(),
      get: async (id) => (id === vehicle.id ? vehicle : null),
    },
    calibrationRepository: {
      create: vi.fn(), listByVehicle: vi.fn(), delete: vi.fn(),
      get: async (id) => (id === calibration.id ? calibration : null),
    },
    runRepository: {
      create: async (input) => {
        const run: Run = {
          id: `run-${++seq}`, user_id: null, vehicle_id: input.vehicle_id,
          calibration_id: input.calibration_id, started_at: '2026-07-03T10:00:00.000Z',
          ended_at: null, gear_label: input.gear_label, conditions: input.conditions,
          notes: input.notes, status: 'in_progress', title: null,
          peak_power_kw: null, peak_torque_nm: null, peak_power_rpm: null, share_token: null,
          created_at: '2026-07-03T10:00:00.000Z', updated_at: '2026-07-03T10:00:00.000Z', synced_at: null,
        };
        runs.push(run);
        return run;
      },
      get: async (id) => runs.find((r) => r.id === id) ?? null,
      listByVehicle: async () => runs,
      markDegraded: async (id) => { const r = runs.find((x) => x.id === id); if (r) r.status = 'degraded'; },
      markAborted: async (id) => { const r = runs.find((x) => x.id === id); if (r) r.status = 'aborted'; },
      markComplete: async (id) => { const r = runs.find((x) => x.id === id); if (r) r.status = 'complete'; },
      finalize: async (id, endedAt) => { const r = runs.find((x) => x.id === id); if (r) r.ended_at = endedAt; },
      updateNotes: async () => {},
      update: async (id, patch) => { const r = runs.find((x) => x.id === id); if (r) Object.assign(r, patch); },
      delete: async () => {},
    },
    sampleRepository: {
      insertMany: async (rows) => { samples.push(...rows); },
      listByRun: async (runId) => samples.filter((s) => s.run_id === runId),
      deleteByRun: async () => {},
    },
    derivedCurveRepository: {
      upsert: async (curve) => { curves.push(curve); },
      getByRun: async (runId) => curves.find((c) => c.run_id === runId) ?? null,
    },
  };
}

/** Feed a 1 Hz ride into the source: standstill → gentle ride → settle → hard pull → coast. */
function emitRide(source: FakeSpeedSource): void {
  let v = 0;
  let t = 0;
  const seg = (accel: number, seconds: number) => {
    for (let i = 0; i < seconds; i++) {
      v = Math.max(0, v + accel);
      t += 1000;
      source.emit(t, v);
    }
  };
  seg(0, 20);       // standing at the start line
  seg(1.0, 12);     // ride off gently (~43 km/h)
  seg(0, 15);       // settle in gear
  seg(3.0, 10);     // the pull (+108 km/h)
  seg(-1.5, 25);    // coast down
  seg(0, 10);
}

function makeController(repos: Repos, source: FakeSpeedSource, extra: Partial<ConstructorParameters<typeof SessionController>[0]> = {}) {
  const states: SessionState[] = [];
  const ctrl = new SessionController({
    sensor: source,
    vehicleRepository: repos.vehicleRepository,
    calibrationRepository: repos.calibrationRepository,
    runRepository: repos.runRepository,
    sampleRepository: repos.sampleRepository,
    derivedCurveRepository: repos.derivedCurveRepository,
    onStateChange: (s) => states.push(s),
    ...extra,
  });
  return { ctrl, states };
}

describe('SessionController', () => {
  it('warmup starts the sensor and reaches ready without buffering', async () => {
    const source = new FakeSpeedSource();
    const { ctrl } = makeController(makeRepos(), source);
    const live: number[] = [];
    const { ctrl: ctrl2 } = makeController(makeRepos(), source, { onLiveSample: (s) => live.push(s.speed_mps) });
    void ctrl;
    await ctrl2.warmup('v1', 'c1');
    expect(ctrl2.getState().kind).toBe('ready');
    expect(source.started).toBe(1);
    source.emit(1000, 5);
    expect(live).toEqual([5]);
  });

  it('records a session, detects the pulls, and reviews them', async () => {
    const source = new FakeSpeedSource();
    const repos = makeRepos();
    const recordings: unknown[] = [];
    const { ctrl } = makeController(repos, source, { onRecordingFinished: (r) => recordings.push(r) });
    await ctrl.warmup('v1', 'c1');
    ctrl.start();
    expect(ctrl.getState().kind).toBe('recording');
    emitRide(source);
    await ctrl.finish();

    const state = ctrl.getState();
    expect(state.kind).toBe('reviewing');
    if (state.kind !== 'reviewing') throw new Error('unreachable');
    // Gentle ride-off and the hard pull are both detected.
    expect(state.pulls.length).toBe(2);
    const hard = state.pulls[1];
    expect(hard.analysis).not.toBeNull();
    expect(hard.samples[0].t_ms).toBe(0);
    expect(hard.analysis!.points.length).toBeGreaterThan(0);
    // The recording envelope was handed off exactly once, with no run yet.
    expect(recordings).toHaveLength(1);
    expect(source.stopped).toBe(1);
  });

  it('saves selected pulls as complete runs with samples, curve and peaks', async () => {
    const source = new FakeSpeedSource();
    const repos = makeRepos();
    const { ctrl } = makeController(repos, source);
    await ctrl.warmup('v1', 'c1');
    ctrl.start();
    emitRide(source);
    await ctrl.finish();

    const runIds = await ctrl.saveSelected([1]);
    expect(runIds).toHaveLength(1);
    const state = ctrl.getState();
    expect(state).toEqual({ kind: 'saved', vehicle_id: 'v1', run_ids: runIds });

    const run = repos.runs[0];
    expect(run.status).toBe('complete');
    expect(run.gear_label).toBe('4th');
    expect(run.peak_power_kw).toBeGreaterThan(0);
    expect(run.peak_power_rpm).toBeGreaterThan(0);
    expect(run.ended_at).not.toBeNull();

    const rows = repos.samples.filter((s) => s.run_id === run.id);
    expect(rows.length).toBeGreaterThan(5);
    expect(rows[0].t_ms).toBe(0);
    expect(repos.curves).toHaveLength(1);
    expect(repos.curves[0].run_id).toBe(run.id);
    expect(repos.curves[0].points.length).toBeGreaterThan(0);
  });

  it('labels notes per pull when saving several', async () => {
    const source = new FakeSpeedSource();
    const repos = makeRepos();
    const { ctrl } = makeController(repos, source);
    await ctrl.warmup('v1', 'c1');
    ctrl.start();
    emitRide(source);
    await ctrl.finish();

    const runIds = await ctrl.saveSelected([0, 1]);
    expect(runIds).toHaveLength(2);
    expect(repos.runs[0].notes).toBe('Hands-free session — pull 1');
    expect(repos.runs[1].notes).toBe('Hands-free session — pull 2');
  });

  it('returns to reviewing when nothing could be saved', async () => {
    const source = new FakeSpeedSource();
    const repos = makeRepos();
    repos.runRepository.create = async () => { throw new Error('offline'); };
    const errors: unknown[] = [];
    const { ctrl } = makeController(repos, source, { onError: (e) => errors.push(e) });
    await ctrl.warmup('v1', 'c1');
    ctrl.start();
    emitRide(source);
    await ctrl.finish();

    const runIds = await ctrl.saveSelected([1]);
    expect(runIds).toEqual([]);
    expect(ctrl.getState().kind).toBe('reviewing');
    expect(errors).toHaveLength(1);
  });

  it('auto-finishes when the session exceeds the max duration', async () => {
    const source = new FakeSpeedSource();
    const repos = makeRepos();
    const { ctrl } = makeController(repos, source, { maxDurationMs: 10_000 });
    await ctrl.warmup('v1', 'c1');
    ctrl.start();
    for (let t = 1000; t <= 15_000; t += 1000) source.emit(t, 10);
    await vi.waitFor(() => expect(ctrl.getState().kind).toBe('reviewing'));
    expect(source.stopped).toBe(1);
  });

  it('dispose during recording still hands off the recording envelope', async () => {
    const source = new FakeSpeedSource();
    const recordings: unknown[] = [];
    const { ctrl } = makeController(makeRepos(), source, { onRecordingFinished: (r) => recordings.push(r) });
    await ctrl.warmup('v1', 'c1');
    ctrl.start();
    source.emit(1000, 5);
    await ctrl.dispose();
    expect(recordings).toHaveLength(1);
    expect(source.stopped).toBe(1);
  });
});
