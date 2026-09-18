import { gapLimit, nearestTime } from './time-series';
import type { GripCorner } from './types';
import type { GripSettings } from './settings';

interface CornerInputs {
  t: number[];
  spdS: Float32Array;
  leanS: Float32Array;
  /** combined g demand per sample: the stored per-corner stats are grip-only */
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

  const gap = gapLimit(t);
  const connected = (i: number, j: number) => t[j] - t[i] <= gap && Number.isFinite(sp[i]) && Number.isFinite(sp[j]) && Number.isFinite(ln[i]) && Number.isFinite(ln[j]);
  const mins: number[] = [];
  for (let i = a + 1; i < b; i++) {
    if (connected(i - 1, i) && connected(i, i + 1) && sp[i] <= sp[i - 1] && sp[i] < sp[i + 1]) mins.push(i);
  }

  // merge minima closer than mergeGap, keeping the lowest
  const filt: number[] = [];
  for (const mi of mins) {
    if (filt.length && Math.sign(ln[mi]) === Math.sign(ln[filt[filt.length - 1]]) && t[mi] - t[filt[filt.length - 1]] < settings.mergeGap) {
      if (sp[mi] < sp[filt[filt.length - 1]]) filt[filt.length - 1] = mi;
    } else {
      filt.push(mi);
    }
  }

  // Inclusive speed prominence on both sides within three recorded seconds.
  const apexes: number[] = [];
  for (const mi of filt) {
    let lmax = sp[mi];
    let rmax = sp[mi];
    for (let j = mi - 1; j >= a && t[mi] - t[j] <= 3 && connected(j, j + 1); j--) lmax = Math.max(lmax, sp[j]);
    for (let j = mi + 1; j <= b && t[j] - t[mi] <= 3 && connected(j - 1, j); j++) rmax = Math.max(rmax, sp[j]);
    if (Math.min(lmax, rmax) - sp[mi] >= settings.cornerDrop / 3.6 && Math.abs(ln[mi]) >= settings.cornerLean) {
      apexes.push(mi);
    }
  }

  // Sustained lean also detects constant-speed bends. Half a second is a
  // detection heuristic, not a statement about track geometry or grip.
  for (let l = a; l <= b; l++) {
    if (!(Math.abs(ln[l]) >= settings.cornerLean)) continue;
    let r = l;
    while (r < b && connected(r, r + 1) && Math.abs(ln[r + 1]) >= settings.cornerLean && Math.sign(ln[r + 1]) === Math.sign(ln[l])) r++;
    if (t[r] - t[l] >= 0.5 && !apexes.some((ap) => ap >= l && ap <= r)) {
      let ap = l;
      for (let j = l + 1; j <= r; j++) if (sp[j] < sp[ap] || (sp[j] === sp[ap] && Math.abs(ln[j]) > Math.abs(ln[ap]))) ap = j;
      if (sp[l] === sp[r] && sp[l] === sp[ap]) ap = nearestTime(t, (t[l] + t[r]) / 2, l, r);
      apexes.push(ap);
    }
    l = r;
  }
  apexes.sort((x, y) => x - y);
  const corners: GripCorner[] = [];
  apexes.forEach((ap, k) => {
    let l = ap;
    while (l > a && connected(l - 1, l) && sp[l - 1] >= sp[l] - 1.25 * (t[l] - t[l - 1]) && t[ap] - t[l - 1] <= 4) l--;
    let r = ap;
    while (r < b && connected(r, r + 1) && sp[r + 1] >= sp[r] - 1.25 * (t[r + 1] - t[r]) && t[r + 1] - t[ap] <= 4) r++;
    // Adjacent corners expand toward the same speed maximum between them, so
    // their windows overlap: measured on real data as up to 4% of a lap sitting
    // inside two windows at once, inflating the loser's "peak through corner" by
    // 13 points with the neighbour's apex. Split at the midpoint between apexes:
    // every sample then belongs to exactly one corner, which also makes "which
    // corner is the cursor in" a question with one answer.
    if (k > 0) l = Math.max(l, nearestTime(t, (t[apexes[k - 1]] + t[ap]) / 2, a, b) + 1);
    if (k + 1 < apexes.length) r = Math.min(r, nearestTime(t, (t[ap] + t[apexes[k + 1]]) / 2, a, b));

    let minSpeed = Infinity;
    let maxLean = 0;
    let peakLoad = 0;
    const dir: 'L' | 'R' = ln[ap] < 0 ? 'L' : 'R';
    const vals: number[] = [];
    for (let j = l; j <= r; j++) {
      minSpeed = Math.min(minSpeed, sp[j]);
      maxLean = Math.max(maxLean, Math.abs(ln[j]));
      if (Number.isFinite(ch.loadRate[j])) peakLoad = Math.max(peakLoad, ch.loadRate[j]);
      if (Number.isFinite(comb[j])) vals.push(comb[j]);
    }
    vals.sort((x, y) => x - y);

    const { apex, peak } = windowStats(comb, vals, l, r, ap, t);
    corners.push({
      // turn is filled in by assignTrackTurns() once every lap is built. It
      // cannot be known from one lap alone
      n: k + 1, turn: 0, l, r, ap, dir, minSpeed, maxLean, apexG: apex, peakG: peak, peakLoad,
      tStart: t[l], tApex: t[ap], tEnd: t[r],
    });
  });
  return corners;
}

// Apex is a time-window median; peak is the actual maximum of the derived
// metric in the detected window. Neither establishes a tyre capacity.
function windowStats(metric: ArrayLike<number>, sortedVals: number[], l: number, r: number, ap: number, t?: ArrayLike<number>) {
  const win: number[] = [];
  for (let j = l; j <= r; j++) {
    if ((t ? Math.abs(t[j] - t[ap]) <= 0.12 + 1e-9 : Math.abs(j - ap) <= 3) && Number.isFinite(metric[j])) win.push(metric[j]);
  }
  win.sort((x, y) => x - y);
  const mid = win.length >> 1;
  const apex = win.length ? (win.length % 2 ? win[mid] : (win[mid - 1] + win[mid]) / 2) : NaN;
  return { apex, peak: sortedVals.length ? sortedVals[sortedVals.length - 1] : NaN };
}

export function cornerStats(corner: Pick<GripCorner, 'l' | 'r' | 'ap'>, metric: ArrayLike<number>, t?: ArrayLike<number>) {
  const vals: number[] = [];
  for (let j = corner.l; j <= corner.r; j++) if (Number.isFinite(metric[j])) vals.push(metric[j]);
  vals.sort((x, y) => x - y);
  return windowStats(metric, vals, corner.l, corner.r, corner.ap, t);
}
