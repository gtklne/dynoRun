import type { GripChannels, GripLap } from './types';

/**
 * Putting two laps on one spatial axis.
 *
 * Neither sample index nor clock time can align two laps: they drift apart. The
 * track does not, so one lap's racing line becomes the axis and every other lap
 * is projected onto it by nearest-point. That single choice is load-bearing:
 * aligning by each lap's own cumulative distance instead is wrong by up to
 * 0.86 s on real data, because a lap that takes a 13 m tighter line arrives
 * "early" on its own odometer everywhere. The classic ∫(1/v)ds time-gain
 * formula fails for the same reason, by up to 0.52 s.
 */

/** Distance resolution of the shared axis, metres. */
export const DIST_STEP_M = 2;

/**
 * Samples of padding either side of a lap. The axis's zero is the moment the
 * lap crosses the reference lap's start position, found by interpolation, so
 * that instant has to be bracketed by real samples, and a lap's own first
 * sample lands up to one sample period *after* the timing line.
 */
export const LAP_PAD_SAMPLES = 6;

/** Hard ceiling on the projection tolerance, metres. */
export const MAX_TOL_M = 12;

/** A datum offset larger than this is not a datum offset. */
export const MAX_DATUM_SHIFT_M = 5;

// The search walks forward along the reference: a subject sample may sit a
// little behind the previous match (GPS jitter) but never far ahead of it.
// Bounding the window is what keeps the two legs of a hairpin (metres apart in
// space, half a lap apart along the line) from being confused.
const SEARCH_BACK_M = 25;
const SEARCH_FWD_M = 90;

// The first sample must NOT search the whole reference. On a closed circuit the
// axis begins and ends at the same physical point, so a global search can snap
// sample 0 to u ≈ length; the monotone clamp then pins the whole projection
// there and the lap's delta comes out as minus a lap time. The margin on real
// data is as thin as 1 m, so this is luck, not safety.
const FIRST_WINDOW_M = 40;

export interface GeoFrame {
  lat0: number;
  lon0: number;
  /** metres per degree of longitude at lat0 */
  kx: number;
  /** metres per degree of latitude at lat0 */
  ky: number;
}

const WGS84_A = 6378137;
const WGS84_F = 1 / 298.257223563;
const WGS84_E2 = WGS84_F * (2 - WGS84_F);

/**
 * Equirectangular frame on WGS84 local radii of curvature.
 *
 * The single-session map in project.ts uses the flat 111320/110540 constants,
 * which read 0.2-0.6 % short: invisible there because the map auto-fits, but
 * compare *prints* metres and integrates them into lap lengths, where it is
 * 8.5 m per lap. Residual shape distortion with the correct scales is under
 * 0.1 m across an 850 m track, two orders below the racing-line spread.
 */
export function geoFrame(lat0: number, lon0: number): GeoFrame {
  const phi = (lat0 * Math.PI) / 180;
  const s2 = Math.sin(phi) ** 2;
  const W = 1 - WGS84_E2 * s2;
  const M = (WGS84_A * (1 - WGS84_E2)) / Math.pow(W, 1.5); // meridian radius
  const N = WGS84_A / Math.sqrt(W); // prime-vertical radius
  return {
    lat0,
    lon0,
    kx: (N * Math.cos(phi) * Math.PI) / 180,
    ky: (M * Math.PI) / 180,
  };
}

/** Frame anchored on one lap's mean position. Use the reference lap, so the
 *  axis does not move when subject laps are added or removed. */
export function frameForLap(ch: GripChannels, lap: GripLap): GeoFrame {
  let sLat = 0;
  let sLon = 0;
  let c = 0;
  for (let i = lap.start; i <= lap.end; i++) {
    if (ch.lat[i]) { sLat += ch.lat[i]; sLon += ch.lon[i]; c++; }
  }
  return c ? geoFrame(sLat / c, sLon / c) : geoFrame(0, 0);
}

export interface LapPath {
  x: Float32Array;
  y: Float32Array;
  /** cumulative chord length from the padded start, metres */
  s: Float32Array;
  /** seconds relative to the lap's first timed sample (negative in the pad) */
  te: Float32Array;
  n: number;
  /** global sample index of local index 0 */
  i0: number;
  /** local index of lap.start */
  k0: number;
  /** local index of lap.end */
  kEnd: number;
  /** ∫v·dt ÷ geometric length: ≈1 on sound GPS; a quality assertion */
  odoRatio: number;
}

