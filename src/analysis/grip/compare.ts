import {
  distanceGrid,
  estimateDatumOffset,
  frameForLap,
  lapPath,
  projectOntoReference,
  referenceAxis,
  resampleByDistance,
  valueAtU,
  type CommonSection,
  type GeoFrame,
  type LapPath,
  type LapProjection,
  type ReferenceAxis,
} from './align';
import { cornerStats } from './corners';
import type { GripAnalysis, GripLap } from './types';

/**
 * Assembling a comparison on top of the spatial alignment in align.ts: the
 * cumulative time-delta channel, distance-aligned channel overlays, and turn
 * windows that are identical in space for every lap.
 *
 * All laps must be analyzed with ONE shared GripSettings snapshot — speedSmooth
 * changes the g channels and envMinSpeed and the corner* keys change detection,
 * so laps derived under different settings are not the same measurement. See
 * resolveCompareSettings in compare-stats.ts.
 */

export { DIST_STEP_M, distanceGrid, resampleByDistance } from './align';
export type { GeoFrame, LapPath } from './align';

/** Apexes closer than this along the axis belong to the same turn. */
export const CORNER_CLUSTER_M = 40;

// Single-linkage alone can chain: apexes 39 m apart in a long sequence would
// collapse into one enormous "turn". A cluster wider than this is split at its
// largest internal gap until every turn spans a plausible corner.
const MAX_CLUSTER_EXTENT_M = 2 * CORNER_CLUSTER_M;

/** A lap must follow at least this much of the axis to be aligned at all. */
const MIN_SECTION_FRACTION = 0.5;

/** Above this, the lap ran the whole layout. */
const FULL_SECTION_FRACTION = 0.98;

export interface CompareLapInput {
  /** stable identity, `${sessionId}:${lap.num}` */
  key: string;
  label: string;
  /** the session this lap belongs to — datum correction is cross-session only */
  sessionId: string;
  /** analysis produced with the comparison's shared settings snapshot */
  analysis: GripAnalysis;
  lap: GripLap;
  /** active metric per GLOBAL sample index (grip demand or dynamic load), g */
  metric: ArrayLike<number>;
}

/** Channels of one lap on the shared distance axis. */
export interface CompareGrid {
  /** elapsed seconds since crossing the axis zero */
  t: Float32Array;
  /**
   * Cumulative time delta vs the reference, seconds (+ = slower). NaN outside
   * the lap's common section — masked rather than clamped, because a clamped
   * value there is not imprecise, it is catastrophically wrong.
   */
  dt: Float32Array;
  /** m/s */
  spd: Float32Array;
  /** deg, signed */
  lean: Float32Array;
  alat: Float32Array;
  along: Float32Array;
  comb: Float32Array;
  loadRate: Float32Array;
  /** active metric, g */
  metric: Float32Array;
  /** the lap's own line in the shared frame */
  x: Float32Array;
  y: Float32Array;
  /** offset from the reference line, metres */
  off: Float32Array;
}

export type LapVerdict = 'reference' | 'aligned' | 'partial' | 'incompatible';

export interface CompareLapResult {
  key: string;
  label: string;
  sessionId: string;
  lapNum: number;
  /** lap time from the session metadata, seconds */
  lapTime: number;
  /** geometric path length of the timed lap, metres */
  pathLength: number;
  /** path length ÷ reference path length */
  lengthRatio: number;
  coverage: number;
  offP95: number;
  /** largest bridged distance gap, metres (a dropped GPS fix) */
  maxGapM: number;
  /** monotone-clamp count; nonzero means the projection had to be forced */
  clamps: number;
  /** ∫v·dt ÷ geometric length — ≈1 on sound GPS */
  odoRatio: number;
  /** metres of the axis this lap actually followed */
  section: CommonSection;
  /** section length ÷ axis length */
  sectionFraction: number;
  /** datum offset removed before matching, metres (0 within a session) */
  datumShiftM: number;
  verdict: LapVerdict;
  isReference: boolean;
  grid: CompareGrid;
  /**
   * Cumulative delta at the axis end, seconds — NaN unless the lap followed the
   * whole layout, because a lap-time delta across a partial section is a lie.
   */
  finishDelta: number;
  /** cumulative delta across the common section, always defined */
  sectionDelta: number;
  /** distance along the axis per subject sample — for exact corner windows */
  u: Float32Array;
  path: LapPath;
}

