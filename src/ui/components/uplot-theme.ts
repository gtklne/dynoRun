import type uPlot from 'uplot';

export const CHART_FONT = '13px system-ui, -apple-system, sans-serif';
export const CHART_LABEL_FONT = '600 13px system-ui, -apple-system, sans-serif';

export const AXIS_STROKE = '#a1a1aa';
export const GRID_STROKE = '#27272a';
export const CURSOR_STROKE = '#fbbf24';
export const HOVER_POINT_SIZE = 9;

const MOBILE_BREAKPOINT = 640;
const MOBILE_HEIGHT_FACTOR = 1.2;

export function responsiveChartHeight(baseHeight: number): number {
  if (typeof window === 'undefined') return baseHeight;
  return window.innerWidth < MOBILE_BREAKPOINT
    ? Math.round(baseHeight * MOBILE_HEIGHT_FACTOR)
    : baseHeight;
}

interface ThemedAxisOptions {
  label?: string;
  scale?: string;
  side?: 0 | 1 | 2 | 3;
  showGrid?: boolean;
  labelSize?: number;
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
  return axis;
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