/**
 * Project a lap's fixes into the shared frame and integrate the geometric path
 * length. Geometric chord sum, not ∫v·dt: the two agree to 0.03 % on real data,
 * but the alignment operator projects *positions* onto this polyline, so the
 * axis has to be that polyline's own arc length.
 */
export function lapPath(
  ch: GripChannels,
  lap: GripLap,
  frame: GeoFrame,
  pad = LAP_PAD_SAMPLES,
): LapPath {
  const N = ch.t.length;
  const i0 = Math.max(0, lap.start - pad);
  const iEnd = Math.min(N - 1, lap.end + pad);
  const n = iEnd - i0 + 1;
  const x = new Float32Array(n);
  const y = new Float32Array(n);
  const s = new Float32Array(n);
  const te = new Float32Array(n);
  const t0 = ch.t[lap.start];
  const k0 = lap.start - i0;
  const kEnd = lap.end - i0;
  // accumulate in a double: Float32 addition over ~2600 steps drifts ~0.3 m
  let acc = 0;
  // the odometer cross-check covers the timed lap only. A pad reaches into the
  // neighbouring lap, and a lap boundary is exactly where position and clock
  // are allowed to disagree
  let odo = 0;
  let geom = 0;
  for (let k = 0; k < n; k++) {
    const i = i0 + k;
    x[k] = (ch.lon[i] - frame.lon0) * frame.kx;
    y[k] = (ch.lat[i] - frame.lat0) * frame.ky;
    te[k] = ch.t[i] - t0;
    if (k > 0) {
      const step = Math.hypot(x[k] - x[k - 1], y[k] - y[k - 1]);
      acc += step;
      if (k > k0 && k <= kEnd) {
        geom += step;
        odo += ch.spd[i] * (ch.t[i] - ch.t[i - 1]);
      }
    }
    s[k] = acc;
  }
  return { x, y, s, te, n, i0, k0, kEnd, odoRatio: geom > 0 ? odo / geom : 1 };
}

export interface ReferenceAxis {
  /** distance along the axis per reference local index; 0 at the lap start */
  u: Float32Array;
  /** axis length, metres (lap start → lap end) */
  length: number;
  /**
   * Smallest gap between two points of the line that are far apart along it.
   * The basin inside which nearest-point matching is unambiguous.
   */
  selfClearance: number;
  /** projection tolerance derived from the clearance, metres */
  tol: number;
}

/**
 * Rebase a reference lap's distances so zero is its own lap start (the pad runs
 * negative), and measure how close the line comes to itself. The tolerance must
 * stay inside that basin: on a real circuit the clearance is ~26 m, so a 25 m
 * tolerance would sit right on the ambiguity threshold.
 */
export function referenceAxis(p: LapPath): ReferenceAxis {
  const u = new Float32Array(p.n);
  const base = p.s[p.k0];
  for (let k = 0; k < p.n; k++) u[k] = p.s[k] - base;
  const length = u[p.kEnd] - u[p.k0];
  const clearance = selfClearance(p, u, length);
  return {
    u,
    length,
    selfClearance: clearance,
    tol: Math.max(2, Math.min(MAX_TOL_M, clearance / 2)),
  };
}

/**
 * Minimum distance between points separated by more than MIN_SEP_M *along* the
 * line. Separation is cyclic, because on a closed lap the start and the finish
 * are the same place and would otherwise report a clearance of nearly zero.
 */
const MIN_SEP_M = 60;
function selfClearance(p: LapPath, u: Float32Array, length: number): number {
  const stride = Math.max(1, Math.floor((p.kEnd - p.k0) / 400));
  let best = Infinity;
  for (let i = p.k0; i <= p.kEnd; i += stride) {
    for (let j = i + stride; j <= p.kEnd; j += stride) {
      const du = Math.abs(u[j] - u[i]);
      if (Math.min(du, length - du) <= MIN_SEP_M) continue;
      const d = Math.hypot(p.x[j] - p.x[i], p.y[j] - p.y[i]);
      if (d < best) best = d;
    }
  }
  return Number.isFinite(best) ? best : 2 * MAX_TOL_M;
}

export interface CommonSection {
  /** metres along the axis */
  sIn: number;
  sOut: number;
}

