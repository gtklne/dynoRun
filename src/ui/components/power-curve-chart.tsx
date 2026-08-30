import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import type { RpmPoint } from '@/shared/types';
import { convertPower, type PowerUnit } from '@/shared/format-power';
import { usePlateInk } from '@/ui/plate';
import {
  attachChartResize,
  HOVER_POINT_SIZE,
  legendValue,
  responsiveChartHeight,
  seriesStyle,
  themedAxis,
  themedCursor,
} from '@/ui/components/uplot-theme';

export interface CurveSeries {
  label: string;
  points: RpmPoint[];
  /** Override ink. Leave unset to take the plate's own series order. */
  stroke?: string;
  /** Override the dash pattern that goes with that ink. */
  dash?: number[];
}

export type CurveDisplayMode = 'power' | 'torque' | 'both';

interface Props {
  series: CurveSeries[];
  /** Default 'power'. 'both' draws power on left axis + torque on right axis. */
  mode?: CurveDisplayMode;
  /** Override the plate's series inks. Rarely needed. */
  palette?: string[];
  /** When supplied, converts power values to the user's unit and updates axis label.
   *  Default 'kW' (no conversion). */
  unit?: PowerUnit;
  /** Optional series label to mark as "best": adds a marker and a thicker stroke. */
  highlightLabel?: string;
  height?: number;
  /**
   * Publishes the RPM under the cursor, so the rest of the plate can report the
   * same instant. Null when the cursor leaves the plot.
   */
  onCursor?: (rpm: number | null) => void;
}

export function PowerCurveChart({
  series,
  mode = 'power',
  palette,
  unit = 'kW',
  highlightLabel,
  height = 320,
  onCursor,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const plotRef = useRef<uPlot | null>(null);
  const ink = usePlateInk();
  // Held in a ref so a new callback identity does not tear down and rebuild the
  // plot, which would drop the cursor the caller is currently reading.
  const onCursorRef = useRef(onCursor);
  onCursorRef.current = onCursor;

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

    // Colour AND dash together: a phone screen in direct sun, and a
    // colour-blind reader, both lose the hue and keep the pattern.
    const styleAt = (i: number, s?: CurveSeries) => {
      const base = seriesStyle(i, ink);
      return {
        stroke: s?.stroke ?? palette?.[i % palette.length] ?? base.stroke,
        dash: s?.dash ?? base.dash,
      };
    };

    const isHighlight = (label: string): boolean =>
      highlightLabel != null && label === highlightLabel;
    const decorate = (label: string): string => (isHighlight(label) ? `[best] ${label}` : label);
    const widthOf = (label: string): number => (isHighlight(label) ? 3 : 2);

    const seriesPoints = (color: string): uPlot.Series.Points => ({
      size: HOVER_POINT_SIZE,
      stroke: color,
      fill: color,
    });

    const computedHeight = responsiveChartHeight(height);

    const cursor = themedCursor({ x: true, y: true }, ink);
    const hooks: uPlot.Hooks.Arrays = {
      setCursor: [
        (u): void => {
          const cb = onCursorRef.current;
          if (!cb) return;
          const idx = u.cursor.idx;
          cb(idx == null ? null : (u.data[0][idx] as number));
        },
      ],
    };

    let data: uPlot.AlignedData;
    let opts: uPlot.Options;

    if (mode === 'both') {
      const yArrays: (number | null)[][] = [];
      const plotSeries: uPlot.Series[] = [{ value: rpmValue }];
      series.forEach((s, i) => {
        const power = styleAt(i * 2, s);
        const torque = styleAt(i * 2 + 1);
        yArrays.push(buildPowerY(s));
        plotSeries.push({
          label: `${decorate(s.label)} (P)`,
          stroke: power.stroke,
          dash: power.dash.length ? power.dash : undefined,
          width: widthOf(s.label),
          spanGaps: true,
          scale: 'power',
          value: powerValue,
          points: seriesPoints(power.stroke),
        });
        yArrays.push(buildTorqueY(s));
        plotSeries.push({
          label: `${decorate(s.label)} (T)`,
          stroke: torque.stroke,
          dash: torque.dash.length ? torque.dash : undefined,
          width: widthOf(s.label),
          spanGaps: true,
          scale: 'torque',
          value: torqueValue,
          points: seriesPoints(torque.stroke),
        });
      });
      data = [xs, ...yArrays] as uPlot.AlignedData;
      opts = {
        width: containerRef.current.clientWidth,
        height: computedHeight,
        scales: { x: { time: false }, power: {}, torque: {} },
        axes: [
          themedAxis({ label: 'RPM', ink }),
          themedAxis({ label: powerLabel, scale: 'power', decimals: 0, ink }),
          themedAxis({ label: torqueLabel, scale: 'torque', side: 1, showGrid: false, decimals: 0, ink }),
        ],
        series: plotSeries,
        legend: { show: true },
        cursor,
        hooks,
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
          themedAxis({ label: 'RPM', ink }),
          themedAxis({ label: useTorque ? torqueLabel : powerLabel, decimals: 0, ink }),
        ],
        series: [
          { value: rpmValue },
          ...series.map((s, i) => {
            const style = styleAt(i, s);
            return {
              label: decorate(s.label),
              stroke: style.stroke,
              dash: style.dash.length ? style.dash : undefined,
              width: widthOf(s.label),
              spanGaps: true,
              value: useTorque ? torqueValue : powerValue,
              points: seriesPoints(style.stroke),
            };
          }),
        ],
        legend: { show: true },
        cursor,
        hooks,
      };
    }

    plotRef.current = new uPlot(opts, data, containerRef.current);
    const detach = attachChartResize(containerRef.current, plotRef.current, height);
    return () => {
      detach();
      plotRef.current?.destroy();
      plotRef.current = null;
    };
  }, [series, mode, palette, unit, highlightLabel, height, ink]);

  if (series.length === 0) return <p className="t-annotation px-3 py-6 text-center">No data.</p>;
  return <div ref={containerRef} data-plate-figures />;
}
