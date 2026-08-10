import { describe, expect, it } from 'vitest';
import { detectCorners } from '@/analysis/grip/corners';
import { DEFAULT_GRIP_SETTINGS } from '@/analysis/grip/settings';

// corners.ts had no test of its own: the only data reaching it was two gaussian
// apexes 16 s apart, i.e. 13x the merge gap, so the merge branch was dead code
// under test. Disabling merging entirely left the whole suite green while the
// real fixture went from 6-9 corners per lap to 6-15.

const HZ = 25;

/**
 * A speed trace with dips at the given times. `drop` is km/h below `cruise`.
 * Lean follows the dip depth so an apex can be made to lean or not.
 */
function trace(opts: {
  seconds: number;
  cruiseKmh: number;
  dips: { at: number; dropKmh: number; widthS: number; leanDeg: number }[];
}) {
  const n = Math.round(opts.seconds * HZ);
  const t: number[] = [];
  const spd = new Float32Array(n);
  const lean = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    t.push(i / HZ);
    let v = opts.cruiseKmh;
    let ln = 0;
    for (const d of opts.dips) {
      const g = Math.exp(-(((i / HZ - d.at) / d.widthS) ** 2));
      v -= d.dropKmh * g;
      ln += d.leanDeg * g;
    }
    spd[i] = v / 3.6;
    lean[i] = ln;
  }
  return {
    t,
    spdS: spd,
    leanS: lean,
    comb: new Float32Array(n).fill(0.8),
    loadRate: new Float32Array(n).fill(0.5),
    n,
  };
}

const S = DEFAULT_GRIP_SETTINGS;
const run = (ch: ReturnType<typeof trace>, over: Partial<typeof S> = {}) =>
  detectCorners(ch, 0, ch.n - 1, { ...S, ...over });

describe('detectCorners', () => {
  it('merges two minima closer together than mergeGap, keeping the deeper one', () => {
    // two distinct minima 0.6 s apart: well inside the 1.2 s default gap, and
    // narrow enough that a real speed maximum sits between them
    const ch = trace({
      seconds: 20,
      cruiseKmh: 120,
      dips: [
        { at: 9.7, dropKmh: 30, widthS: 0.22, leanDeg: 30 },
        { at: 10.3, dropKmh: 45, widthS: 0.22, leanDeg: 40 },
      ],
    });
    const merged = run(ch);
    expect(merged).toHaveLength(1);
    // the deeper dip won, so the apex sits nearer 10.3 s than 9.7 s
    expect(merged[0].tApex).toBeGreaterThan(10);

    // the same pair with merging effectively off must stay two corners
    expect(run(ch, { mergeGap: 0.4 }).length).toBeGreaterThan(1);
  });

  it('keeps two minima further apart than mergeGap as separate corners', () => {
    const ch = trace({
      seconds: 30,
      cruiseKmh: 130,
      dips: [
        { at: 8, dropKmh: 40, widthS: 0.8, leanDeg: 35 },
        { at: 20, dropKmh: 40, widthS: 0.8, leanDeg: 35 },
      ],
    });
    expect(run(ch)).toHaveLength(2);
  });

  it('requires the speed drop to clear cornerDrop', () => {
    const shallow = trace({
      seconds: 16,
      cruiseKmh: 100,
      dips: [{ at: 8, dropKmh: 4, widthS: 0.8, leanDeg: 30 }],
    });
    expect(run(shallow, { cornerDrop: 7 })).toHaveLength(0);
    expect(run(shallow, { cornerDrop: 3 })).toHaveLength(1);
  });

  it('requires the apex to actually lean', () => {
    const flat = trace({
      seconds: 16,
      cruiseKmh: 140,
      dips: [{ at: 8, dropKmh: 40, widthS: 0.8, leanDeg: 5 }],
    });
    expect(run(flat, { cornerLean: 8 })).toHaveLength(0);
    expect(run(flat, { cornerLean: 4 })).toHaveLength(1);
  });

  it('reads the corner direction from the sign of lean', () => {
    const left = trace({
      seconds: 16,
      cruiseKmh: 130,
      dips: [{ at: 8, dropKmh: 40, widthS: 0.8, leanDeg: -40 }],
    });
    expect(run(left)[0].dir).toBe('L');
    const right = trace({
      seconds: 16,
      cruiseKmh: 130,
      dips: [{ at: 8, dropKmh: 40, widthS: 0.8, leanDeg: 40 }],
    });
    expect(run(right)[0].dir).toBe('R');
  });

  it('gives adjacent corners disjoint windows containing their own apex', () => {
    // three dips close enough that the outward expansion would otherwise collide
    const ch = trace({
      seconds: 24,
      cruiseKmh: 150,
      dips: [
        { at: 6, dropKmh: 60, widthS: 1.0, leanDeg: 40 },
        { at: 10, dropKmh: 55, widthS: 1.0, leanDeg: 38 },
        { at: 14, dropKmh: 65, widthS: 1.0, leanDeg: 42 },
      ],
    });
    const cs = run(ch);
    expect(cs).toHaveLength(3);
    for (let i = 0; i < cs.length; i++) {
      expect(cs[i].l).toBeLessThanOrEqual(cs[i].ap);
      expect(cs[i].ap).toBeLessThanOrEqual(cs[i].r);
      if (i > 0) expect(cs[i].l).toBeGreaterThan(cs[i - 1].r);
    }
  });

  it('starts every corner with turn = 0, since a turn id needs the whole session', () => {
    const ch = trace({
      seconds: 16,
      cruiseKmh: 130,
      dips: [{ at: 8, dropKmh: 40, widthS: 0.8, leanDeg: 40 }],
    });
    expect(run(ch)[0].turn).toBe(0);
    expect(run(ch)[0].n).toBe(1);
  });
});
