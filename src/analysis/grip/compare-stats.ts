import type { CommonSection } from './align';
import { ENVELOPE_BINS, computeEnvelope } from './envelope';
import { valueAtDistance, type CompareGrid, type CompareLapResult, type GripComparison } from './compare';
import {
  DEFAULT_GRIP_SETTINGS,
  GRIP_SETTINGS_SCHEMA,
  sanitizeGripSettings,
  type GripSettingKey,
  type GripSettings,
} from './settings';
import type { GripAnalysis, GripEnvelope } from './types';

export interface ResolvedCompareSettings {
  settings: GripSettings;
  /** keys the sessions disagreed on, which therefore fell back to defaults */
  diverged: GripSettingKey[];
}

/**
 * One settings snapshot for the whole comparison. Per-session tuning cannot be
 * honoured here: speedSmooth changes the g channels and envMinSpeed and the
 * corner* keys change detection, so laps derived under different settings are
 * not the same measurement.
 *
 * Where every session already agrees on a key, that shared value is kept, the
 * rider's tuning survives. Where they disagree, the default wins rather than
 * one session's value, so the result does not depend on which lap happens to be
 * the reference or in what order sessions were added.
 */
export function resolveCompareSettings(inputs: unknown[]): ResolvedCompareSettings {
  const sanitized = inputs.map(sanitizeGripSettings);
  if (sanitized.length === 0) return { settings: DEFAULT_GRIP_SETTINGS, diverged: [] };

  const settings = { ...DEFAULT_GRIP_SETTINGS };
  const diverged: GripSettingKey[] = [];
  for (const group of GRIP_SETTINGS_SCHEMA) {
    for (const def of group.items) {
      const first = sanitized[0][def.key];
      if (sanitized.every((s) => s[def.key] === first)) settings[def.key] = first;
      else diverged.push(def.key);
    }
  }
  return { settings, diverged };
}

/**
 * Derived read-outs on top of a GripComparison. Everything here is an absolute
 * score or a physical unit (seconds, metres, km/h, degrees, g), never a
 * fraction of a limit.
 */

/** Fit equal lap-count windows and select a representative observed envelope.
 * This controls one sampling difference; it does not remove riding, condition,
 * logger or duration confounding. Quantiles can increase or decrease with data.
 */
export function equalBudgetEnvelope(
  analysis: Pick<GripAnalysis, 'spdS' | 'comb' | 'theta' | 'alongRaw' | 'laps' | 'n'> & { ch?: { t: ArrayLike<number> } },
  settings: Pick<GripSettings, 'envMinSpeed'>,
  k: number,
): GripEnvelope {
  const laps = analysis.laps;
  const budget = Math.max(1, Math.min(Number.isFinite(k) ? Math.floor(k) : laps.length, laps.length));
  if (laps.length === 0) return computeEnvelope(analysis, settings, undefined, analysis.ch?.t);

  const fits: GripEnvelope[] = [];
  for (let i = 0; i + budget <= laps.length; i++) {
    const mask = new Int32Array(analysis.n);
    for (let j = i; j < i + budget; j++) {
      const lap = laps[j];
      for (let s = lap.start; s <= lap.end; s++) mask[s] = lap.num;
    }
    fits.push(computeEnvelope(analysis, settings, mask, analysis.ch?.t));
  }
  // Complete scores are usually unavailable; rank supported radii only to
  // select a reproducible window, never display this rank as a session score.
  const rank = (f: GripEnvelope) => {
    const v = Array.from(f.env).filter(Number.isFinite);
    return v.length ? v.reduce((s, x) => s + x * x, 0) / v.length : -Infinity;
  };
  fits.sort((a, b) => rank(a) - rank(b));
  return fits[fits.length >> 1];
}

export type EnvelopeSector = 'brake' | 'right' | 'accel' | 'left';

export const SECTOR_LABEL: Record<EnvelopeSector, string> = {
  brake: 'Braking',
  right: 'Right',
  accel: 'Drive',
  left: 'Left',
};

