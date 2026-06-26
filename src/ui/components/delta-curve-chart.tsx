import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import type { CurveDeltaPoint } from '@/analysis/curve-delta';
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

interface Props {
  delta: CurveDeltaPoint[];
  /** Default 'power' — switch to 'torque' to plot delta_torque_nm in Nm. */
  metric?: 'power' | 'torque';
  /** Power unit. Only honored when metric === 'power'. */
  unit?: PowerUnit;
  height?: number;
  /** Labels for the two runs, used in the legend ("Run A - Run B"). */
  labelA?: string;
  labelB?: string;
}

const POSITIVE = '#10b981';
const POSITIVE_FILL = 'rgba(16, 185, 129, 0.25)';
const NEGATIVE = '#ef4444';
const NEGATIVE_FILL = 'rgba(239, 68, 68, 0.25)';

export function DeltaCurveChart({
  delta,
  metric = 'power',
  unit = 'kW',
  height = 320,
  labelA,
  labelB,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const plotRef = useRef<uPlot | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    if (delta.length === 0) return;

    const xs = delta.map((d) => d.rpm);
    const values = delta.map((d) => {
      if (metric === 'torque') return d.delta_torque_nm;
      const kw = d.delta_power_kw;
      return unit === 'kW' ? kw : convertPower(kw, unit);
    });

    // Split into two series so each side can carry its own colour. Zero-valued
    // bins are emitted on both so the line stays anchored to the zero baseline
    // across sign flips (otherwise the fill would clip a sliver short of zero).
    const pos: (number | null)[] = values.map((v) => (v >= 0 ? v : null));
    const neg: (number | null)[] = values.map((v) => (v <= 0 ? v : null));

    const yLabel =
      metric === 'torque' ? 'Δ Torque (Nm)' : `Δ Power (${unit})`;
    const aLabel = labelA ?? 'A';
    const bLabel = labelB ?? 'B';

    const rpmValue = legendValue('RPM', 0);
    const deltaValue =
      metric === 'torque' ? legendValue('Nm', 1) : legendValue(unit, unit === 'kW' ? 1 : 0);

    const opts: uPlot.Options = {
      width: containerRef.current.clientWidth,
      height: responsiveChartHeight(height),
      scales: { x: { time: false } },
      axes: [themedAxis({ label: 'RPM' }), themedAxis({ label: yLabel, decimals: 1 })],
      series: [
        { value: rpmValue },
        {
          label: `${aLabel} > ${bLabel}`,
          stroke: POSITIVE,
          fill: POSITIVE_FILL,
          fillTo: () => 0,
          width: 2,
          spanGaps: false,
          value: deltaValue,
          points: { show: false, size: HOVER_POINT_SIZE, stroke: POSITIVE, fill: POSITIVE },
        },
        {
          label: `${aLabel} < ${bLabel}`,
          stroke: NEGATIVE,
          fill: NEGATIVE_FILL,
          fillTo: () => 0,
          width: 2,
          spanGaps: false,
          value: deltaValue,
          points: { show: false, size: HOVER_POINT_SIZE, stroke: NEGATIVE, fill: NEGATIVE },
        },
      ],
      legend: { show: true },
      cursor: themedCursor({ x: true, y: true, points: { stroke: CURSOR_STROKE } }),
    };

    const data: uPlot.AlignedData = [xs, pos, neg] as uPlot.AlignedData;
    plotRef.current = new uPlot(opts, data, containerRef.current);
    const detach = attachChartResize(containerRef.current, plotRef.current, height);
    return () => {
      detach();
      plotRef.current?.destroy();
      plotRef.current = null;
    };
  }, [delta, metric, unit, height, labelA, labelB]);

  if (delta.length === 0) {
    return (
      <p className="text-zinc-500 text-sm text-center py-8">
        No overlapping RPM range to compare.
      </p>
    );
  }
  return <div ref={containerRef} />;
}
