import { describe, expect, it } from 'vitest';
import { GRAVITY, computeChannels, movAvg } from '@/analysis/grip/channels';
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

describe('computeChannels', () => {
  it('recovers constant longitudinal acceleration in g', () => {
    const accel = 3; // m/s²
    const ch = makeChannels(200, (i) => 10 + (accel * i) / 25, () => 0);
    const d = computeChannels(ch, 9);
    // away from the edges the central difference of a linear ramp is exact
    for (let i = 30; i < 170; i++) {
      expect(d.along[i]).toBeCloseTo(accel / GRAVITY, 2);
      expect(d.alat[i]).toBeCloseTo(0, 5);
    }
  });

  it('maps steady lean to lateral g via tan, signed', () => {
    const ch = makeChannels(100, () => 30, () => -30);
    const d = computeChannels(ch, 9);
    const expected = Math.tan((-30 * Math.PI) / 180);
    expect(d.alat[50]).toBeCloseTo(expected, 3);
    expect(d.comb[50]).toBeCloseTo(Math.abs(expected), 2);
    // pure left-hand lateral g points along the negative-lat axis
    expect(Math.abs(d.theta[50])).toBeCloseTo(Math.PI, 1);
  });
});
