// Grip Utilization colour language. The utilization ramp (green → amber →
// red) encodes "margin → at your limit"; the rate ramp (slate → cyan → white)
// encodes load-transfer speed and is deliberately distinct from it.

/** Brand accent for the Grip tool, shared by landing/home/wordmark. */
export const GRIP_BLUE = '#4c95ec';

const hexToRgb = (h: string): [number, number, number] => [
  parseInt(h.slice(0, 2), 16),
  parseInt(h.slice(2, 4), 16),
  parseInt(h.slice(4, 6), 16),
];
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mix = (a: [number, number, number], b: [number, number, number], f: number) =>
  `rgb(${Math.round(lerp(a[0], b[0], f))},${Math.round(lerp(a[1], b[1], f))},${Math.round(lerp(a[2], b[2], f))})`;

const U_LO = hexToRgb('0ca30c');
const U_MID = hexToRgb('fab219');
const U_HI = hexToRgb('d03b3b');

/** Utilization (0..1+) → green→amber→red. */
export function utilColor(u: number): string {
  u = Math.max(0, Math.min(1.05, u));
  if (u < 0.6) return mix(U_LO, U_MID, u / 0.6);
  return mix(U_MID, U_HI, Math.min(1, (u - 0.6) / 0.45));
}

const R0 = hexToRgb('3d4a63');
const R1 = hexToRgb('4fb0ff');
const R2 = hexToRgb('ffffff');

/** Normalised load-transfer rate (0..1) → dim slate → cyan → white. */
export function rateColor(n: number): string {
  n = Math.max(0, Math.min(1, n));
  if (n < 0.6) return mix(R0, R1, n / 0.6);
  return mix(R1, R2, (n - 0.6) / 0.4);
}
