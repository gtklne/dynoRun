import type { RawSpeedSample, ResampledSample } from './types';

export function resample(input: RawSpeedSample[], step_ms: number): ResampledSample[] {
  if (input.length === 0) return [];
  if (input.length === 1) return [{ t_ms: input[0].t_ms, speed_mps: input[0].speed_mps }];

  const sorted = [...input].sort((a, b) => a.t_ms - b.t_ms);
  const t0 = sorted[0].t_ms;
  const tn = sorted[sorted.length - 1].t_ms;
  const out: ResampledSample[] = [];

  let j = 0;
  for (let t = t0; t <= tn + 1e-6; t += step_ms) {
    while (j < sorted.length - 1 && sorted[j + 1].t_ms < t) j++;
    const a = sorted[j];
    const b = sorted[Math.min(j + 1, sorted.length - 1)];
    if (a.t_ms === b.t_ms) {
      out.push({ t_ms: t, speed_mps: a.speed_mps });
    } else {
      const f = (t - a.t_ms) / (b.t_ms - a.t_ms);
      out.push({ t_ms: t, speed_mps: a.speed_mps + f * (b.speed_mps - a.speed_mps) });
    }
  }
  return out;
}