export interface LapProjection {
  /** distance along the reference axis per subject local index */
  u: Float32Array;
  /** perpendicular offset from the reference line, metres */
  off: Float32Array;
  /** nearest point on the reference line, shared frame, for the datum fit */
  nx: Float32Array;
  ny: Float32Array;
  /** how often the monotone clamp fired; nonzero means GPS trouble */
  clamps: number;
  /** fraction of on-axis samples within the tolerance of the reference line */
  coverage: number;
  offP95: number;
  /** largest bridged jump in u between consecutive samples, metres */
  maxGapM: number;
  /** longest stretch of the axis this lap actually follows */
  common: CommonSection;
}

function segProject(
  px: number, py: number,
  ax: number, ay: number, bx: number, by: number,
  freeEnds: boolean,
): { f: number; d: number; qx: number; qy: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const L2 = dx * dx + dy * dy;
  let f = L2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0;
  // Terminal segments stay unclamped so u can run past both ends of the axis:
  // clamping there would pile every pad sample onto u = 0 and the anchor
  // interpolation would degenerate into an extrapolation from a plateau.
  const lo = freeEnds ? -1.5 : 0;
  const hi = freeEnds ? 2.5 : 1;
  if (f < lo) f = lo;
  else if (f > hi) f = hi;
  const qx = ax + f * dx;
  const qy = ay + f * dy;
  return { f, d: Math.hypot(px - qx, py - qy), qx, qy };
}

