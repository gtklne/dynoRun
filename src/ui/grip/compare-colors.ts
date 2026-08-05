// Compare needs two colour languages the session screen does not have, and
// both must stay clear of the ones it already uses. colors.ts owns the demand
// ramp (green → amber → red = "margin → at your limit") and the rate ramp
// (slate → cyan → white = load-transfer speed); a lap identity drawn in either
// would read as a *value*. So series colours avoid green/amber/red entirely,
// and signed time deltas get their own diverging sky↔rose ramp.

/**
 * Lap identity colours, assigned by position in the selection. The reference
 * lap always takes index 0 (near-white), which also makes it read as the
 * baseline the others are measured against.
 */
export const SERIES_COLORS = [
  '#e4e4e7', // zinc-200 — reference
  '#4c95ec', // grip blue
  '#c084fc', // violet
  '#f472b6', // pink
  '#2dd4bf', // teal
  '#818cf8', // indigo
] as const;

/** How many laps one comparison can hold before colours would repeat. */
export const MAX_COMPARE_LAPS = SERIES_COLORS.length;

export function seriesColor(index: number): string {
  return SERIES_COLORS[index % SERIES_COLORS.length];
}

const hexToRgb = (h: string): [number, number, number] => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];
const mix = (a: [number, number, number], b: [number, number, number], f: number) =>
  `rgb(${Math.round(a[0] + (b[0] - a[0]) * f)},${Math.round(a[1] + (b[1] - a[1]) * f)},${Math.round(a[2] + (b[2] - a[2]) * f)})`;

const GAIN = hexToRgb('#38bdf8'); // sky — time gained
const NEUTRAL = hexToRgb('#52525b'); // zinc-600 — level
const LOSS = hexToRgb('#fb7185'); // rose — time lost

/**
 * Signed seconds → diverging colour. `fullScale` is the delta that saturates,
 * so the ramp adapts to whether laps are 0.2 s or 3 s apart.
 */
export function deltaColor(seconds: number, fullScale: number): string {
  const f = Math.max(-1, Math.min(1, seconds / (fullScale || 1)));
  return f >= 0 ? mix(NEUTRAL, LOSS, f) : mix(NEUTRAL, GAIN, -f);
}

/** Tailwind text class for a signed delta: lost time reads warm. */
export function deltaTextClass(seconds: number, eps = 0.05): string {
  if (Math.abs(seconds) <= eps) return 'text-zinc-400';
  return seconds > 0 ? 'text-rose-400' : 'text-sky-400';
}

/** Signed seconds → "+1.23" / "−0.41" / "±0.00", always 2 dp. */
export function formatDelta(seconds: number, dp = 2): string {
  if (!Number.isFinite(seconds)) return '—';
  const sign = seconds > 0 ? '+' : seconds < 0 ? '−' : '±';
  return `${sign}${Math.abs(seconds).toFixed(dp)}`;
}
