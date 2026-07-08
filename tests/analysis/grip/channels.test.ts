import { describe, expect, it } from 'vitest';
import { GRAVITY, computeChannels, movAvg, resistanceG } from '@/analysis/grip/channels';
import type { GripChannels } from '@/analysis/grip/types';

function naiveMovAvg(a: number[], w: number): number[] {
  const h = w >> 1;
  return a.map((_, i) => {
    const lo = Math.max(0, i - h);
    const hi = Math.min(a.length - 1, i + h);
    let s = 0;
    for (let j = lo; j <= hi; j++) s += a[j];
    return s / (hi - lo + 1);
  });
}

function makeChannels(n: number, spd: (i: number) => number, lean: (i: number) => number): GripChannels {
  const idx = Array.from({ length: n }, (_, i) => i);
  return {
    t: idx.map((i) => i / 25),
    lat: idx.map(() => 0),
    lon: idx.map(() => 0),
    spd: idx.map(spd),
    lean: idx.map(lean),
    lap: idx.map(() => 1),
    head: idx.map(() => 0),
  };
}

describe('movAvg', () => {
  it('matches a naive centered window with shrinking edges', () => {
    const a = Array.from({ length: 50 }, (_, i) => Math.sin(i / 3) * 10 + i * 0.2);
    for (const w of [3, 5, 9]) {
      const fast = Array.from(movAvg(a, w));
      const slow = naiveMovAvg(a, w);
      fast.forEach((v, i) => expect(v).toBeCloseTo(slow[i], 4));
    }
  });
});

describe('resistanceG', () => {
  it('matches the generic-race-bike constants at reference speeds', () => {
    // ½·1.20·0.40·v² / (260·g₀) + 0.015
    expect(resistanceG(0)).toBeCloseTo(0.015, 4);
    expect(resistanceG(100 / 3.6)).toBeCloseTo(0.0876, 3);
    expect(resistanceG(200 / 3.6)).toBeCloseTo(0.3055, 3);
  });
});

describe('computeChannels', () => {
  it('recovers constant longitudinal acceleration in g (alongRaw), tire demand adds resistance', () => {
    const accel = 3; // m/s²
    const ch = makeChannels(200, (i) => 10 + (accel * i) / 25, () => 0);
    const d = computeChannels(ch, 9);
    // away from the edges the central difference of a linear ramp is exact
    for (let i = 30; i < 170; i++) {
      expect(d.alongRaw[i]).toBeCloseTo(accel / GRAVITY, 2);
      expect(d.along[i]).toBeCloseTo(accel / GRAVITY + resistanceG(d.spdS[i]), 2);
      expect(d.alat[i]).toBeCloseTo(0, 5);
    }
  });

  it('reads holding a high speed as positive drive demand on the tire', () => {
    const v = 200 / 3.6;
    const ch = makeChannels(200, () => v, () => 0);
    const d = computeChannels(ch, 9);
    expect(d.alongRaw[100]).toBeCloseTo(0, 3);
    expect(d.along[100]).toBeCloseTo(resistanceG(v), 3); // ≈ +0.31 g at 200 km/h
  });

  it('attributes part of a high-speed deceleration to drag, not the tire', () => {
    const decel = -6; // m/s², braking from 60 m/s
    const ch = makeChannels(200, (i) => 60 + (decel * i) / 25, () => 0);
    const d = computeChannels(ch, 9);
    for (let i = 30; i < 170; i++) {
      expect(Math.abs(d.along[i])).toBeLessThan(Math.abs(d.alongRaw[i]));
      expect(d.along[i]).toBeCloseTo(decel / GRAVITY + resistanceG(d.spdS[i]), 2);
    }
  });

  it('maps steady lean to lateral g via tan, signed', () => {
    const ch = makeChannels(100, () => 30, () => -30);
    const d = computeChannels(ch, 9);
    const expected = Math.tan((-30 * Math.PI) / 180);
    const drive = resistanceG(30);
    expect(d.alat[50]).toBeCloseTo(expected, 3);
    expect(d.comb[50]).toBeCloseTo(Math.hypot(expected, drive), 2);
    // left-hand lateral g plus the drive holding 30 m/s: just above the negative-lat axis
    expect(d.theta[50]).toBeCloseTo(Math.atan2(drive, expected), 2);
  });
});
