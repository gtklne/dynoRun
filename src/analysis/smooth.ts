import type { ResampledSample, SmoothedSample } from './types';

export function smoothSavitzkyGolay(input: ResampledSample[], windowSize: number): SmoothedSample[] {
  if (windowSize % 2 === 0 || windowSize < 3) {
    throw new Error('windowSize must be odd and >= 3');
  }
  if (input.length < windowSize) return input.map((s) => ({ ...s }));
  const m = (windowSize - 1) / 2;
  const denom = (2 * m + 3) * (2 * m + 1) * (2 * m - 1);
  const coeffs: number[] = [];
  for (let i = -m; i <= m; i++) {
    coeffs.push((3 * (3 * m * (m + 1) - 1 - 5 * i * i)) / denom);
  }
  const out: SmoothedSample[] = input.map((s) => ({ ...s }));
  for (let k = m; k < input.length - m; k++) {
    let sum = 0;
    for (let i = -m; i <= m; i++) sum += coeffs[i + m] * input[k + i].speed_mps;
    out[k].speed_mps = sum;
  }
  return out;
}
