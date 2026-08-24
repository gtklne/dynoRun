import { describe, it, expect } from 'vitest';
import { assessSignal, STALL_CATCHUP_MS2 } from '@/analysis/signal-integrity';
import type { RawSpeedSample } from '@/analysis/types';

// Run d3de969d verbatim: the hands-free pull the pipeline turned into 215 hp
// from a bike that makes about 128.
const REAL_RUN: RawSpeedSample[] = [
  { t_ms: 0, speed_mps: 6.910359 },
  { t_ms: 989, speed_mps: 7.824923 },
  { t_ms: 1982, speed_mps: 8.1315155 },
  { t_ms: 2985, speed_mps: 8.187438 },
  { t_ms: 3980, speed_mps: 8.6754875 },
  { t_ms: 4986, speed_mps: 10.038628 },
  { t_ms: 5981, speed_mps: 11.025276 },
  { t_ms: 6987, speed_mps: 10.768769 },
  { t_ms: 7982, speed_mps: 18.879076 },
  { t_ms: 8986, speed_mps: 18.879074 },
  { t_ms: 9986, speed_mps: 25.850077 },
  { t_ms: 10983, speed_mps: 38.98678 },
];

// The three other pulls detectPulls found in the same 150 s ride, taken from
// the same recording. All three are clean, and the detector must say so: a rule
// that condemns every 1 Hz pull is no more useful than one that condemns none.
const CLEAN_PULL_2: RawSpeedSample[] = [
  6.910359, 8.675487, 10.038628, 11.025276, 12.5, 14.2, 16.1, 18.0, 20.4, 23.05,
].map((v, i) => ({ t_ms: i * 1000, speed_mps: v }));

function steady(count: number, stepMs: number, a: number, v0 = 10): RawSpeedSample[] {
  return Array.from({ length: count }, (_, i) => ({
    t_ms: i * stepMs,
    speed_mps: v0 + a * ((i * stepMs) / 1000),
  }));
}

describe('assessSignal', () => {
  it('condemns the real 215 hp run and names both faults', () => {
    const v = assessSignal(REAL_RUN);
    expect(v.verdict).toBe('corrupt');

    const kinds = v.faults.map((f) => f.kind).sort();
    expect(kinds).toEqual(['impossible_step', 'stall_and_catchup']);
    expect(v.faults.every((f) => f.analysed)).toBe(true);

    // Blame lands on the catch-up fix, the one whose reading is wrong, not on
    // the frozen fix that preceded it.
    const stall = v.faults.find((f) => f.kind === 'stall_and_catchup')!;
    expect(stall.t_ms).toBe(9986);
    expect(stall.detail).toMatch(/held at 68 km\/h/);

    const step = v.faults.find((f) => f.kind === 'impossible_step')!;
    expect(step.t_ms).toBe(10983);
    expect(step.detail).toMatch(/13\.2 m\/s²/);

    expect(v.advice).toMatch(/ride the pull again/i);
  });

  it('passes the clean pulls from the same ride', () => {
    expect(assessSignal(CLEAN_PULL_2).verdict).toBe('ok');
    expect(assessSignal(steady(12, 1000, 3)).verdict).toBe('ok');
    expect(assessSignal(steady(60, 100, 4)).verdict).toBe('ok');
  });

  it('ignores a frozen fix while the vehicle is merely cruising', () => {
    // A held value at constant speed costs nothing: no acceleration was lost.
    const cruise: RawSpeedSample[] = [
      { t_ms: 0, speed_mps: 25 },
      { t_ms: 1000, speed_mps: 25.2 },
      { t_ms: 2000, speed_mps: 25.2 },
      { t_ms: 3000, speed_mps: 25.4 },
      { t_ms: 4000, speed_mps: 25.5 },
    ];
    expect(assessSignal(cruise).verdict).toBe('ok');
  });

  it('condemns a frozen fix that is followed by a catch-up', () => {
    const stalled: RawSpeedSample[] = [
      { t_ms: 0, speed_mps: 20 },
      { t_ms: 1000, speed_mps: 24 },
      { t_ms: 2000, speed_mps: 24 },
      { t_ms: 3000, speed_mps: 24 + STALL_CATCHUP_MS2 + 6 },
      { t_ms: 4000, speed_mps: 34 },
    ];
    const v = assessSignal(stalled);
    expect(v.verdict).toBe('corrupt');
    expect(v.faults.map((f) => f.kind)).toContain('stall_and_catchup');
  });

  it('downgrades to suspect when the fault sits outside the measured window', () => {
    // trimToAccelPhase cuts at peak speed, so a fault in the coast-down never
    // fed the curve. That lowers confidence, it does not condemn the number.
    const coastFault: RawSpeedSample[] = [
      ...steady(8, 1000, 3),
      { t_ms: 8000, speed_mps: 20 },
      { t_ms: 9000, speed_mps: 20 },
      { t_ms: 10000, speed_mps: 28 },
    ];
    const v = assessSignal(coastFault);
    expect(v.verdict).toBe('suspect');
    expect(v.faults.length).toBeGreaterThan(0);
    expect(v.faults.every((f) => !f.analysed)).toBe(true);
    expect(v.advice).toMatch(/number stands/i);
  });

  it('exposes the trace so a caller does not rebuild it', () => {
    const v = assessSignal(REAL_RUN);
    expect(v.trace.points).toHaveLength(12);
    expect(v.trace.frozen_count).toBe(1);
  });

  it('says nothing about a run too short to difference', () => {
    expect(assessSignal([]).verdict).toBe('ok');
    expect(assessSignal([{ t_ms: 0, speed_mps: 10 }]).verdict).toBe('ok');
  });
});