export interface ComparedCornerStat {
  key: string;
  /** true when this lap followed the axis through the whole turn window */
  measured: boolean;
  /** apex demand ×100 (100 ≈ 1 g) */
  apexScore: number;
  /** robust peak demand through the window ×100 */
  peakScore: number;
  /** m/s */
  minSpeed: number;
  entrySpeed: number;
  exitSpeed: number;
  /** deg */
  maxLean: number;
  /** g/s */
  peakLoad: number;
  /** seconds spent between sIn and sOut */
  time: number;
  /** seconds lost (+) or gained (−) against the reference across the window */
  deltaGain: number;
}

export interface ComparedCorner {
  /** 1-based turn number, ordered along the axis */
  turn: number;
  dir: 'L' | 'R';
  /** apex distance along the axis, metres */
  s: number;
  sIn: number;
  sOut: number;
  /** how many of the compared laps detected a corner here */
  support: number;
  stats: ComparedCornerStat[];
}

export interface GripComparison {
  /** shared axis, metres from the reference lap's start */
  s: Float32Array;
  refKey: string;
  refLength: number;
  frame: GeoFrame;
  axis: ReferenceAxis;
  laps: CompareLapResult[];
  corners: ComparedCorner[];
  /** stretch of the axis EVERY aligned lap followed — the honest x-range */
  common: CommonSection;
}

function verdictFor(sectionFraction: number, lengthRatio: number): LapVerdict {
  if (sectionFraction < MIN_SECTION_FRACTION) return 'incompatible';
  if (sectionFraction >= FULL_SECTION_FRACTION && Math.abs(lengthRatio - 1) <= 0.03) return 'aligned';
  return 'partial';
}

const median = (a: number[]): number => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const h = s.length >> 1;
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
};

/**
 * Build the canonical turn list: every lap's detected apexes are placed on the
 * axis and single-linkage clustered. Detection is genuinely unstable — the same
 * physical lap yields 6 to 9 corners depending on the lap — so a turn is defined
 * by *where it is* and each lap is then measured over one identical spatial
 * window. GripCorner.n is a per-lap detection index and must never pair corners.
 */
function buildCanonicalCorners(
  laps: { input: CompareLapInput; proj: LapProjection; path: LapPath }[],
): Omit<ComparedCorner, 'stats'>[] {
  interface Hit { s: number; sIn: number; sOut: number; dir: 'L' | 'R'; key: string; lean: number }
  const hits: Hit[] = [];
  for (const { input, proj, path } of laps) {
    const at = (globalIdx: number) => {
      const k = Math.max(0, Math.min(proj.u.length - 1, globalIdx - path.i0));
      return proj.u[k];
    };
    for (const c of input.lap.corners) {
      const s = at(c.ap);
      // a corner detected outside the stretch this lap shares with the axis is
      // not on the reference layout at all
      if (s < proj.common.sIn || s > proj.common.sOut) continue;
      hits.push({ s, sIn: at(c.l), sOut: at(c.r), dir: c.dir, key: input.key, lean: c.maxLean });
    }
  }
  hits.sort((a, b) => a.s - b.s);

  const linked: Hit[][] = [];
  for (const h of hits) {
    const last = linked[linked.length - 1];
    if (last && h.s - last[last.length - 1].s <= CORNER_CLUSTER_M) last.push(h);
    else linked.push([h]);
  }
  const clusters = linked.flatMap(splitWideCluster);

  // A turn must be seen by a meaningful share of the laps; with two laps that
  // means either one, so a corner only one lap found still shows up.
  const minSupport = Math.max(1, Math.ceil(0.4 * laps.length));
  return clusters
    .map((cl) => {
      // One lap can detect two minima inside a single turn (a bumpy or double
      // apex). Keeping only its most-leaned hit stops that lap from dominating
      // the median window purely because it contributed twice.
      const perLap = new Map<string, Hit>();
      for (const h of cl) {
        const prev = perLap.get(h.key);
        if (!prev || h.lean > prev.lean) perLap.set(h.key, h);
      }
      const uniq = [...perLap.values()];
      const right = uniq.filter((h) => h.dir === 'R').length;
      return {
        turn: 0,
        dir: (right * 2 >= uniq.length ? 'R' : 'L') as 'L' | 'R',
        s: median(uniq.map((h) => h.s)),
        sIn: median(uniq.map((h) => h.sIn)),
        sOut: median(uniq.map((h) => h.sOut)),
        support: perLap.size,
      };
    })
    .filter((c) => c.support >= minSupport && c.sOut > c.sIn)
    .sort((a, b) => a.s - b.s)
    .map((c, i) => ({ ...c, turn: i + 1 }));
}

