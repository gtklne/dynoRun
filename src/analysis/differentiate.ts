import type { SmoothedSample, DifferentiatedSample } from './types';

export function differentiate(input: SmoothedSample[]): DifferentiatedSample[] {
  const n = input.length;
  if (n === 0) return [];
  if (n === 1) return [{ t_ms: input[0].t_ms, speed_mps: input[0].speed_mps, accel_ms2: 0 }];
  const out: DifferentiatedSample[] = new Array(n);
  for (let i = 0; i < n; i++) {
    let accel: number;
    if (i === 0) {
      accel = (input[1].speed_mps - input[0].speed_mps) / ((input[1].t_ms - input[0].t_ms) / 1000);
    } else if (i === n - 1) {
      accel = (input[n - 1].speed_mps - input[n - 2].speed_mps) / ((input[n - 1].t_ms - input[n - 2].t_ms) / 1000);
    } else {
      accel = (input[i + 1].speed_mps - input[i - 1].speed_mps) / ((input[i + 1].t_ms - input[i - 1].t_ms) / 1000);
    }
    out[i] = { t_ms: input[i].t_ms, speed_mps: input[i].speed_mps, accel_ms2: accel };
  }
  return out;
}
