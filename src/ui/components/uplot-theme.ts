import type uPlot from 'uplot';
import { readPlateInk, seriesInk, SERIES_DASH, type PlateInk } from '@/ui/plate/tokens';

/**
 * uPlot drawn on the plate.
 *
 * Canvas cannot read a Tailwind utility or a custom property, so every ink a
 * chart uses is resolved from the same `--color-*` tokens the DOM half uses
 * (see `plate/tokens.ts`). Nothing here carries a literal colour: a hex in
 * chart code is exactly how the night plate ends up with a day-plate grid.
 */

const FAMILY = 'Archivo, system-ui, -apple-system, sans-serif';

export const CHART_FONT = `500 11px ${FAMILY}`;
export const CHART_LABEL_FONT = `700 11px ${FAMILY}`;
export const HOVER_POINT_SIZE = 9;

const MOBILE_BREAKPOINT = 640;
const MOBILE_HEIGHT_FACTOR = 1.2;
const DESKTOP_BREAKPOINT = 1024;
const DESKTOP_HEIGHT_FACTOR = 1.25;

export function responsiveChartHeight(baseHeight: number): number {
  if (typeof window === 'undefined') return baseHeight;
  const w = window.innerWidth;
  // Phones get a taller-aspect chart; desktop columns are wide, so a taller
  // canvas keeps the curve from looking stretched and short.
  if (w < MOBILE_BREAKPOINT) return Math.round(baseHeight * MOBILE_HEIGHT_FACTOR);
  if (w >= DESKTOP_BREAKPOINT) return Math.round(baseHeight * DESKTOP_HEIGHT_FACTOR);
  return baseHeight;
}

/**
 * Keep a uPlot instance sized to its container. uPlot captures width once at
 * construction; without this it never reflows when the container changes,
 * which is exactly what happens with the desktop multi-column layouts, a
 * window resize, or crossing the mobile/desktop breakpoint. Re-derives height
 * from {@link responsiveChartHeight} on each change so the breakpoint tiers
 * apply live. No-ops where ResizeObserver is unavailable (e.g. jsdom in tests).
 *
 * Returns a cleanup function to disconnect the observer.
 */
export function attachChartResize(
  container: HTMLElement,
  plot: uPlot,
  baseHeight: number,
): () => void {
  if (typeof ResizeObserver === 'undefined') return () => {};
  const ro = new ResizeObserver(() => {
    const width = container.clientWidth;
    if (width <= 0) return;
    const height = responsiveChartHeight(baseHeight);
    if (width === plot.width && height === plot.height) return;
    plot.setSize({ width, height });
  });
  ro.observe(container);
  return () => ro.disconnect();
}

/**
 * One overlaid series: an ink AND a dash pattern, never one alone. A legend
 * that separates runs by hue only fails a colour-blind reader and fails anyone
 * reading a phone in direct sun, which is most of this product's audience.
 */
export function seriesStyle(index: number, ink: PlateInk): { stroke: string; dash: number[] } {
  const inks = seriesInk(ink);
  return {
    stroke: inks[index % inks.length],
    dash: SERIES_DASH[index % SERIES_DASH.length],
  };
}

interface ThemedAxisOptions {
  label?: string;
  scale?: string;
  side?: 0 | 1 | 2 | 3;
  showGrid?: boolean;
  labelSize?: number;
  /** Resolved plate inks. Defaults to reading them off the document. */
  ink?: PlateInk;
  /** Fix the tick-label decimals. Without it uPlot derives precision from its
   *  auto-chosen increment, so a narrow value range prints fractional ticks
   *  (e.g. `117.5` kW). Use 0 for absolute power/torque/speed; leave unset for
   *  time/RPM axes that are already whole. */
  decimals?: number;
}

export function themedAxis(opts: ThemedAxisOptions = {}): uPlot.Axis {
  const ink = opts.ink ?? readPlateInk();
  const axis: uPlot.Axis = {
    stroke: ink.ink2,
    font: CHART_FONT,
    labelFont: CHART_LABEL_FONT,
    grid: { stroke: ink.ruleFaint, width: 1, show: opts.showGrid !== false },
    ticks: { stroke: ink.rule, width: 1 },
  };
  if (opts.label !== undefined) axis.label = opts.label;
  if (opts.scale !== undefined) axis.scale = opts.scale;
  if (opts.side !== undefined) axis.side = opts.side;
  if (opts.labelSize !== undefined) axis.labelSize = opts.labelSize;
  // Bare integers, never grouped thousands: the plate writes 2000 RPM, not
  // 1,000, and the landing plots and the app plots have to agree.
  const decimals = opts.decimals ?? 0;
  axis.values = (_u: uPlot, splits: number[]) => splits.map((v) => v.toFixed(decimals));
  return axis;
}

/** Legend value formatter: rounds the hovered value to `decimals` and appends a
 *  unit. Without this uPlot prints the raw bin value at full float precision
 *  (e.g. `117.23412` hp) with no unit. A reading the cursor cannot take prints
 *  `n/a`, never a dash glyph and never a fabricated zero. */
export function legendValue(unit: string, decimals = 1) {
  return (_self: uPlot, raw: number | null): string =>
    raw == null || !Number.isFinite(raw) ? 'n/a' : `${raw.toFixed(decimals)} ${unit}`;
}

/** The cursor is the one place magenta appears in a chart: it marks the instant
 *  you are reading, which is the cross-reference the whole plate is built on. */
export function themedCursor(extras: uPlot.Cursor = {}, ink?: PlateInk): uPlot.Cursor {
  const resolved = ink ?? readPlateInk();
  return {
    ...extras,
    points: {
      size: HOVER_POINT_SIZE,
      stroke: resolved.procedure,
      ...(extras.points ?? {}),
    },
  };
}
