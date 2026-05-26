import type { RawSpeedSample, SmoothedSample } from './types';

export interface AccelInterval {
  label: string;
  from_kmh: number;
  to_kmh: number;
  elapsed_s: number;
  distance_m: number;
}

export interface QuarterMile {
  elapsed_s: number;
  trap_speed_kmh: number;
}

export interface AccelTimes {
  duration_s: number;
  distance_m: number;
  start_speed_kmh: number;
  peak_speed_kmh: number;
  intervals: AccelInterval[];
  quarter_mile: QuarterMile | null;
}

const KMH_TO_MPS = 1 / 3.6;
const MPS_TO_KMH = 3.6;
const QUARTER_MILE_M = 402.336;

// Threshold used to allow "zero-start" intervals to count even when the user
// began rolling slightly (calibrations don't dock perfectly at zero).
const ZERO_START_TOLERANCE_KMH = 5;

const STANDARD_INTERVALS: ReadonlyArray<{
  label: string;
  from_kmh: number;
  to_kmh: number;
}> = [
  { label: '0–100 km/h', from_kmh: 0, to_kmh: 100 },
  { label: '60–100 km/h', from_kmh: 60, to_kmh: 100 },
  { label: '80–120 km/h', from_kmh: 80, to_kmh: 120 },
  { label: '100–200 km/h', from_kmh: 100, to_kmh: 200 },
];

function interpolateTimeAtSpeed(
  samples: ReadonlyArray<{ t_ms: number; speed_mps: number }>,
  target_mps: number,
): number | null {
  if (samples.length < 2) return null;
  if (samples[0].speed_mps >= target_mps) return samples[0].t_ms;
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].speed_mps >= target_mps) {
      const prev = samples[i - 1];
      const curr = samples[i];
      const span = curr.speed_mps - prev.speed_mps;
      if (span <= 0) return curr.t_ms;
      const frac = (target_mps - prev.speed_mps) / span;
      return prev.t_ms + frac * (curr.t_ms - prev.t_ms);
    }
  }
  return null;
}

function distanceUpTo(
  samples: ReadonlyArray<{ t_ms: number; speed_mps: number }>,
  cutoff_t_ms: number,
): number {
  if (samples.length < 2) return 0;
  let dist = 0;
  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1];
    const curr = samples[i];
    if (curr.t_ms <= cutoff_t_ms) {
      const dt = (curr.t_ms - prev.t_ms) / 1000;
      dist += 0.5 * (prev.speed_mps + curr.speed_mps) * dt;
    } else if (prev.t_ms < cutoff_t_ms) {
      const segDt = (curr.t_ms - prev.t_ms) / 1000;
      if (segDt <= 0) break;
      const frac = (cutoff_t_ms - prev.t_ms) / (curr.t_ms - prev.t_ms);
      const speed_at = prev.speed_mps + frac * (curr.speed_mps - prev.speed_mps);
      const dt = (cutoff_t_ms - prev.t_ms) / 1000;
      dist += 0.5 * (prev.speed_mps + speed_at) * dt;
      break;
    } else {
      break;
    }
  }
  return dist;
}

function timeAtDistance(
  samples: ReadonlyArray<{ t_ms: number; speed_mps: number }>,
  target_m: number,
): { t_ms: number; speed_mps: number } | null {
  if (samples.length < 2) return null;
  let cum = 0;
  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1];
    const curr = samples[i];
    const dt = (curr.t_ms - prev.t_ms) / 1000;
    if (dt <= 0) continue;
    const segDist = 0.5 * (prev.speed_mps + curr.speed_mps) * dt;
    if (cum + segDist + 1e-9 >= target_m) {
      const remaining = target_m - cum;
      const a = (curr.speed_mps - prev.speed_mps) / dt;
      let segT_s: number;
      if (Math.abs(a) < 1e-9) {
        segT_s = prev.speed_mps > 0 ? remaining / prev.speed_mps : 0;
      } else {
        const disc = prev.speed_mps * prev.speed_mps + 2 * a * remaining;
        if (disc < 0) return null;
        const root = (-prev.speed_mps + Math.sqrt(disc)) / a;
        // Pick the physically sensible root in [0, dt].
        segT_s = root >= 0 && root <= dt ? root : Math.max(0, Math.min(dt, root));
      }
      const speed_at = prev.speed_mps + a * segT_s;
      return { t_ms: prev.t_ms + segT_s * 1000, speed_mps: speed_at };
    }
    cum += segDist;
  }
  return null;
}

export function computeAccelTimes(samples: SmoothedSample[] | RawSpeedSample[]): AccelTimes {
  if (samples.length < 2) {
    return {
      duration_s: 0,
      distance_m: 0,
      start_speed_kmh: samples.length === 1 ? samples[0].speed_mps * MPS_TO_KMH : 0,
      peak_speed_kmh: samples.length === 1 ? samples[0].speed_mps * MPS_TO_KMH : 0,
      intervals: [],
      quarter_mile: null,
    };
  }

  const start = samples[0];
  let peakSpeed = start.speed_mps;
  let totalDist = 0;
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].speed_mps > peakSpeed) peakSpeed = samples[i].speed_mps;
    const dt = (samples[i].t_ms - samples[i - 1].t_ms) / 1000;
    if (dt > 0) {
      totalDist += 0.5 * (samples[i - 1].speed_mps + samples[i].speed_mps) * dt;
    }
  }
  const duration_s = (samples[samples.length - 1].t_ms - start.t_ms) / 1000;
  const start_kmh = start.speed_mps * MPS_TO_KMH;

  const intervals: AccelInterval[] = [];
  for (const def of STANDARD_INTERVALS) {
    // For nonzero "from" boundary, the run must have started at or below it
    // (otherwise we'd be reporting a slice we can't actually measure).
    if (def.from_kmh > 0 && start_kmh > def.from_kmh + 0.5) continue;
    // For the canonical 0-start intervals, allow a small rolling-start tolerance.
    if (def.from_kmh === 0 && start_kmh > ZERO_START_TOLERANCE_KMH) continue;

    const fromT = interpolateTimeAtSpeed(samples, def.from_kmh * KMH_TO_MPS);
    const toT = interpolateTimeAtSpeed(samples, def.to_kmh * KMH_TO_MPS);
    if (fromT == null || toT == null || toT <= fromT) continue;

    const elapsed_s = (toT - fromT) / 1000;
    const distance_m = distanceUpTo(samples, toT) - distanceUpTo(samples, fromT);
    intervals.push({
      label: def.label,
      from_kmh: def.from_kmh,
      to_kmh: def.to_kmh,
      elapsed_s,
      distance_m,
    });
  }

  let quarter_mile: QuarterMile | null = null;
  if (totalDist >= QUARTER_MILE_M && start_kmh <= ZERO_START_TOLERANCE_KMH) {
    const hit = timeAtDistance(samples, QUARTER_MILE_M);
    if (hit) {
      quarter_mile = {
        elapsed_s: (hit.t_ms - start.t_ms) / 1000,
        trap_speed_kmh: hit.speed_mps * MPS_TO_KMH,
      };
    }
  }

  return {
    duration_s,
    distance_m: totalDist,
    start_speed_kmh: start_kmh,
    peak_speed_kmh: peakSpeed * MPS_TO_KMH,
    intervals,
    quarter_mile,
  };
}
