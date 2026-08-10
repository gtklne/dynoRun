import { describe, expect, it } from 'vitest';
import {
  MAX_TOL_M,
  distanceGrid,
  estimateDatumOffset,
  floorIndex,
  frameForLap,
  geoFrame,
  lapPath,
  projectOntoReference,
  referenceAxis,
  resampleByDistance,
  valueAtU,
  type LapPath,
} from '@/analysis/grip/align';
import { analyzeGripSession } from '@/analysis/grip/analyze';
import { parseRaceboxCsv } from '@/analysis/grip/parse-racebox';
import { DEFAULT_GRIP_SETTINGS } from '@/analysis/grip/settings';
import { BASE_PACE, circuitCsv, simulateSession, type LapPace } from './synthetic-circuit';

const SLOWER: LapPace = { aLat: 0.9, aAcc: 0.48, aBrk: 0.82, vMax: 58 };

function circuit(paces: LapPace[]) {
  const sim = simulateSession(paces, 1);
  const parsed = parseRaceboxCsv(circuitCsv(sim));
  return { sim, parsed, analysis: analyzeGripSession(parsed, DEFAULT_GRIP_SETTINGS) };
}

describe('geoFrame', () => {
  it('uses WGS84 local radii of curvature, not the flat constants', () => {
    // at the latitude of the real fixtures the flat 111320/110540 pair reads
    // 0.2-0.6% short, which is 8.5 m of phantom shortfall per 2.7 km lap
    const f = geoFrame(47.948, 7.42);
    expect(f.ky).toBeCloseTo(111189.3, 0);
    expect(f.kx).toBeCloseTo(74700.0, 0);
    expect(f.ky).toBeGreaterThan(110540);
  });

  it('shrinks longitude scale toward the poles', () => {
    // at the equator kx is the prime-vertical radius (a) and ky the meridian
    // radius (a(1−e²)): the two are not interchangeable
    expect(geoFrame(0, 0).kx).toBeCloseTo(111319.5, 0);
    expect(geoFrame(0, 0).ky).toBeCloseTo(110574.4, 0);
    expect(geoFrame(60, 0).kx).toBeLessThan(geoFrame(30, 0).kx);
  });

  it('falls back to a usable frame when a lap has no fixes', () => {
    const ch = { t: [0, 1], lat: [0, 0], lon: [0, 0], spd: [0, 0], lean: [0, 0], lap: [1, 1], head: [0, 0] };
    const f = frameForLap(ch, { num: 1, start: 0, end: 1, time: 1, corners: [] });
    expect(Number.isFinite(f.kx)).toBe(true);
    expect(Number.isFinite(f.ky)).toBe(true);
  });
});

describe('lapPath', () => {
  it('pads either side of the lap so the timing line is bracketed', () => {
    const { parsed, analysis } = circuit([BASE_PACE, BASE_PACE, BASE_PACE]);
    const lap = analysis.laps[1]; // a middle lap has neighbours on both sides
    const frame = frameForLap(parsed.ch, lap);
    const p = lapPath(parsed.ch, lap, frame, 6);
    expect(p.i0).toBe(lap.start - 6);
    expect(p.k0).toBe(6);
    expect(p.kEnd).toBe(lap.end - lap.start + 6);
    // the lap's own clock is zero at its first timed sample, negative in the pad
    expect(p.te[p.k0]).toBe(0);
    expect(p.te[0]).toBeLessThan(0);
    expect(p.te[p.n - 1]).toBeGreaterThan(p.te[p.kEnd]);
  });

  it('clamps the pad at the ends of the session', () => {
    const { parsed, analysis } = circuit([BASE_PACE]);
    const frame = frameForLap(parsed.ch, analysis.laps[0]);
    const p = lapPath(parsed.ch, analysis.laps[0], frame, 100000);
    expect(p.i0).toBe(0);
    expect(p.n).toBe(parsed.n);
  });

  it('agrees with the speed odometer, which is the data-quality assertion', () => {
    const { parsed, analysis } = circuit([BASE_PACE, SLOWER]);
    for (const lap of analysis.laps) {
      const p = lapPath(parsed.ch, lap, frameForLap(parsed.ch, lap));
      // the generator samples a chorded centreline, so it carries a little more
      // chord deficit than real GPS; compare-fixtures.test.ts holds the tight
      // 0.002 bound against real RaceBox data
      expect(Math.abs(p.odoRatio - 1)).toBeLessThan(0.005);
    }
  });
});