/** Which quadrant an envelope bin's direction falls in. */
function sectorOfBin(b: number): EnvelopeSector {
  // theta = atan2(along, alat): 0 = pure right, +π/2 = pure accel
  const theta = -Math.PI + ((b + 0.5) / ENVELOPE_BINS) * 2 * Math.PI;
  if (theta > -Math.PI / 4 && theta <= Math.PI / 4) return 'right';
  if (theta > Math.PI / 4 && theta <= (3 * Math.PI) / 4) return 'accel';
  if (theta > -(3 * Math.PI) / 4 && theta <= -Math.PI / 4) return 'brake';
  return 'left';
}

/** Full-sector RMS requires support in all 18 angular bins. */
export function sectorScores(env: Float32Array): Record<EnvelopeSector, number> {
  const sum: Record<EnvelopeSector, number> = { brake: 0, right: 0, accel: 0, left: 0 };
  const count: Record<EnvelopeSector, number> = { brake: 0, right: 0, accel: 0, left: 0 };
  for (let b = 0; b < Math.min(env.length, ENVELOPE_BINS); b++) {
    const sec = sectorOfBin(b);
    sum[sec] += env[b] * env[b];
    count[sec]++;
  }
  return {
    brake: count.brake === 18 ? 100 * Math.sqrt(sum.brake / count.brake) : NaN,
    right: count.right === 18 ? 100 * Math.sqrt(sum.right / count.right) : NaN,
    accel: count.accel === 18 ? 100 * Math.sqrt(sum.accel / count.accel) : NaN,
    left: count.left === 18 ? 100 * Math.sqrt(sum.left / count.left) : NaN,
  };
}

export interface SegmentTime {
  key: string;
  /** seconds spent in this segment */
  time: number;
  /** seconds behind this segment's best (0 for the best) */
  loss: number;
}

export interface CompareSegment {
  index: number;
  /** the turn this segment contains, or null for a turn-free stretch */
  turn: number | null;
  label: string;
  sStart: number;
  sEnd: number;
  times: SegmentTime[];
  bestKey: string;
  bestTime: number;
}

export interface SegmentBreakdown {
  segments: CompareSegment[];
  /**
   * Σ of each segment's best time: the lap the rider has already ridden, in
   * pieces, on different laps. Never a prediction: every part of it happened.
   */
  theoreticalBest: number;
  /** key of the lap whose total is lowest */
  bestLapKey: string;
  /** per-lap total, Σ its segment times (equals its measured lap duration) */
  totals: SegmentTime[];
  /**
   * Σ of the reference lap's own segments: the only figure `theoreticalBest`
   * may be subtracted from. `CompareLapResult.lapTime` comes from the RaceBox
   * metadata and is measured on a different clock than the spatial axis: on real
   * data the two differ by 52 ms, so differencing them invents a 0.05 s gain
   * even when the reference won every segment. NaN if the reference did not
   * cover the whole axis.
   */
  referenceTotal: number;
}

/**
 * Split the shared axis so each segment contains exactly one turn, cutting at
 * the midpoint between consecutive apexes. Segment times are read off the
 * cumulative-time channel, so they tile [0, L] exactly and sum to the lap.
 */
