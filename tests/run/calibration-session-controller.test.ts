import { describe, it, expect, vi } from 'vitest';
import {
  CalibrationSessionController,
  type CalibrationSessionControllerOptions,
} from '@/run/calibration-session-controller';
import {
  DEFAULT_STANDSTILL_CONFIG,
  PLAUSIBLE_ROLLOUT_M_PER_REV,
  type CalibrationSessionState,
} from '@/run/types';
import { DEFAULT_PLATEAU_DETECTION_CONFIG } from '@/analysis/plateau-detection';
import { Subject } from '@/shared/observable';
import type { SpeedSource, SensorSample, SpeedValue, Capability, SensorError } from '@/sensors/types';
import type { SensorRecording } from '@/sensors/recording';
import type { ICalibrationRepository, NewCalibration } from '@/api/repositories/types';
import type { Calibration } from '@/shared/types';
import { computeRollout } from '@/shared/units';

class FakeSpeedSource implements SpeedSource {
  readonly id = 'fake';
  readonly capabilities: Capability[] = ['speed'];
  readonly samples$ = new Subject<SensorSample<SpeedValue>>();
  readonly errors$ = new Subject<SensorError>();
  started = 0;
  stopped = 0;
  async start(): Promise<void> { this.started++; }
  async stop(): Promise<void> { this.stopped++; }
  emit(t_ms: number, speed_mps: number): void {
    this.samples$.next({ t_ms, value: { speed_mps, accuracy_m: 5, altitude_m: 400 }, quality: 1 });
  }
}

function makeRepo(opts: { fail?: boolean } = {}) {
  const created: NewCalibration[] = [];
  const create = vi.fn(async (input: NewCalibration): Promise<Calibration> => {
    created.push(input);
    if (opts.fail) throw new Error('offline');
    return {
      id: 'cal-1', user_id: null,
      vehicle_id: input.vehicle_id, gear_label: input.gear_label,
      rpm: input.rpm, speed_kmh: input.speed_kmh, notes: input.notes,
      rollout_m_per_rev: computeRollout(input.rpm, input.speed_kmh),
      recorded_at: '2026-08-01T09:00:00.000Z',
      created_at: '2026-08-01T09:00:00.000Z', updated_at: '2026-08-01T09:00:00.000Z',
      synced_at: null,
    };
  });
  const repo: ICalibrationRepository = {
    create,
    get: vi.fn(),
    listByVehicle: vi.fn(),
    delete: vi.fn(),
  };
  return { repo, create, created };
}

function makeController(
  repo: ICalibrationRepository,
  source: FakeSpeedSource,
  extra: Partial<CalibrationSessionControllerOptions> = {},
) {
  const states: CalibrationSessionState[] = [];
  const ctrl = new CalibrationSessionController({
    sensor: source,
    calibrationRepository: repo,
    onStateChange: (s) => states.push(s),
    ...extra,
  });
  return { ctrl, states };
}

interface Segment { accel: number; seconds: number }

/**
 * Feed a 1 Hz ride into the source, which is the cadence
 * `min_raw_coverage_hz` and `max_raw_gap_ms` are tuned for: at 200 ms the
 * detector would see the same shape but no fixture here would resemble GPS.
 */
function ride(source: FakeSpeedSource, segments: Segment[]): void {
  let v = 0;
  let t = 0;
  for (const seg of segments) {
    for (let i = 0; i < seg.seconds; i++) {
      v = Math.max(0, v + seg.accel);
      t += 1000;
      source.emit(t, v);
    }
  }
}

/**
 * The deliberate hold: roll out to 90 km/h, hold it 15 s (past
 * `min_duration_ms` with room to spare), then ease off. Every tail here stops
 * at 9 km/h rather than at zero, above `stopped_speed_kmh`, so no fixture
 * except the standstill ones can trip the auto-finish; drop a tail to 0 and the
 * assertions downstream quietly become auto-finish tests.
 */
const HOLD_AT_90: Segment[] = [
  { accel: 0, seconds: 5 },
  { accel: 2.5, seconds: 10 },
  { accel: 0, seconds: 15 },
  { accel: -2.5, seconds: 9 },
];

/** Accelerate, turn round, come back: nowhere is the speed steady. */
const NO_HOLD: Segment[] = [
  { accel: 3.0, seconds: 10 },
  { accel: -3.0, seconds: 9 },
];