function splitWideCluster<T extends { s: number }>(cluster: T[]): T[][] {
  if (cluster.length < 2 || cluster[cluster.length - 1].s - cluster[0].s <= MAX_CLUSTER_EXTENT_M) {
    return [cluster];
  }
  let cut = 1;
  let widest = -1;
  for (let i = 1; i < cluster.length; i++) {
    const gap = cluster[i].s - cluster[i - 1].s;
    if (gap > widest) { widest = gap; cut = i; }
  }
  return [...splitWideCluster(cluster.slice(0, cut)), ...splitWideCluster(cluster.slice(cut))];
}

/** Value of a grid channel at an arbitrary distance (linear interpolation). */
export function valueAtDistance(grid: Float32Array, values: Float32Array, s: number): number {
  return valueAtU(grid, values, s);
}

/**
 * Compare a set of laps against one reference lap. Every lap must already be
 * analyzed with the same settings snapshot; `refKey` selects the reference
 * (typically the fastest selected lap).
 */
export function compareLaps(inputs: CompareLapInput[], refKey: string): GripComparison | null {
  if (inputs.length === 0) return null;
  const ref = inputs.find((i) => i.key === refKey) ?? inputs[0];
  const frame = frameForLap(ref.analysis.ch, ref.lap);
  const refPath = lapPath(ref.analysis.ch, ref.lap, frame);
  const axis = referenceAxis(refPath);
  if (!(axis.length > 0)) return null;

  const grid = distanceGrid(axis.length);
  // The zero of every lap's clock is the moment it crosses the axis zero, found
  // by interpolation. Using each lap's own first sample instead leaves a
  // per-lap bias of up to one sample period — measured as 39 ms of error
  // against a timing system, versus 1.4 ms with the spatial anchor.
  const refT0 = valueAtU(axis.u, refPath.te, 0);
  const refT = resampleByDistance(axis.u, refPath.te, grid);
  for (let k = 0; k < refT.length; k++) refT[k] -= refT0;

  const prepared = inputs.map((input) => {
    const isReference = input.key === ref.key;
    const path = isReference ? refPath : lapPath(input.analysis.ch, input.lap, frame);
    if (isReference) {
      return {
        input,
        path,
        isReference,
        datumShiftM: 0,
        proj: {
          u: axis.u,
          off: new Float32Array(path.n),
          nx: path.x,
          ny: path.y,
          clamps: 0,
          coverage: 1,
          offP95: 0,
          maxGapM: 0,
          common: { sIn: 0, sOut: axis.length },
        } satisfies LapProjection,
      };
    }
    // A constant position bias between two sessions turns into a real timing
    // error at the axis zero, where speed is highest; within one session the
    // datum is identical and fitting it would erase a genuine line difference.
    const datum =
      input.sessionId === ref.sessionId
        ? { dx: 0, dy: 0, applied: false }
        : estimateDatumOffset(path, refPath, axis);
    return {
      input,
      path,
      isReference,
      datumShiftM: datum.applied ? Math.hypot(datum.dx, datum.dy) : 0,
      proj: projectOntoReference(path, refPath, axis, { dx: datum.dx, dy: datum.dy }),
    };
  });

  const laps: CompareLapResult[] = prepared.map(({ input, path, proj, isReference, datumShiftM }) => {
    const a = input.analysis;
    const n = path.n;
    const slice = (src: ArrayLike<number>): Float32Array => {
      const out = new Float32Array(n);
      for (let k = 0; k < n; k++) out[k] = src[path.i0 + k];
      return out;
    };
    const rs = (src: ArrayLike<number>) => resampleByDistance(proj.u, slice(src), grid);

    const t0 = valueAtU(proj.u, path.te, 0);
    const t = resampleByDistance(proj.u, path.te, grid);
    for (let k = 0; k < t.length; k++) t[k] -= t0;

    const dt = new Float32Array(grid.length);
    for (let k = 0; k < grid.length; k++) {
      dt[k] = grid[k] >= proj.common.sIn && grid[k] <= proj.common.sOut ? t[k] - refT[k] : NaN;
    }

    const timedLength = path.s[path.kEnd] - path.s[path.k0];
    const lengthRatio = axis.length > 0 ? timedLength / axis.length : 1;
    const sectionFraction = (proj.common.sOut - proj.common.sIn) / axis.length;
    const verdict = isReference ? 'reference' : verdictFor(sectionFraction, lengthRatio);
    const full = verdict === 'reference' || verdict === 'aligned';

    return {
      key: input.key,
      label: input.label,
      sessionId: input.sessionId,
      lapNum: input.lap.num,
      lapTime: input.lap.time,
      pathLength: timedLength,
      lengthRatio,
      coverage: proj.coverage,
      offP95: proj.offP95,
      maxGapM: proj.maxGapM,
      clamps: proj.clamps,
      odoRatio: path.odoRatio,
      section: proj.common,
      sectionFraction,
      datumShiftM,
      verdict,
      isReference,
      grid: {
        t,
        dt,
        spd: rs(a.spdS),
        lean: rs(a.leanS),
        alat: rs(a.alat),
        along: rs(a.along),
        comb: rs(a.comb),
        loadRate: rs(a.loadRate),
        metric: rs(input.metric),
        x: resampleByDistance(proj.u, path.x, grid),
        y: resampleByDistance(proj.u, path.y, grid),
        off: resampleByDistance(proj.u, proj.off, grid),
      },
      finishDelta: full ? valueAtU(proj.u, path.te, axis.length) - t0 - refT[refT.length - 1] : NaN,
      sectionDelta:
        valueAtU(proj.u, path.te, proj.common.sOut) -
        valueAtU(proj.u, path.te, proj.common.sIn) -
        (valueAtDistance(grid, refT, proj.common.sOut) - valueAtDistance(grid, refT, proj.common.sIn)),
      u: proj.u,
      path,
    };
  });

  // Turns come only from laps that actually ran this layout; a lap on a
  // different one would seed phantom turns at meaningless distances.
  const usable = prepared.filter(
    (p) => p.isReference || verdictFor((p.proj.common.sOut - p.proj.common.sIn) / axis.length, 1) !== 'incompatible',
  );
  const canonical = buildCanonicalCorners(usable);

  const common = usable.reduce<CommonSection>(
    (acc, p) => ({ sIn: Math.max(acc.sIn, p.proj.common.sIn), sOut: Math.min(acc.sOut, p.proj.common.sOut) }),
    { sIn: 0, sOut: axis.length },
  );

  const corners: ComparedCorner[] = canonical.map((c) => ({
    ...c,
    stats: laps.map((lr) => {
      const input = inputs.find((i) => i.key === lr.key)!;
      return cornerWindowStats(input, lr, c.sIn, c.sOut, grid, refT);
    }),
  }));

  return { s: grid, refKey: ref.key, refLength: axis.length, frame, axis, laps, corners, common };
}

