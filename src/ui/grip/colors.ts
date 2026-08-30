import type { PlateInk } from '@/ui/plate';

/**
 * Grip's two ramps, both derived from the plate's inks rather than from fixed
 * hex. Canvas cannot read a Tailwind utility, so without this every chart would
 * keep printing day ink on a night sheet.
 *
 * The two ramps must never be confusable, so they run on different channels
 * entirely. Demand is the traffic light and means on screen what it means on a
 * circuit: green while there is grip in hand, amber as the tyre starts working,
 * red at the tyre-class limit. Load transfer is ink at increasing weight, no hue
 * at all, so a transfer streak can never be read as grip demand.
 */

type Rgb = [number, number, number];

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * Plate tokens are authored as hex, but a computed custom property can come
 * back in any serialisation the browser likes, so `rgb()` is accepted too. An
 * unparseable colour returns null and the caller degrades to an endpoint: a
 * NaN channel would be dropped silently by canvas and paint nothing at all.
 */
function toRgb(color: string): Rgb | null {
  const s = color.trim();
  if (HEX.test(s)) {
    const h = s.slice(1);
    const full = h.length === 3 ? `${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}` : h;
    return [
      parseInt(full.slice(0, 2), 16),
      parseInt(full.slice(2, 4), 16),
      parseInt(full.slice(4, 6), 16),
    ];
  }
  const m = /^rgba?\(([^)]+)\)$/i.exec(s);
  if (!m) return null;
  const parts = m[1].split(/[\s,/]+/).filter(Boolean).slice(0, 3).map(Number);
  if (parts.length < 3 || parts.some((v) => !Number.isFinite(v))) return null;
  return [parts[0], parts[1], parts[2]];
}

/** Blend two plate inks. `f` is clamped, so a ramp can never run off its ends. */
export function mixInk(a: string, b: string, f: number): string {
  const x = toRgb(a);
  const y = toRgb(b);
  if (!x || !y) return f < 0.5 ? a : b;
  const t = Math.max(0, Math.min(1, f));
  const c = (i: 0 | 1 | 2) => Math.round(x[i] + (y[i] - x[i]) * t);
  return `rgb(${c(0)},${c(1)},${c(2)})`;
}

/** A plate ink at partial opacity, for a fill that must not hide what is under it. */
export function inkAlpha(color: string, alpha: number): string {
  const x = toRgb(color);
  if (!x) return color;
  return `rgba(${x[0]},${x[1]},${x[2]},${Math.max(0, Math.min(1, alpha))})`;
}

/**
 * Grip or load demand in g as a traffic light, anchored so the red end sits at
 * the tyre-class grip level (`settings.anchorG`). Scores stay absolute; only the
 * colours rescale, which is why changing the anchor recolours but never
 * rescores.
 *
 * Amber is placed at 55% of the anchor rather than at the midpoint on purpose:
 * a tyre is already working hard well before the limit, and a ramp that only
 * leaves green in the last third reads as "fine, fine, fine, red".
 */
const AMBER_AT = 0.55;

export function scoreColor(ink: PlateInk, g: number, anchorG: number): string {
  const u = Math.max(0, Math.min(1, g / (anchorG || 1)));
  if (u < AMBER_AT) return mixInk(ink.go, ink.caution, u / AMBER_AT);
  return mixInk(ink.caution, ink.stop, (u - AMBER_AT) / (1 - AMBER_AT));
}

/**
 * Normalised load-transfer rate (0..1) as ink weight, never as hue.
 *
 * It shares a canvas with the demand ramp (the comet trail crosses the g-g
 * scatter, the timeline cursor dot sits under the track map), so putting both
 * on the traffic light would make a violent throttle-to-brake swap and a corner
 * at the limit the same colour while meaning opposite things. Dim ink to full
 * ink is unmistakably a different scale and still reads at a glance.
 */
export function rateColor(ink: PlateInk, n: number): string {
  return mixInk(ink.ink3, ink.ink, Math.max(0, Math.min(1, n)));
}

/**
 * The demand ramp as discrete steps for a legend. A continuous gradient is not
 * available to this world (and a printed chart legend is stepped anyway), so
 * the reader gets swatches they can actually match a segment against.
 */
export function demandSwatches(
  ink: PlateInk,
  anchorG: number,
  steps = 6,
): { g: number; color: string }[] {
  const out: { g: number; color: string }[] = [];
  for (let i = 0; i < steps; i++) {
    const g = (anchorG * (i + 1)) / steps;
    out.push({ g, color: scoreColor(ink, g, anchorG) });
  }
  return out;
}
