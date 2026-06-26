import type uPlot from 'uplot';

export const CHART_FONT = '13px system-ui, -apple-system, sans-serif';
export const CHART_LABEL_FONT = '600 13px system-ui, -apple-system, sans-serif';

export const AXIS_STROKE = '#a1a1aa';
export const GRID_STROKE = '#27272a';
export const CURSOR_STROKE = '#fbbf24';
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
 * construction; without this it never reflows when the container changes —
 * which is exactly what happens with the desktop multi-column layouts, a
 * window resize, or crossing the mobile↔desktop breakpoint. Re-derives height
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

interface ThemedAxisOptions {
  label?: string;
  scale?: string;
  side?: 0 | 1 | 2 | 3;
  showGrid?: boolean;
  labelSize?: number;
  /** Fix the tick-label decimals. Without it uPlot derives precision from its
   *  auto-chosen increment, so a narrow value range prints fractional ticks
   *  (e.g. `117.5` kW). Use 0 for absolute power/torque/speed; leave unset for
   *  time/RPM axes that are already whole. */
  decimals?: number;
}

export function themedAxis(opts: ThemedAxisOptions = {}): uPlot.Axis {
  const axis: uPlot.Axis = {
    stroke: AXIS_STROKE,
    font: CHART_FONT,
    labelFont: CHART_LABEL_FONT,
    grid: { stroke: GRID_STROKE, width: 1, show: opts.showGrid !== false },
    ticks: { stroke: GRID_STROKE, width: 1 },
  };
  if (opts.label !== undefined) axis.label = opts.label;
  if (opts.scale !== undefined) axis.scale = opts.scale;
  if (opts.side !== undefined) axis.side = opts.side;
  if (opts.labelSize !== undefined) axis.labelSize = opts.labelSize;
  if (opts.decimals !== undefined) {
    const d = opts.decimals;
    axis.values = (_u: uPlot, splits: number[]) => splits.map((v) => v.toFixed(d));
  }
  return axis;
}

/** Legend value formatter: rounds the hovered value to `decimals` and appends a
 *  unit. Without this uPlot prints the raw bin value at full float precision
 *  (e.g. `117.23412` hp) with no unit. Renders an em dash when the cursor is off
 *  the data (raw is null). */
export function legendValue(unit: string, decimals = 1) {
  return (_self: uPlot, raw: number | null): string =>
    raw == null || !Number.isFinite(raw) ? '—' : `${raw.toFixed(decimals)} ${unit}`;
}

export function themedCursor(extras: uPlot.Cursor = {}): uPlot.Cursor {
  return {
    ...extras,
    points: {
      size: HOVER_POINT_SIZE,
      ...(extras.points ?? {}),
    },
  };
}
