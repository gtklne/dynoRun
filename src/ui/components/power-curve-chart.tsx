import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import type { RpmPoint } from '@/shared/types';

export interface CurveSeries {
  label: string;
  points: RpmPoint[];
  stroke?: string;
}

const DEFAULT_COLORS = ['#1f77b4', '#d62728', '#2ca02c', '#9467bd', '#ff7f0e', '#17becf', '#bcbd22'];

interface Props {
  series: CurveSeries[];
  yLabel?: string;
}

export function PowerCurveChart({ series, yLabel = 'Power (kW)' }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const plotRef = useRef<uPlot | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    if (series.length === 0) return;

    // Build a sorted union of all RPMs across all series.
    const rpmSet = new Set<number>();
    for (const s of series) for (const p of s.points) rpmSet.add(p.rpm);
    const xs = [...rpmSet].sort((a, b) => a - b);

    // For each series, build a y-array indexed against xs (missing points = null).
    const yArrays: (number | null)[][] = series.map((s) => {
      const map = new Map(s.points.map((p) => [p.rpm, p.wheel_power_kw]));
      return xs.map((x) => map.get(x) ?? null);
    });

    const data: uPlot.AlignedData = [xs, ...yArrays] as uPlot.AlignedData;

    const opts: uPlot.Options = {
      width: containerRef.current.clientWidth,
      height: 320,
      scales: { x: { time: false } },
      axes: [{ label: 'RPM' }, { label: yLabel }],
      series: [
        {},
        ...series.map((s, i) => ({
          label: s.label,
          stroke: s.stroke ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length],
          width: 2,
          spanGaps: true,
        })),
      ],
      legend: { show: true },
    };

    plotRef.current = new uPlot(opts, data, containerRef.current);
    return () => {
      plotRef.current?.destroy();
      plotRef.current = null;
    };
  }, [series, yLabel]);

  if (series.length === 0) return <p>No data.</p>;
  return <div ref={containerRef} />;
}
