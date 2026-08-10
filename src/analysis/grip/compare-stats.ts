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

/**
 * Refit a session's traction envelope on exactly `k` timed laps.
 *
 * The session score is monotone in lap count: the fit is a p99-per-bin
 * max-preserving boundary, so more laps can only push bins outward. Comparing a
 * 10-lap session's score against a 5-lap session's therefore flatters the
 * longer session by several points for free. Fitting both sides on the same
 * number of laps removes that bias.
 *
 * Every contiguous k-lap window is fitted and the *median-scoring* window is
 * returned whole, never an average of windows, because the boundary is
 * max-preserving and averaging rings would produce a shape that was never fit
 * to any data. Implemented by masking the lap channel, so envelope.ts is
 * untouched.
 */
export function equalBudgetEnvelope(
  analysis: Pick<GripAnalysis, 'spdS' | 'comb' | 'theta' | 'alongRaw' | 'laps' | 'n'>,
  settings: Pick<GripSettings, 'envMinSpeed'>,
  k: number,
): GripEnvelope {
  const laps = analysis.laps;
  const budget = Math.max(1, Math.min(k, laps.length));
  if (laps.length === 0) return computeEnvelope(analysis, settings);

  const fits: GripEnvelope[] = [];
  for (let i = 0; i + budget <= laps.length; i++) {
    const mask = new Int32Array(analysis.n);
    for (let j = i; j < i + budget; j++) {
      const lap = laps[j];
      for (let s = lap.start; s <= lap.end; s++) mask[s] = lap.num;
    }
    fits.push(computeEnvelope(analysis, settings, mask));
  }
  fits.sort((a, b) => a.sessionScore - b.sessionScore);
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

/**
 * Split the envelope into four directional scores on the same 100 ≈ 1 g scale
 * as the session score, which is the same RMS-radius statistic taken over all
 * bins instead of a quadrant. Answers "which direction am I actually weak in",
 * which one overall number cannot.
 */
export function sectorScores(env: Float32Array): Record<EnvelopeSector, number> {
  const sum: Record<EnvelopeSector, number> = { brake: 0, right: 0, accel: 0, left: 0 };
  const count: Record<EnvelopeSector, number> = { brake: 0, right: 0, accel: 0, left: 0 };
  for (let b = 0; b < Math.min(env.length, ENVELOPE_BINS); b++) {
    const sec = sectorOfBin(b);
    sum[sec] += env[b] * env[b];
    count[sec]++;
  }
  return {
    brake: count.brake ? 100 * Math.sqrt(sum.brake / count.brake) : 0,
    right: count.right ? 100 * Math.sqrt(sum.right / count.right) : 0,
    accel: count.accel ? 100 * Math.sqrt(sum.accel / count.accel) : 0,
    left: count.left ? 100 * Math.sqrt(sum.left / count.left) : 0,
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
      // a lap that left the reference layout here has no time to report; NaN so
      // it can never be mistaken for a fast segment
      // half a metre of slack: a lap with no trailing pad ends at exactly the
      // axis length to within Float32 rounding, and must not lose its last
      // segment to that
      const EPS = 0.5;
      const covered = sStart >= lap.section.sIn - EPS && sEnd <= lap.section.sOut + EPS;
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

/**
 * How many metres of track went to braking, coasting and driving.
 *
 * This uses `along` (drag-corrected tire demand) rather than the kinematic
 * `alongRaw`, and that is what makes "coast" meaningful: along ≈ 0 exactly when
 * the tire is neither driving nor braking, because holding a steady speed still
 * needs +resistanceG(v) of drive. On the raw channel a steady 200 km/h would
 * read as coasting while the rear tire carries 0.3 g of drive.
 *
 * Metres, never percentages: a percentage of a lap hides that one lap is
 * longer than the other.
 */
export function dutyMetres(s: Float32Array, grid: CompareGrid, opts: DutyOptions = {}): DutyMetres {
  const coastBand = opts.coastBand ?? 0.1;
  const gThreshold = opts.gThreshold ?? 0.8;
  const leanThreshold = opts.leanThreshold ?? 40;
  const sIn = opts.section ? opts.section.sIn : -Infinity;
  const sOut = opts.section ? opts.section.sOut : Infinity;
  const out: DutyMetres = { brake: 0, coast: 0, drive: 0, aboveG: 0, aboveLean: 0, total: 0 };
  for (let k = 0; k + 1 < s.length; k++) {
    const w = s[k + 1] - s[k];
    if (!(w > 0)) continue;
    if (s[k] < sIn || s[k + 1] > sOut) continue;
    out.total += w;
    const along = (grid.along[k] + grid.along[k + 1]) / 2;
    if (along < -coastBand) out.brake += w;
    else if (along > coastBand) out.drive += w;
    else out.coast += w;
    if ((grid.comb[k] + grid.comb[k + 1]) / 2 > gThreshold) out.aboveG += w;
    if (Math.abs((grid.lean[k] + grid.lean[k + 1]) / 2) > leanThreshold) out.aboveLean += w;
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
  /** seconds: smaller time differences are noise */
  time?: number;
  /** score points: smaller demand differences are noise */
  score?: number;
}

/**
 * Turn a pair of deltas into an instruction. Time alone says where the lap went;
 * time crossed with demand says *why*, which is the part a rider can act on:
 * losing time with less g means you backed off, losing it with the same g means
 * the line or the drive was wrong, and those need opposite responses.
 *
 * `deltaTime` is seconds against the reference across the turn (+ = slower),
 * `deltaScore` is apex demand points against the reference (+ = more g).
 */
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
  // The time matched. That is not the same as nothing happening: spending
  // materially more or less grip for the identical time is the most actionable
  // reading in the table, and calling it "Matched, same time, same demand"
  // threw it away.
  if (deltaScore > ds) return 'level-dearer';
  if (deltaScore < -ds) return 'level-cheaper';
  return 'level';
}

export const PAYOFF_LABEL: Record<TurnPayoff, string> = {
  'unmeasured': 'Not on this lap',
  'level': 'Matched',
  'faster-more-g': 'Faster: more grip used',
  'faster-other': 'Faster: line or drive',
  'slower-backed-off': 'Slower: backed off',
  'slower-despite-g': 'Slower: grip was there',
  'level-cheaper': 'Same time: cheaper',
  'level-dearer': 'Same time: dearer',
};

export const PAYOFF_HINT: Record<TurnPayoff, string> = {
  'unmeasured': 'This lap left the reference layout before this turn, so there is nothing to compare.',
  'level': 'Same time, same demand.',
  'faster-more-g': 'You leaned on the tyre harder here and it paid.',
  'faster-other': 'Same demand, less time: a better line or an earlier drive.',
  'slower-backed-off': 'Less demand and slower: the lap you already rode proves there is more here.',
  'slower-despite-g': 'The g was there but the time was not. Suspect the line, the apex or the exit drive.',
  'level-cheaper': 'Same time for less grip: the line was doing the work, not the tyre. This is the version to repeat.',
  'level-dearer': 'Same time but more grip spent: you paid tyre for nothing here.',
};

/** Mean pace over a lap, m/s: path length ÷ measured duration. */
export function lapPace(lap: CompareLapResult): number {
  const dur = lap.grid.t[lap.grid.t.length - 1];
  return dur > 0 ? lap.pathLength / dur : 0;
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