describe('referenceAxis', () => {
  it('puts zero at the lap start and the length at the lap end', () => {
    const { sim, parsed, analysis } = circuit([BASE_PACE, BASE_PACE, BASE_PACE]);
    const lap = analysis.laps[1];
    const p = lapPath(parsed.ch, lap, frameForLap(parsed.ch, lap));
    const axis = referenceAxis(p);
    expect(axis.u[p.k0]).toBe(0);
    expect(axis.u[0]).toBeLessThan(0);
    expect(axis.u[p.kEnd]).toBeCloseTo(axis.length, 4);
    expect(axis.length).toBeGreaterThan(sim.trackLength * 0.99);
    expect(axis.u[p.n - 1]).toBeGreaterThan(axis.length);
  });

  it('measures self-clearance cyclically, so a closed lap is not reported as 0 m', () => {
    // start and finish are the same place; a non-cyclic separation test would
    // call the clearance ~0 and collapse the tolerance to nothing
    const { parsed, analysis } = circuit([BASE_PACE, BASE_PACE]);
    const lap = analysis.laps[1];
    const axis = referenceAxis(lapPath(parsed.ch, lap, frameForLap(parsed.ch, lap)));
    expect(axis.selfClearance).toBeGreaterThan(20);
    expect(axis.tol).toBeGreaterThan(2);
    expect(axis.tol).toBeLessThanOrEqual(MAX_TOL_M);
  });
});