/**
 * Measure one lap over the spatial window [sIn, sOut]. Extremes come from the
 * lap's own samples rather than the resampled grid so the grid step cannot clip
 * a peak; the times are interpolated from the raw (u, te) pairs at the exact
 * window edges, which is more accurate than reading them off the grid.
 */
function cornerWindowStats(
  input: CompareLapInput,
  result: CompareLapResult,
  sIn: number,
  sOut: number,
  grid: Float32Array,
  refT: Float32Array,
): ComparedCornerStat {
  const a = input.analysis;
  const path = result.path;
  const u = result.u;
  const measured = sIn >= result.section.sIn && sOut <= result.section.sOut;
  const own = valueAtU(u, path.te, sOut) - valueAtU(u, path.te, sIn);
  const refSpan = valueAtDistance(grid, refT, sOut) - valueAtDistance(grid, refT, sIn);
  const deltaGain = measured ? own - refSpan : NaN;

  let lo = -1;
  let hi = -1;
  for (let k = 0; k < u.length; k++) {
    if (u[k] >= sIn && lo < 0) lo = k;
    if (u[k] <= sOut) hi = k;
  }
  if (lo < 0 || hi < lo) {
    return {
      key: input.key, measured: false, apexScore: 0, peakScore: 0, minSpeed: 0,
      entrySpeed: 0, exitSpeed: 0, maxLean: 0, peakLoad: 0, time: 0, deltaGain: NaN,
    };
  }

  let minSpeed = Infinity;
  let maxLean = 0;
  let peakLoad = 0;
  let apexIdx = lo;
  for (let k = lo; k <= hi; k++) {
    const i = path.i0 + k;
    if (a.spdS[i] < minSpeed) { minSpeed = a.spdS[i]; apexIdx = k; }
    maxLean = Math.max(maxLean, Math.abs(a.leanS[i]));
    peakLoad = Math.max(peakLoad, a.loadRate[i]);
  }
  const { apex, peak } = cornerStats(
    { l: path.i0 + lo, r: path.i0 + hi, ap: path.i0 + apexIdx },
    input.metric,
  );
  return {
    key: input.key,
    measured,
    apexScore: apex * 100,
    peakScore: peak * 100,
    minSpeed,
    entrySpeed: a.spdS[path.i0 + lo],
    exitSpeed: a.spdS[path.i0 + hi],
    maxLean,
    peakLoad,
    time: own,
    deltaGain,
  };
}
