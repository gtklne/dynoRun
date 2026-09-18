import type { PlateInk } from '@/ui/plate';

/** Display ramps using theme inks. No colour encodes measured grip margin. */

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

/** Adjustable colour anchor and aesthetic midpoint; neither is a tyre limit. */
const AMBER_AT = 0.55;

export function scoreColor(ink: PlateInk, g: number, anchorG: number): string {
  if (!Number.isFinite(g)) return ink.ink3;
  const u = Math.max(0, Math.min(1, g / (anchorG || 1)));
  if (u < AMBER_AT) return mixInk(ink.go, ink.caution, u / AMBER_AT);
  return mixInk(ink.caution, ink.stop, (u - AMBER_AT) / (1 - AMBER_AT));
}

/** Demand rate uses ink weight to keep it distinct from the demand ramp. */
export function rateColor(ink: PlateInk, n: number): string {
  if (!Number.isFinite(n)) return ink.ink3;
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