describe('projectOntoReference', () => {
  function paths(paces: LapPace[], refIdx = 0, subIdx = 1) {
    const { parsed, analysis } = circuit(paces);
    const refLap = analysis.laps[refIdx];
    const frame = frameForLap(parsed.ch, refLap);
    const ref = lapPath(parsed.ch, refLap, frame);
    const sub = lapPath(parsed.ch, analysis.laps[subIdx], frame);
    return { ref, sub, axis: referenceAxis(ref), parsed, analysis, frame };
  }

  it('does not collapse the first sample to the far end of a closed lap', () => {
    // the axis begins and ends at the same physical point, so a global search
    // for sample 0 can snap to u = length; the monotone clamp would then pin the
    // whole projection there and the delta would come out as minus a lap time
    const { ref, sub, axis } = paths([BASE_PACE, SLOWER]);
    const { u, clamps } = projectOntoReference(sub, ref, axis);
    expect(u[sub.k0]).toBeGreaterThan(-3);
    expect(u[sub.k0]).toBeLessThan(3);
    expect(u[sub.kEnd]).toBeGreaterThan(axis.length * 0.99);
    expect(clamps).toBeLessThan(sub.n * 0.02);
  });

  it('is the identity on the reference lap itself', () => {
    const { ref, axis } = paths([BASE_PACE, BASE_PACE]);
    const { u, off, coverage } = projectOntoReference(ref, ref, axis);
    expect(coverage).toBe(1);
    for (let k = 0; k < u.length; k++) {
      expect(off[k]).toBeLessThan(0.01);
      expect(u[k]).toBeCloseTo(axis.u[k], 2);
    }
  });

  it('reports the whole axis as common when the lap follows it', () => {
    const { ref, sub, axis } = paths([BASE_PACE, SLOWER]);
    const p = projectOntoReference(sub, ref, axis);
    expect(p.common.sIn).toBeLessThan(1);
    expect(p.common.sOut).toBeCloseTo(axis.length, 0);
    expect(p.coverage).toBe(1);
  });

  it('recovers a constant racing-line offset', () => {
    const { ref, sub, axis } = paths([BASE_PACE, { ...BASE_PACE, lineOffset: 4 }]);
    const p = projectOntoReference(sub, ref, axis);
    expect(p.offP95).toBeGreaterThan(3);
    expect(p.offP95).toBeLessThan(5);
    expect(p.coverage).toBe(1);
  });

  it('confines the common section to the stretch the lap stayed on line', () => {
    const { parsed, analysis } = circuit([BASE_PACE, BASE_PACE]);
    const refLap = analysis.laps[0];
    const subLap = analysis.laps[1];
    const frame = frameForLap(parsed.ch, refLap);
    // push the last quarter of the subject lap far off the reference line
    const from = subLap.start + Math.floor(0.75 * (subLap.end - subLap.start));
    for (let i = from; i <= subLap.end; i++) parsed.ch.lat[i] += 0.0009; // ~100 m north
    const ref = lapPath(parsed.ch, refLap, frame);
    const axis = referenceAxis(ref);
    const p = projectOntoReference(lapPath(parsed.ch, subLap, frame), ref, axis);
    expect(p.coverage).toBeLessThan(0.85);
    expect(p.common.sOut).toBeLessThan(axis.length * 0.9);
    expect(p.common.sOut - p.common.sIn).toBeGreaterThan(axis.length * 0.5);
  });

  it('keeps advancing through an off-track excursion instead of stalling', () => {
    const { parsed, analysis } = circuit([BASE_PACE, BASE_PACE, BASE_PACE]);
    const refLap = analysis.laps[0];
    const subLap = analysis.laps[1];
    const frame = frameForLap(parsed.ch, refLap);
    const mid = Math.floor((subLap.start + subLap.end) / 2);
    for (let i = mid; i < mid + 60; i++) {
      parsed.ch.lat[i] = 47.5 + (parsed.ch.lat[i] - 47.5) * 1.12; // ~30 m wider
      parsed.ch.lon[i] = 7.5 + (parsed.ch.lon[i] - 7.5) * 1.12;
    }
    const ref = lapPath(parsed.ch, refLap, frame);
    const axis = referenceAxis(ref);
    const p = projectOntoReference(lapPath(parsed.ch, subLap, frame), ref, axis);
    // a brief excursion must not corrupt the alignment: u still reaches the end
    expect(p.u[p.u.length - 1]).toBeGreaterThan(axis.length);
    expect(Math.max(...Array.from(p.off))).toBeGreaterThan(20);
  });

  it('does not confuse the two legs of an out-and-back', () => {
    // 200 m out along y, a u-turn, then 200 m back only 10 m to the side: the
    // two legs are 10 m apart in space and 200 m apart along the line
    const out: [number, number][] = [];
    for (let y = 0; y <= 200; y += 2) out.push([0, y]);
    for (let y = 200; y >= 0; y -= 2) out.push([10, y]);
    const ref = pathFromPoints(out);
    const axis = referenceAxis(ref);

    // the subject rides the same shape, half a metre wide throughout
    const sub = pathFromPoints(out.map(([x, y]) => [x + 0.5, y] as [number, number]));
    const p = projectOntoReference(sub, ref, axis);

    // the return leg must map to the far half of the axis, not back onto the
    // outbound leg it happens to sit 10 m from
    const mid = Math.floor(out.length / 2);
    expect(p.u[mid - 5]).toBeLessThan(200);
    expect(p.u[mid + 20]).toBeGreaterThan(230);
    expect(p.u[p.u.length - 1]).toBeGreaterThan(axis.length * 0.97);
    for (const o of p.off) expect(o).toBeLessThan(1.5);
  });
});

const mean = (a: ArrayLike<number>) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i];
  return a.length ? s / a.length : 0;
};

function pathFromPoints(pts: [number, number][]): LapPath {
  const n = pts.length;
  const s = new Float32Array(n);
  const x = new Float32Array(n);
  const y = new Float32Array(n);
  const te = new Float32Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    x[i] = pts[i][0];
    y[i] = pts[i][1];
    te[i] = i * 0.04;
    if (i > 0) acc += Math.hypot(x[i] - x[i - 1], y[i] - y[i - 1]);
    s[i] = acc;
  }
  return { x, y, s, te, n, i0: 0, k0: 0, kEnd: n - 1, odoRatio: 1 };
}