export function compareSegments(cmp: GripComparison): SegmentBreakdown {
  const L = cmp.refLength;
  const turns = cmp.corners;
  const bounds: number[] = [0];
  for (let i = 1; i < turns.length; i++) bounds.push((turns[i - 1].s + turns[i].s) / 2);
  bounds.push(L);

  const segments: CompareSegment[] = [];
  for (let i = 0; i + 1 < bounds.length; i++) {
    const sStart = bounds[i];
    const sEnd = bounds[i + 1];
    const turn = turns.length ? turns[i]?.turn ?? null : null;
    const times: SegmentTime[] = cmp.laps.map((lap) => {
      const covered = lap.verdict !== 'incompatible' && sStart >= lap.section.sIn && sEnd <= lap.section.sOut;
      return {
        key: lap.key,
        time: covered
          ? valueAtDistance(cmp.s, lap.grid.t, sEnd) - valueAtDistance(cmp.s, lap.grid.t, sStart)
          : NaN,
        loss: NaN,
      };
    });
    const finite = times.filter((x) => Number.isFinite(x.time));
    const bestTime = finite.length ? Math.min(...finite.map((x) => x.time)) : NaN;
    const best = finite.find((x) => x.time === bestTime);
    for (const x of times) x.loss = Number.isFinite(x.time) && Number.isFinite(bestTime) ? x.time - bestTime : NaN;
    segments.push({
      index: i,
      turn,
      label: turn != null ? `T${turn}` : `Sector ${i + 1}`,
      sStart,
      sEnd,
      times,
      bestKey: best?.key ?? '',
      bestTime,
    });
  }

  // Only laps that covered every segment get a total; a partial lap's "total"
  // would silently be the sum of the parts it did ride.
  const totals: SegmentTime[] = cmp.laps.map((lap) => {
    const own = segments.map((seg) => seg.times.find((x) => x.key === lap.key)?.time ?? NaN);
    return {
      key: lap.key,
      time: own.every(Number.isFinite) ? own.reduce((a, b) => a + b, 0) : NaN,
      loss: NaN,
    };
  });
  const finiteTotals = totals.filter((x) => Number.isFinite(x.time));
  const bestTotal = finiteTotals.length ? Math.min(...finiteTotals.map((x) => x.time)) : NaN;
  for (const x of totals) {
    x.loss = Number.isFinite(x.time) && Number.isFinite(bestTotal) ? x.time - bestTotal : NaN;
  }

  const bestSum = segments.reduce((sum, seg) => sum + seg.bestTime, 0);
  return {
    segments,
    theoreticalBest: Number.isFinite(bestSum) ? bestSum : NaN,
    bestLapKey: finiteTotals.find((x) => x.time === bestTotal)?.key ?? cmp.refKey,
    totals,
    referenceTotal: totals.find((x) => x.key === cmp.refKey)?.time ?? NaN,
  };
}

export interface DutyMetres {
  /** metres of track with the tire pushed backward (braking) */
  brake: number;
  /** metres with neither drive nor brake demand */
  coast: number;
  /** metres with the tire pushed forward (driving) */
  drive: number;
  /** metres above `gThreshold` combined demand */
  aboveG: number;
  /** metres above `leanThreshold` lean */
  aboveLean: number;
  /** total metres measured (the reference lap length) */
  total: number;
}

export interface DutyOptions {
  /** g: |long demand| below this counts as coasting */
  coastBand?: number;
  /** g: combined demand that counts as "hard" */
  gThreshold?: number;
  /** deg */
  leanThreshold?: number;
  /**
   * Restrict the integral to the stretch of axis the lap actually rode. Outside
   * its common section every channel holds its last real value, so integrating
   * the whole axis charges a partial lap ~12% of its duty to track it never saw.
   */
  section?: CommonSection;
}

/** Integrate descriptive demand bands on the reference distance axis.
 * The near-zero band does not identify rider throttle/brake state.
 */
export function dutyMetres(s: Float32Array, grid: CompareGrid, opts: DutyOptions = {}): DutyMetres {
  const coastBand = opts.coastBand ?? 0.1;
  const gThreshold = opts.gThreshold ?? 0.8;
  const leanThreshold = opts.leanThreshold ?? 40;
  const sIn = opts.section ? opts.section.sIn : -Infinity;
  const sOut = opts.section ? opts.section.sOut : Infinity;
  const out: DutyMetres = { brake: 0, coast: 0, drive: 0, aboveG: 0, aboveLean: 0, total: 0 };
  for (let k = 0; k + 1 < s.length; k++) {
    const width = s[k + 1] - s[k];
    const lo = Math.max(s[k], sIn), hi = Math.min(s[k + 1], sOut);
    if (!(width > 0 && hi > lo)) continue;
    const channels = [grid.along, grid.comb, grid.lean];
    if (channels.some((a) => !Number.isFinite(a[k]) || !Number.isFinite(a[k + 1]))) continue;
    const a = (lo - s[k]) / width, b = (hi - s[k]) / width;
    // Split each linear cell at every threshold crossing, including both lean
    // signs. Integrating each resulting constant category is exact.
    const cuts = [a, b];
    for (const [values, levels] of [[grid.along, [-coastBand, coastBand]], [grid.comb, [gThreshold]], [grid.lean, [-leanThreshold, leanThreshold]]] as const) {
      const dv = values[k + 1] - values[k];
      if (!dv) continue;
      for (const level of levels) { const f = (level - values[k]) / dv; if (f > a && f < b) cuts.push(f); }
    }
    cuts.sort((x, y) => x - y);
    for (let j = 0; j + 1 < cuts.length; j++) {
      const w = width * (cuts[j + 1] - cuts[j]);
      const f = (cuts[j] + cuts[j + 1]) / 2;
      const at = (v: Float32Array) => v[k] + f * (v[k + 1] - v[k]);
      out.total += w;
      if (at(grid.along) < -coastBand) out.brake += w;
      else if (at(grid.along) > coastBand) out.drive += w;
      else out.coast += w;
      if (at(grid.comb) > gThreshold) out.aboveG += w;
      if (Math.abs(at(grid.lean)) > leanThreshold) out.aboveLean += w;
    }
  }
  return out;
}

