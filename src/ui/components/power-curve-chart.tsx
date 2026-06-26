import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import type { RpmPoint } from '@/shared/types';
import { convertPower, type PowerUnit } from '@/shared/format-power';
import {
  attachChartResize,
  CURSOR_STROKE,
  HOVER_POINT_SIZE,
  legendValue,
  responsiveChartHeight,
  themedAxis,
  themedCursor,
} from '@/ui/components/uplot-theme';

export interface CurveSeries {
  label: string;
  points: RpmPoint[];
  stroke?: string;
}

export type CurveDisplayMode = 'power' | 'torque' | 'both';

const DEFAULT_PALETTE = ['#f59e0b', '#22d3ee', '#a78bfa', '#34d399', '#f472b6', '#fbbf24', '#60a5fa'];

interface Props {
  series: CurveSeries[];
  /** Default 'power'. 'both' draws power on left axis + torque on right axis. */
  mode?: CurveDisplayMode;
  /** Default amber-led app palette. */
  palette?: string[];
  /** When supplied, converts power values to the user's unit and updates axis label.
   *  Default 'kW' (no conversion). */
  unit?: PowerUnit;
  /** Optional series label to mark as "best" — adds a star and a thicker stroke. */
  highlightLabel?: string;
  height?: number;
}

export function PowerCurveChart({
  series,
  mode = 'power',
  palette = DEFAULT_PALETTE,
  unit = 'kW',
  highlightLabel,
  height = 320,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const plotRef = useRef<uPlot | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    if (series.length === 0) return;

    const rpmSet = new Set<number>();
    for (const s of series) for (const p of s.points) rpmSet.add(p.rpm);
    const xs = [...rpmSet].sort((a, b) => a - b);

    const powerLabel = `Power (${unit})`;
    const torqueLabel = 'Torque (Nm)';

    // Legend hover values: round + carry a unit (hp/PS read as whole numbers to
    // match the headline peak stats; kW keeps one decimal).
    const rpmValue = legendValue('RPM', 0);
    const powerValue = legendValue(unit, unit === 'kW' ? 1 : 0);
    const torqueValue = legendValue('Nm', 1);

    const buildPowerY = (s: CurveSeries): (number | null)[] => {
      const map = new Map(s.points.map((p) => [p.rpm, p.wheel_power_kw]));
      return xs.map((x) => {
        const kw = map.get(x);
        if (kw == null) return null;
        return unit === 'kW' ? kw : convertPower(kw, unit);
      });
    };
    const buildTorqueY = (s: CurveSeries): (number | null)[] => {
      const map = new Map(s.points.map((p) => [p.rpm, p.wheel_torque_nm]));
      return xs.map((x) => map.get(x) ?? null);
    };

    const isHighlight = (label: string): boolean =>
      highlightLabel != null && label === highlightLabel;
    const decorate = (label: string): string =>
      isHighlight(label) ? `★ ${label}` : label;
    const widthOf = (label: string): number => (isHighlight(label) ? 3 : 2);

    const seriesPoints = (color: string): uPlot.Series.Points => ({
      size: HOVER_POINT_SIZE,
      stroke: color,
      fill: color,
    });

    const computedHeight = responsiveChartHeight(height);

    let data: uPlot.AlignedData;
    let opts: uPlot.Options;

    if (mode === 'both') {
      const yArrays: (number | null)[][] = [];
      const plotSeries: uPlot.Series[] = [{ value: rpmValue }];
      series.forEach((s, i) => {
        const colorP = s.stroke ?? palette[i % palette.length];
        const colorT = palette[(i + series.length) % palette.length];
        yArrays.push(buildPowerY(s));
        plotSeries.push({
          label: `${decorate(s.label)} (P)`,
          stroke: colorP,
          width: widthOf(s.label),
          spanGaps: true,
          scale: 'power',
          value: powerValue,
          points: seriesPoints(colorP),
        });
        yArrays.push(buildTorqueY(s));
        plotSeries.push({
          label: `${decorate(s.label)} (T)`,
          stroke: colorT,
          width: widthOf(s.label),
          spanGaps: true,
          scale: 'torque',
          value: torqueValue,
          points: seriesPoints(colorT),
        });
      });
      data = [xs, ...yArrays] as uPlot.AlignedData;
      opts = {
        width: containerRef.current.clientWidth,
        height: computedHeight,
        scales: { x: { time: false }, power: {}, torque: {} },
        axes: [
          themedAxis({ label: 'RPM' }),
          themedAxis({ label: powerLabel, scale: 'power', decimals: 0 }),
          themedAxis({ label: torqueLabel, scale: 'torque', side: 1, showGrid: false, decimals: 0 }),
        ],
        series: plotSeries,
        legend: { show: true },
        cursor: themedCursor({ x: true, y: true, points: { stroke: CURSOR_STROKE } }),
      };
    } else {
      const useTorque = mode === 'torque';
      const yArrays: (number | null)[][] = series.map((s) =>
        useTorque ? buildTorqueY(s) : buildPowerY(s),
      );
      data = [xs, ...yArrays] as uPlot.AlignedData;
      opts = {
        width: containerRef.current.clientWidth,
        height: computedHeight,
        scales: { x: { time: false } },
        axes: [
          themedAxis({ label: 'RPM' }),
          themedAxis({ label: useTorque ? torqueLabel : powerLabel, decimals: 0 }),
        ],
        series: [
          { value: rpmValue },
          ...series.map((s, i) => {
            const color = s.stroke ?? palette[i % palette.length];
            return {
              label: decorate(s.label),
              stroke: color,
              width: widthOf(s.label),
              spanGaps: true,
              value: useTorque ? torqueValue : powerValue,
              points: seriesPoints(color),
            };
          }),
        ],
        legend: { show: true },
        cursor: themedCursor({ x: true, y: true, points: { stroke: CURSOR_STROKE } }),
      };
    }

    plotRef.current = new uPlot(opts, data, containerRef.current);
    const detach = attachChartResize(containerRef.current, plotRef.current, height);
    return () => {
      detach();
      plotRef.current?.destroy();
      plotRef.current = null;
    };
  }, [series, mode, palette, unit, highlightLabel, height]);

  if (series.length === 0) return <p>No data.</p>;
  return <div ref={containerRef} />;
}
