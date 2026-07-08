import type { GripCorner } from './types';
import type { GripSettings } from './settings';

interface CornerInputs {
  t: number[];
  spdS: Float32Array;
  leanS: Float32Array;
  /** combined g demand per sample — the stored per-corner stats are grip-only */
  comb: Float32Array;
  loadRate: Float32Array;
}

/**
 * Find the corners inside one lap's sample range [a, b]: local speed minima,
 * merged when closer than mergeGap, confirmed by prominence (speed must rise
 * on both sides within ~3 s) and by lean angle. Each apex expands outward to
 * the surrounding speed maxima (capped at ~4 s per side).
 *
 * apexG/peakG here are grip-only; use cornerStats() to evaluate a corner
 * against whichever metric is live (grip vs dynamic load).
 */
export function detectCorners(
  ch: CornerInputs,
  a: number,
  b: number,
  settings: Pick<GripSettings, 'cornerLean' | 'cornerDrop' | 'mergeGap'>,
): GripCorner[] {
  const { t, spdS: sp, leanS: ln, comb } = ch;

  const mins: number[] = [];
  for (let i = a + 1; i < b; i++) {
    if (sp[i] <= sp[i - 1] && sp[i] < sp[i + 1]) mins.push(i);
  }

  // merge minima closer than mergeGap, keeping the lowest
  const filt: number[] = [];
  for (const mi of mins) {
    if (filt.length && t[mi] - t[filt[filt.length - 1]] < settings.mergeGap) {
      if (sp[mi] < sp[filt[filt.length - 1]]) filt[filt.length - 1] = mi;
    } else {
      filt.push(mi);
    }
  }

  // prominence: speed must rise ≥ cornerDrop on both sides within 3 s (75
  // samples @ 25 Hz), and the apex must actually lean
  const apexes: number[] = [];
  for (const mi of filt) {
    let lmax = sp[mi];
    let rmax = sp[mi];
    for (let j = Math.max(a, mi - 75); j <= mi; j++) lmax = Math.max(lmax, sp[j]);
    for (let j = mi; j <= Math.min(b, mi + 75); j++) rmax = Math.max(rmax, sp[j]);
    if (Math.min(lmax, rmax) - sp[mi] > settings.cornerDrop / 3.6 && Math.abs(ln[mi]) > settings.cornerLean) {
      apexes.push(mi);
    }
  }

  const corners: GripCorner[] = [];
  apexes.forEach((ap, k) => {
    let l = ap;
    while (l > a && sp[l - 1] >= sp[l] - 0.05 && t[ap] - t[l] < 4) l--;
    let r = ap;
    while (r < b && sp[r + 1] >= sp[r] - 0.05 && t[r] - t[ap] < 4) r++;

    let minSpeed = Infinity;
    let maxLean = 0;
    let peakLoad = 0;
    const dir: 'L' | 'R' = ln[ap] < 0 ? 'L' : 'R';
    const vals: number[] = [];
    for (let j = l; j <= r; j++) {
      minSpeed = Math.min(minSpeed, sp[j]);
      maxLean = Math.max(maxLean, Math.abs(ln[j]));
      peakLoad = Math.max(peakLoad, ch.loadRate[j]);
      vals.push(comb[j]);
    }
    vals.sort((x, y) => x - y);

    const { apex, peak } = windowStats(comb, vals, l, r, ap);
    corners.push({
      n: k + 1, l, r, ap, dir, minSpeed, maxLean, apexG: apex, peakG: peak, peakLoad,
      tStart: t[l], tApex: t[ap], tEnd: t[r],
    });
  });
  return corners;
}

// apex = median of ±3 samples about the apex; peak = robust 90th percentile
// through the corner, never below the apex reading
function windowStats(metric: ArrayLike<number>, sortedVals: number[], l: number, r: number, ap: number) {
  const win: number[] = [];
  for (let j = Math.max(l, ap - 3); j <= Math.min(r, ap + 3); j++) win.push(metric[j]);
  win.sort((x, y) => x - y);
  const apex = win[win.length >> 1];
  const peak = Math.max(apex, sortedVals[Math.floor(0.9 * (sortedVals.length - 1))]);
  return { apex, peak };
}

/** Re-evaluate a detected corner against the currently active metric. */
export function cornerStats(corner: Pick<GripCorner, 'l' | 'r' | 'ap'>, metric: ArrayLike<number>) {
  const vals: number[] = [];
  for (let j = corner.l; j <= corner.r; j++) vals.push(metric[j]);
  vals.sort((x, y) => x - y);
  return windowStats(metric, vals, corner.l, corner.r, corner.ap);
}