export type TurnPayoff =
  /** the lap did not ride this turn, nothing to compare, not a match */
  | 'unmeasured'
  | 'level'
  | 'faster-more-g'
  | 'faster-other'
  | 'slower-backed-off'
  | 'slower-despite-g'
  /** same time out of the turn, but a different amount of tyre spent getting it */
  | 'level-cheaper'
  | 'level-dearer';

export interface PayoffThresholds {
  /** seconds: display deadband, not calibrated uncertainty */
  time?: number;
  /** points: display deadband, not calibrated uncertainty */
  score?: number;
}

/** Descriptive joint categories. These inputs cannot establish causation. */
export function turnPayoff(deltaTime: number, deltaScore: number, t: PayoffThresholds = {}): TurnPayoff {
  const dt = t.time ?? 0.05;
  const ds = t.score ?? 3;
  // compare.ts sets deltaGain to NaN for a turn outside the lap's common section.
  // Every comparison below is false for NaN, so this used to fall through to
  // 'level' and report a turn the lap physically never rode as
  // "Matched: same time, same demand".
  if (!Number.isFinite(deltaTime) || !Number.isFinite(deltaScore)) return 'unmeasured';
  if (deltaTime < -dt) return deltaScore > ds ? 'faster-more-g' : 'faster-other';
  if (deltaTime > dt) return deltaScore < -ds ? 'slower-backed-off' : 'slower-despite-g';
  if (deltaScore > ds) return 'level-dearer';
  if (deltaScore < -ds) return 'level-cheaper';
  return 'level';
}

export const PAYOFF_LABEL: Record<TurnPayoff, string> = {
  'unmeasured': 'Unmeasured', 'level': 'Similar time and demand',
  'faster-more-g': 'Faster, higher demand', 'faster-other': 'Faster, similar or lower demand',
  'slower-backed-off': 'Slower, lower demand', 'slower-despite-g': 'Slower, similar or higher demand',
  'level-cheaper': 'Similar time, lower demand', 'level-dearer': 'Similar time, higher demand',
};
export const PAYOFF_HINT: Record<TurnPayoff, string> = Object.fromEntries(
  Object.entries(PAYOFF_LABEL).map(([key, label]) => [key, `${label}. Descriptive comparison; it does not identify the cause or available grip. Thresholds are display choices, not measurement uncertainty.`]),
) as Record<TurnPayoff, string>;

/** Mean pace over a lap, m/s: path length ÷ measured duration. */
export function lapPace(lap: CompareLapResult): number {
  const dur = lap.path.te[lap.path.kEnd] - lap.path.te[lap.path.k0];
  return dur > 0 ? lap.pathLength / dur : NaN;
}

export interface PaceNote {
  /** metres the subject lap is longer (+) or shorter (−) than the reference */
  lengthDeltaM: number;
  /** m/s */
  refPace: number;
  subjectPace: number;
  /** percent the subject's pace differs from the reference's */
  pacePct: number;
}

/**
 * The honest sentence for two laps that are not the same layout: the raw time
 * difference is meaningless, but mean pace over each lap's own length is not.
 */
export function paceNote(ref: CompareLapResult, subject: CompareLapResult): PaceNote {
  const refPace = lapPace(ref);
  const subjectPace = lapPace(subject);
  return {
    lengthDeltaM: subject.pathLength - ref.pathLength,
    refPace,
    subjectPace,
    pacePct: refPace > 0 ? ((subjectPace - refPace) / refPace) * 100 : 0,
  };
}
