import type { RawSpeedSample } from './types';

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
  if (samples.length < 2) return 0;

  const withAlt = samples.filter((s) => s.altitude_m != null);
  if (withAlt.length < 2) return 0;

  const firstAlt = withAlt[0].altitude_m as number;
  const lastAlt = withAlt[withAlt.length - 1].altitude_m as number;
  const deltaAlt = lastAlt - firstAlt;

  let distance_m = 0;
  for (let i = 1; i < samples.length; i++) {
    const dt_s = (samples[i].t_ms - samples[i - 1].t_ms) / 1000;
    if (dt_s <= 0) continue;
    distance_m += ((samples[i].speed_mps + samples[i - 1].speed_mps) / 2) * dt_s;
  }

  // Guard against a stationary/degenerate capture and against |Δalt| exceeding
  // the path (impossible on real roads → bad altitude data); either way, no grade.
  if (distance_m < 1 || Math.abs(deltaAlt) >= distance_m) return 0;

  return Math.atan(deltaAlt / distance_m);
}