describe('estimateDatumOffset', () => {
  it('recovers a known constant position bias between two sessions', () => {
    const { parsed, analysis } = circuit([BASE_PACE, BASE_PACE]);
    const refLap = analysis.laps[0];
    const frame = frameForLap(parsed.ch, refLap);
    const ref = lapPath(parsed.ch, refLap, frame);
    const axis = referenceAxis(ref);

    const subLap = analysis.laps[1];
    const DX = 0.9;
    const DY = -0.45;
    for (let i = subLap.start - 8; i <= subLap.end + 8; i++) {
      parsed.ch.lon[i] += DX / frame.kx;
      parsed.ch.lat[i] += DY / frame.ky;
    }
    const sub = lapPath(parsed.ch, subLap, frame);
    const fit = estimateDatumOffset(sub, ref, axis);
    expect(fit.applied).toBe(true);
    expect(fit.n).toBeGreaterThan(100);
    // the fit opposes the injected bias in both axes
    expect(fit.dx).toBeLessThan(0);
    expect(fit.dy).toBeGreaterThan(0);
    // and what it is for: the lap sits closer to the reference line afterwards.
    // Only the component perpendicular to the line is observable (sliding a
    // lap along its own path changes nothing), so exact recovery is not the bar.
    const before = mean(projectOntoReference(sub, ref, axis).off);
    const after = mean(projectOntoReference(sub, ref, axis, fit).off);
    expect(after).toBeLessThan(before * 0.6);
  });

  it('refuses a shift too large to be a datum offset', () => {
    // a straight reference makes the whole offset observable, so the fit really
    // does estimate 20 m, which is not a datum offset, it is a different track
    const line: [number, number][] = [];
    for (let y = 0; y <= 400; y += 2) line.push([0, y]);
    const ref = pathFromPoints(line);
    const axis = referenceAxis(ref);
    const sub = pathFromPoints(line.map(([, y]) => [20, y] as [number, number]));
    const fit = estimateDatumOffset(sub, ref, axis);
    expect(fit.applied).toBe(false);
    expect(fit.dx).toBe(0);
    expect(fit.dy).toBe(0);
  });
});

describe('valueAtU / floorIndex / distanceGrid / resampleByDistance', () => {
  it('interpolates a channel at an exact distance', () => {
    const u = new Float32Array([0, 10, 20]);
    const v = new Float32Array([0, 5, 30]);
    expect(valueAtU(u, v, 0)).toBe(0);
    expect(valueAtU(u, v, 5)).toBeCloseTo(2.5, 6);
    expect(valueAtU(u, v, 15)).toBeCloseTo(17.5, 6);
    expect(valueAtU(u, v, -5)).toBe(0);
    expect(valueAtU(u, v, 99)).toBe(30);
    expect(valueAtU(new Float32Array([]), new Float32Array([]), 1)).toBe(0);
  });

  it('finds the last index at or below a value', () => {
    const a = new Float32Array([0, 5, 10, 15]);
    expect(floorIndex(a, -1)).toBe(0);
    expect(floorIndex(a, 5)).toBe(1);
    expect(floorIndex(a, 9.9)).toBe(1);
    expect(floorIndex(a, 99)).toBe(3);
  });

  it('spans [0, length] with exact endpoints', () => {
    const g = distanceGrid(1000, 2);
    expect(g[0]).toBe(0);
    expect(g[g.length - 1]).toBeCloseTo(1000, 6);
    expect(g.length).toBe(501);
    expect(distanceGrid(0).length).toBeGreaterThanOrEqual(2);
  });

  it('resamples linearly and holds the ends', () => {
    const u = new Float32Array([0, 10, 20, 30]);
    const v = new Float32Array([0, 20, 40, 60]);
    const out = resampleByDistance(u, v, new Float32Array([0, 5, 15, 25, 30, 99]));
    expect(Array.from(out)).toEqual([0, 10, 30, 50, 60, 60]);
  });

  it('survives repeated distances without dividing by zero', () => {
    const u = new Float32Array([0, 5, 5, 10]);
    const v = new Float32Array([0, 1, 2, 3]);
    const out = resampleByDistance(u, v, new Float32Array([0, 5, 10]));
    expect(out.every((x) => Number.isFinite(x))).toBe(true);
  });
});
