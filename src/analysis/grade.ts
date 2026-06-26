import type { RawSpeedSample, GradeSource } from './types';

// Shared geometry: net altitude change + path distance over the pull, with the
// validity guards applied. Returns null when grade cannot be trusted (too few
// altitude fixes, stationary/degenerate capture, or |Δalt| exceeding the path —
// physically impossible, so bad GPS altitude). Single source of truth so
// computeGradeRad and computeGradeSource can never drift.
function gradeGeometry(samples: RawSpeedSample[]): { deltaAlt: number; distance_m: number } | null {
  if (samples.length < 2) return null;

  const withAlt = samples.filter((s) => s.altitude_m != null);
  if (withAlt.length < 2) return null;

  const firstAlt = withAlt[0].altitude_m as number;
  const lastAlt = withAlt[withAlt.length - 1].altitude_m as number;
  const deltaAlt = lastAlt - firstAlt;

  let distance_m = 0;
  for (let i = 1; i < samples.length; i++) {
    const dt_s = (samples[i].t_ms - samples[i - 1].t_ms) / 1000;
    if (dt_s <= 0) continue;
    distance_m += ((samples[i].speed_mps + samples[i - 1].speed_mps) / 2) * dt_s;
  }

  if (distance_m < 1 || Math.abs(deltaAlt) >= distance_m) return null;

  return { deltaAlt, distance_m };
}

// Average road grade over a pull, as an angle in radians.
//
// We use net altitude change ÷ path distance — an INTEGRAL, not a per-sample
// derivative — because GPS altitude is noisy (±10–30 m) and differentiating it
// per sample would yield garbage. Over the length of a pull the endpoint delta
// is robust. Path distance comes from integrating speed (trapezoid), which is
// the same signal the rest of the pipeline trusts.
//
// Returns 0 when altitude is unavailable (older runs, devices without altitude,
// or too little distance to be meaningful) so the grade term simply drops out
// and the rest of the road-load model still applies.
export function computeGradeRad(samples: RawSpeedSample[]): number {
  const geo = gradeGeometry(samples);
  if (!geo) return 0;
  return Math.atan(geo.deltaAlt / geo.distance_m);
}

// Whether the grade angle is backed by usable GPS altitude ('gps') or had to
// fall back to 0 for lack of trustworthy altitude ('unavailable'). Lets the UI
// distinguish a genuinely flat road (grade≈0, source 'gps') from "no data".
export function computeGradeSource(samples: RawSpeedSample[]): GradeSource {
  return gradeGeometry(samples) ? 'gps' : 'unavailable';
}