/** Two holds far enough apart in speed to be two separate cues. */
const TWO_HOLDS: Segment[] = [
  { accel: 0, seconds: 3 },
  { accel: 2.5, seconds: 10 },   // to 90 km/h
  { accel: 0, seconds: 14 },
  { accel: -2.5, seconds: 4 },   // down to 54 km/h
  { accel: 0, seconds: 14 },
  { accel: -2.5, seconds: 5 },
];

const GEAR = { gear_label: '4th', user_rpm: 4000 };

async function recordRide(
  source: FakeSpeedSource,
  ctrl: CalibrationSessionController,
  segments: Segment[],
): Promise<void> {
  await ctrl.warmup('v1', GEAR);
  ctrl.start();
  ride(source, segments);
  await ctrl.finish();
}

function reviewing(ctrl: CalibrationSessionController) {
  const state = ctrl.getState();
  if (state.kind !== 'reviewing') throw new Error(`expected reviewing, got ${state.kind}`);
  return state;
}

describe('CalibrationSessionController', () => {
  it('warmup starts the sensor and reaches ready with the gear the rider entered', async () => {
    const source = new FakeSpeedSource();
    const live: Array<{ speed_kmh: number; recording: boolean }> = [];
    const { ctrl } = makeController(makeRepo().repo, source, {
      onLiveSample: (s) => live.push({ speed_kmh: s.speed_kmh, recording: s.recording }),
    });
    await ctrl.warmup('v1', GEAR);
    expect(ctrl.getState()).toEqual({
      kind: 'ready', vehicle_id: 'v1', gear_label: '4th', user_rpm: 4000,
    });
    expect(source.started).toBe(1);
    // Live samples flow before `start()`, and are flagged as not recorded.
    source.emit(1000, 10);
    expect(live).toEqual([{ speed_kmh: 36, recording: false }]);
    await ctrl.dispose();
  });

  it('start() refuses to run from anything but ready', async () => {
    const source = new FakeSpeedSource();
    const { ctrl } = makeController(makeRepo().repo, source);
    expect(() => ctrl.start()).toThrow(/ready/);

    await recordRide(source, ctrl, HOLD_AT_90);
    expect(() => ctrl.start()).toThrow(/ready/);
    await ctrl.dispose();
  });

  it('writes nothing to the database until the rider picks a hold', async () => {
    const source = new FakeSpeedSource();
    const { repo, create } = makeRepo();
    const { ctrl } = makeController(repo, source);
    await recordRide(source, ctrl, HOLD_AT_90);

    expect(reviewing(ctrl).candidates.length).toBeGreaterThan(0);
    expect(create).not.toHaveBeenCalled();
    expect(repo.get).not.toHaveBeenCalled();
    expect(repo.listByVehicle).not.toHaveBeenCalled();
    expect(repo.delete).not.toHaveBeenCalled();
    await ctrl.dispose();
  });

  it('offers the 15 s hold as a candidate once the ride is over', async () => {
    const source = new FakeSpeedSource();
    const { ctrl } = makeController(makeRepo().repo, source);
    await recordRide(source, ctrl, HOLD_AT_90);

    const { candidates } = reviewing(ctrl);
    const hold = candidates.find((c) => Math.abs(c.plateau.mean_speed_kmh - 90) < 2);
    expect(hold).toBeDefined();
    expect(hold!.plateau.duration_ms).toBeGreaterThanOrEqual(
      DEFAULT_PLATEAU_DETECTION_CONFIG.min_duration_ms,
    );
    expect(hold!.samples[0].t_ms).toBe(0);
    await ctrl.dispose();
  });

  it('derives the rollout the hold implies for the rider stated RPM', async () => {
    const source = new FakeSpeedSource();
    const { ctrl } = makeController(makeRepo().repo, source);
    await recordRide(source, ctrl, HOLD_AT_90);

    const [best] = reviewing(ctrl).candidates;
    expect(best.rollout_m_per_rev).toBeCloseTo(
      computeRollout(GEAR.user_rpm, best.plateau.mean_speed_kmh), 10,
    );
    expect(best.rollout_m_per_rev).toBeGreaterThan(PLAUSIBLE_ROLLOUT_M_PER_REV.min);
    expect(best.rollout_m_per_rev).toBeLessThan(PLAUSIBLE_ROLLOUT_M_PER_REV.max);
    expect(best.plausible).toBe(true);
    await ctrl.dispose();
  });

  it('posts the picked hold with the RPM the rider entered, not a derived one', async () => {
    const source = new FakeSpeedSource();
    const { repo, create, created } = makeRepo();
    const { ctrl } = makeController(repo, source);
    await recordRide(source, ctrl, HOLD_AT_90);

    const mean = reviewing(ctrl).candidates[0].plateau.mean_speed_kmh;
    const cal = await ctrl.saveSelected(0);

    expect(create).toHaveBeenCalledTimes(1);
    expect(created[0]).toMatchObject({
      vehicle_id: 'v1', gear_label: '4th', rpm: 4000, speed_kmh: mean,
    });
    expect(cal).not.toBeNull();
    expect(ctrl.getState()).toEqual({
      kind: 'saved', vehicle_id: 'v1', calibration_id: 'cal-1',
    });
    await ctrl.dispose();
  });

  it('refuses a candidate index that does not exist', async () => {
    const source = new FakeSpeedSource();
    const { repo, create } = makeRepo();
    const errors: unknown[] = [];
    const { ctrl } = makeController(repo, source, { onError: (e) => errors.push(e) });
    await recordRide(source, ctrl, HOLD_AT_90);

    expect(await ctrl.saveSelected(99)).toBeNull();
    expect(errors).toHaveLength(1);
    expect(create).not.toHaveBeenCalled();
    // No SAVE_START was ever dispatched, so the review list is still there.
    expect(reviewing(ctrl).candidates.length).toBeGreaterThan(0);
    await ctrl.dispose();
  });

  it('refuses a hold whose implied rollout is not physically plausible', async () => {
    const source = new FakeSpeedSource();
    const { repo, create } = makeRepo();
    const errors: unknown[] = [];
    const { ctrl } = makeController(repo, source, { onError: (e) => errors.push(e) });
    // 60000 RPM at 90 km/h implies 25 mm of wheel travel per revolution, an
    // order of magnitude under the floor. A mistyped RPM is the realistic way
    // to get here.
    await ctrl.warmup('v1', { gear_label: '4th', user_rpm: 60_000 });
    ctrl.start();
    ride(source, HOLD_AT_90);
    await ctrl.finish();

    const [best] = reviewing(ctrl).candidates;
    expect(best.rollout_m_per_rev).toBeLessThan(PLAUSIBLE_ROLLOUT_M_PER_REV.min);
    expect(best.plausible).toBe(false);
    expect(await ctrl.saveSelected(0)).toBeNull();
    expect(errors).toHaveLength(1);
    expect(create).not.toHaveBeenCalled();
    expect(ctrl.getState().kind).toBe('reviewing');
    await ctrl.dispose();
  });

  it('returns to reviewing when the save request fails', async () => {
    const source = new FakeSpeedSource();
    const { repo } = makeRepo({ fail: true });
    const errors: unknown[] = [];
    const { ctrl } = makeController(repo, source, { onError: (e) => errors.push(e) });
    await recordRide(source, ctrl, HOLD_AT_90);
    const before = reviewing(ctrl).candidates;

    expect(await ctrl.saveSelected(0)).toBeNull();
    expect(errors).toHaveLength(1);
    // A whole ride's candidates must survive one failed POST, so the rider can
    // retry without riding again.
    expect(reviewing(ctrl).candidates).toEqual(before);
    await ctrl.dispose();
  });

  it('reviews an empty list when the ride never held a steady speed', async () => {
    const source = new FakeSpeedSource();
    const { ctrl } = makeController(makeRepo().repo, source);
    await recordRide(source, ctrl, NO_HOLD);

    expect(reviewing(ctrl).candidates).toEqual([]);
    await ctrl.dispose();
  });

  it('finishes itself once the rider has parked', async () => {
    const source = new FakeSpeedSource();
    const { ctrl } = makeController(makeRepo().repo, source);
    await ctrl.warmup('v1', GEAR);
    ctrl.start();
    // Arm it above arm_speed_kmh first: only a ride that happened can end.
    ride(source, [
      { accel: 2.5, seconds: 10 },
      { accel: -2.5, seconds: 10 },
      { accel: 0, seconds: 25 },
    ]);
    await vi.waitFor(() => expect(ctrl.getState().kind).toBe('reviewing'));
    expect(source.stopped).toBe(1);
    await ctrl.dispose();
  });

  it('never finishes itself from the standstill it started in', async () => {
    const source = new FakeSpeedSource();
    const progress: Array<{ armed: boolean; remaining_ms: number }> = [];
    const { ctrl } = makeController(makeRepo().repo, source, {
      onStandstillProgress: (p) => progress.push({ armed: p.armed, remaining_ms: p.remaining_ms }),
    });
    await ctrl.warmup('v1', GEAR);
    ctrl.start();
    // Three times the standstill window, parked in the garage, never having
    // moved: the rider is still putting gloves on.
    ride(source, [{ accel: 0, seconds: 60 }]);
    expect(ctrl.getState().kind).toBe('recording');
    // Unarmed, so the UI is told nothing is counting down rather than shown a
    // window that fills and then does nothing.
    expect(progress[progress.length - 1]).toEqual({
      armed: false, remaining_ms: DEFAULT_STANDSTILL_CONFIG.standstill_ms,
    });
    await ctrl.dispose();
  });

  it('cues a genuine hold once, and cues a clearly different hold again', async () => {
    const source = new FakeSpeedSource();
    const cues: number[] = [];
    const { ctrl } = makeController(makeRepo().repo, source, {
      onHoldConfirmed: (kmh) => cues.push(kmh),
    });
    await recordRide(source, ctrl, TWO_HOLDS);

    // Two holds, two cues: the repeat window inside each hold is swallowed by
    // the dedupe, so a long cruise does not talk over the rider.
    expect(cues).toHaveLength(2);
    expect(cues[0]).toBeCloseTo(90, 1);
    expect(cues[1]).toBeCloseTo(54, 1);
    await ctrl.dispose();
  });

  it('surfaces a sensor error as a warning without ending the recording', async () => {
    const source = new FakeSpeedSource();
    const warnings: string[] = [];
    const { ctrl } = makeController(makeRepo().repo, source, {
      onSensorWarning: (m) => warnings.push(m),
    });
    await ctrl.warmup('v1', GEAR);
    ctrl.start();
    source.errors$.next({ message: 'Location permission denied' });
    expect(warnings).toEqual(['Location permission denied']);
    expect(ctrl.getState().kind).toBe('recording');
    await ctrl.dispose();
  });

  it('closes the recording on a wall clock when the sensor goes silent', async () => {
    const source = new FakeSpeedSource();
    const warnings: string[] = [];
    const { ctrl } = makeController(makeRepo().repo, source, {
      sensorStallMs: 60,
      watchdogTickMs: 10,
      onSensorWarning: (m) => warnings.push(m),
    });
    await ctrl.warmup('v1', GEAR);
    ctrl.start();
    source.emit(1000, 20);
    // Nothing sample-driven can ever end this session: t_ms stopped advancing.
    await vi.waitFor(() => expect(ctrl.getState().kind).toBe('reviewing'));
    expect(warnings.join(' ')).toMatch(/GPS stopped reporting/i);
    expect(reviewing(ctrl).candidates).toEqual([]);
    await ctrl.dispose();
  });

  it('hands off one calibration recording envelope, tagged with the gear context', async () => {
    const source = new FakeSpeedSource();
    const recordings: SensorRecording[] = [];
    const { ctrl } = makeController(makeRepo().repo, source, {
      onRecordingFinished: (r) => recordings.push(r),
    });
    await recordRide(source, ctrl, HOLD_AT_90);

    expect(recordings).toHaveLength(1);
    expect(recordings[0].kind).toBe('calibration');
    expect(recordings[0].meta).toMatchObject({
      vehicle_id: 'v1', gear_label: '4th', user_rpm: 4000, label: 'Hands-free calibration',
    });
    // Disposing after the hand-off must not repeat it.
    await ctrl.dispose();
    expect(recordings).toHaveLength(1);
  });

  it('hands off the envelope when disposed mid recording', async () => {
    const source = new FakeSpeedSource();
    const recordings: SensorRecording[] = [];
    const { ctrl } = makeController(makeRepo().repo, source, {
      onRecordingFinished: (r) => recordings.push(r),
    });
    await ctrl.warmup('v1', GEAR);
    ctrl.start();
    source.emit(1000, 20);
    await ctrl.dispose();
    expect(recordings).toHaveLength(1);
    expect(recordings[0].kind).toBe('calibration');
    expect(source.stopped).toBe(1);
    await ctrl.dispose();
    expect(recordings).toHaveLength(1);
  });
});