/** Last index with a[idx] <= v (clamped to [0, n-1]); `a` must be sorted. */
export function floorIndex(a: ArrayLike<number>, v: number): number {
  let lo = 0;
  let hi = a.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (a[mid] <= v) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * Map every sample of `sub` to a distance along `ref`'s line. `shift` removes a
 * cross-session GPS datum offset before matching.
 */
export function projectOntoReference(
  sub: LapPath,
  ref: LapPath,
  axis: ReferenceAxis,
  shift: { dx: number; dy: number } = { dx: 0, dy: 0 },
): LapProjection {
  const n = sub.n;
  const segs = ref.n - 1;
  const u = new Float32Array(n);
  const off = new Float32Array(n);
  const nx = new Float32Array(n);
  const ny = new Float32Array(n);
  if (segs < 1 || n === 0) {
    return { u, off, nx, ny, clamps: 0, coverage: 0, offP95: 0, maxGapM: 0, common: { sIn: 0, sOut: 0 } };
  }

  let clamps = 0;
  let uPrev = axis.u[0];
  for (let k = 0; k < n; k++) {
    const px = sub.x[k] + shift.dx;
    const py = sub.y[k] + shift.dy;
    const from = k === 0 ? axis.u[0] : uPrev - SEARCH_BACK_M;
    const to = k === 0 ? axis.u[0] + FIRST_WINDOW_M : uPrev + SEARCH_FWD_M;
    const lo = floorIndex(axis.u, from);
    const hi = Math.min(segs - 1, floorIndex(axis.u, to));

    let bestD = Infinity;
    let bestU = uPrev;
    let bqx = px;
    let bqy = py;
    for (let j = lo; j <= hi; j++) {
      const freeEnds = j === 0 || j === segs - 1;
      const r = segProject(px, py, ref.x[j], ref.y[j], ref.x[j + 1], ref.y[j + 1], freeEnds);
      if (r.d < bestD) {
        bestD = r.d;
        bestU = axis.u[j] + r.f * (axis.u[j + 1] - axis.u[j]);
        bqx = r.qx;
        bqy = r.qy;
      }
    }
    if (k > 0 && bestU < u[k - 1]) {
      bestU = u[k - 1];
      clamps++;
    }
    u[k] = bestU;
    off[k] = bestD;
    nx[k] = bqx;
    ny[k] = bqy;
    uPrev = bestU;
  }

  // Statistics over the on-axis portion only: the pads sit outside [0, length]
  // and an in-lap sample is the only thing a coverage claim should rest on.
  const onAxis: number[] = [];
  let within = 0;
  let maxGapM = 0;
  for (let k = 0; k < n; k++) {
    if (u[k] >= 0 && u[k] <= axis.length) {
      onAxis.push(off[k]);
      if (off[k] <= axis.tol) within++;
    }
    if (k > 0) maxGapM = Math.max(maxGapM, u[k] - u[k - 1]);
  }
  onAxis.sort((a, b) => a - b);

  return {
    u,
    off,
    nx,
    ny,
    clamps,
    coverage: onAxis.length ? within / onAxis.length : 0,
    offP95: onAxis.length ? onAxis[Math.floor(0.95 * (onAxis.length - 1))] : 0,
    maxGapM,
    common: longestRun(u, off, axis),
  };
}

/**
 * Longest contiguous stretch of the axis the lap stays on the reference line.
 * Outside it the two are simply not on the same track, and a delta there is not
 * merely imprecise: when a layout diverges, the projection saturates and dumps
 * twenty seconds of the other layout's detour into seventy metres of axis.
 */
function longestRun(u: Float32Array, off: Float32Array, axis: ReferenceAxis): CommonSection {
  let bestIn = 0;
  let bestOut = 0;
  let runStart = -1;
  const close = (endIdx: number) => {
    if (runStart < 0) return;
    const a = Math.max(0, u[runStart]);
    const b = Math.min(axis.length, u[endIdx]);
    if (b - a > bestOut - bestIn) { bestIn = a; bestOut = b; }
    runStart = -1;
  };
  for (let k = 0; k < u.length; k++) {
    const on = off[k] <= axis.tol;
    if (on && runStart < 0) runStart = k;
    else if (!on) close(k > 0 ? k - 1 : 0);
  }
  close(u.length - 1);
  return { sIn: bestIn, sOut: bestOut };
}

/**
 * Constant position bias between two sessions, different days, different
 * satellite geometry, often different receivers. Fitted as a translation only:
 * rotation or scale would let a racing-line difference masquerade as a datum.
 * Never fit this within a session, where the datum is identical by construction
 * and the fit would erase a real difference in line.
 */
export function estimateDatumOffset(
  sub: LapPath,
  ref: LapPath,
  axis: ReferenceAxis,
): { dx: number; dy: number; n: number; applied: boolean } {
  const TRIM_M = 8;
  let dx = 0;
  let dy = 0;
  let used = 0;
  for (let iter = 0; iter < 3; iter++) {
    const pr = projectOntoReference(sub, ref, axis, { dx, dy });
    let sx = 0;
    let sy = 0;
    let count = 0;
    for (let k = 0; k < sub.n; k++) {
      if (pr.off[k] > TRIM_M) continue;
      sx += pr.nx[k] - (sub.x[k] + dx);
      sy += pr.ny[k] - (sub.y[k] + dy);
      count++;
    }
    if (count === 0) return { dx: 0, dy: 0, n: 0, applied: false };
    dx += sx / count;
    dy += sy / count;
    used = count;
  }
  const applied = Math.hypot(dx, dy) <= MAX_DATUM_SHIFT_M;
  return applied ? { dx, dy, n: used, applied } : { dx: 0, dy: 0, n: used, applied: false };
}

/**
 * A channel value at a distance along the axis, by linear interpolation of the
 * (u, values) pairs. `u` must be non-decreasing.
 */
export function valueAtU(u: ArrayLike<number>, values: ArrayLike<number>, s: number): number {
  const n = u.length;
  if (n === 0) return 0;
  if (s <= u[0]) return values[0];
  if (s >= u[n - 1]) return values[n - 1];
  const j = floorIndex(u, s);
  const du = u[j + 1] - u[j];
  return du > 0 ? values[j] + (values[j + 1] - values[j]) * ((s - u[j]) / du) : values[j];
}

/**
 * Uniform distance axis over [0, length]. The endpoints are exact so the finish
 * delta is read at the last station.
 */
export function distanceGrid(length: number, step = DIST_STEP_M): Float32Array {
  const k = Math.max(1, Math.round(length / step));
  const grid = new Float32Array(k + 1);
  for (let i = 0; i <= k; i++) grid[i] = (i / k) * length;
  return grid;
}

/**
 * Resample a per-sample channel onto `grid`, where `u[i]` is sample i's
 * distance along the shared axis. Both must be non-decreasing; outside the
 * sampled range the nearest end value is held.
 */
export function resampleByDistance(
  u: ArrayLike<number>,
  values: ArrayLike<number>,
  grid: ArrayLike<number>,
): Float32Array {
  const n = u.length;
  const out = new Float32Array(grid.length);
  if (n === 0) return out;
  let j = 0;
  for (let k = 0; k < grid.length; k++) {
    const g = grid[k];
    while (j < n - 2 && u[j + 1] < g) j++;
    if (g <= u[0]) { out[k] = values[0]; continue; }
    if (g >= u[n - 1]) { out[k] = values[n - 1]; continue; }
    const du = u[j + 1] - u[j];
    out[k] = du > 0 ? values[j] + (values[j + 1] - values[j]) * ((g - u[j]) / du) : values[j];
  }
  return out;
}
