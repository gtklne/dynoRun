import { SERIES_DASH, seriesInk, type PlateInk } from '@/ui/plate';
import { mixInk } from './colors';

/**
 * Compare needs two colour languages the analyzer does not have, and both are
 * built from the plate's inks so the night plate switches them too.
 *
 * Lap identity is ink AND dash together (`seriesColor` + `seriesDash`), never a
 * traffic-light hue: a lap cannot be "the green one" on a screen where green
 * also means you gained time. Six traces separated by hue alone would fail a
 * colour-blind reader and everyone on a phone in direct sun besides.
 *
 * Judgement is where the traffic light is spent. A signed time delta diverges
 * from a genuinely neutral midpoint, red for time lost and green for time
 * gained, so a zero delta cannot read as a small loss.
 */

/** How many laps one comparison can hold before colour and dash would repeat. */
export const MAX_COMPARE_LAPS = SERIES_DASH.length;

const wrap = (index: number, length: number) => ((index % length) + length) % length;

/**
 * Lap identity colour by position in the selection. Index 0 is plain ink, and
 * the reference always takes it, so it reads as the baseline the rest are
 * measured against.
 */
export function seriesColor(ink: PlateInk, index: number): string {
  const series = seriesInk(ink);
  return series[wrap(index, series.length)];
}

/** The dash pattern that goes with `seriesColor` at the same index. */
export function seriesDash(index: number): number[] {
  return SERIES_DASH[wrap(index, SERIES_DASH.length)];
}

/**
 * Signed seconds to a diverging traffic light: red for time lost, green for
 * time gained, ink-3 at the middle. `fullScale` is the delta that saturates, so
 * the ramp adapts to whether laps are 0.2 s or 3 s apart.
 *
 * The midpoint has to be a real neutral rather than a pale red, or every lap
 * that merely matched the reference would read as slightly behind it.
 */
export function deltaColor(ink: PlateInk, seconds: number, fullScale: number): string {
  const f = Math.max(-1, Math.min(1, seconds / (fullScale || 1)));
  return f >= 0 ? mixInk(ink.ink3, ink.stop, f) : mixInk(ink.ink3, ink.go, -f);
}

/** Plate text class for a signed delta: lost time reads stop, gained time go. */
export function deltaTextClass(seconds: number, eps = 0.05): string {
  if (!Number.isFinite(seconds) || Math.abs(seconds) <= eps) return 'text-ink-3';
  return seconds > 0 ? 'text-stop' : 'text-go';
}

/** Signed seconds → "+1.23" / "−0.41" / "±0.00", always 2 dp. */
export function formatDelta(seconds: number, dp = 2): string {
  if (!Number.isFinite(seconds)) return 'n/a';
  const sign = seconds > 0 ? '+' : seconds < 0 ? '−' : '±';
  return `${sign}${Math.abs(seconds).toFixed(dp)}`;
}
