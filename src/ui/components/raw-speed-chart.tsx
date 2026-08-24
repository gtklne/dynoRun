import { useEffect, useMemo, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import type { RawTrace } from '@/analysis/raw-trace';
import { mpsToKmh } from '@/shared/units';
import {
  attachChartResize,
  CURSOR_STROKE,
  HOVER_POINT_SIZE,
  legendValue,
  responsiveChartHeight,
  themedAxis,
  themedCursor,
} from '@/ui/components/uplot-theme';

const RAW_STROKE = '#f59e0b';
const PIPELINE_STROKE = '#e4e4e7';
const ACCEL_STROKE = '#22d3ee';
const SUSPECT_STROKE = '#f87171';

interface Props {
  trace: RawTrace;
  /** Ceiling drawn as a dashed reference line. Only rendered when a fix has
   *  actually crossed it, otherwise it would stretch the axis on a clean run
   *  and squash the trace nobody needed to worry about. */
  accelCeilingMs2: number;
  height?: number;
}

export function RawSpeedChart({ trace, accelCeilingMs2, height = 260 }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const plotRef = useRef<uPlot | null>(null);

  // One shared x axis across two different time grids: the raw fixes sit ~1 s
  // apart, the pipeline grid at 100 ms. uPlot wants aligned data, so take the
  // union and let each series carry nulls where it has nothing to say.
  const data = useMemo<uPlot.AlignedData | null>(() => {
    if (trace.points.length < 2) return null;

    const rawByT = new Map(trace.points.map((p) => [p.t_ms, p]));
    const smoothByT = new Map(trace.smoothed.map((s) => [s.t_ms, s.speed_mps]));
    const xsMs = [...new Set([...rawByT.keys(), ...smoothByT.keys()])].sort((a, b) => a - b);

    const xs: number[] = [];
    const rawSpeed: (number | null)[] = [];
    const pipelineSpeed: (number | null)[] = [];
    const accel: (number | null)[] = [];
    const suspect: (number | null)[] = [];

    const t0 = xsMs[0];
    for (const tMs of xsMs) {
      xs.push((tMs - t0) / 1000);
      const raw = rawByT.get(tMs);
      const smooth = smoothByT.get(tMs);
      rawSpeed.push(raw ? mpsToKmh(raw.speed_mps) : null);
      pipelineSpeed.push(smooth != null ? mpsToKmh(smooth) : null);
      accel.push(raw?.accel_ms2 ?? null);
      suspect.push(raw && raw.flags.length > 0 ? (raw.accel_ms2 ?? 0) : null);
    }

    const out: (number | null)[][] = [rawSpeed, pipelineSpeed, accel, suspect];
    if (trace.spike_count > 0) out.push(xs.map(() => accelCeilingMs2));
    return [xs, ...out] as uPlot.AlignedData;
  }, [trace, accelCeilingMs2]);

  useEffect(() => {
    if (!containerRef.current || !data) return;

    const pointsFor = (color: string): uPlot.Series.Points => ({
      show: true,
      size: HOVER_POINT_SIZE,
      stroke: color,
      fill: color,
    });

    const series: uPlot.Series[] = [
      { label: 'Time', value: legendValue('s', 2) },
      {
        label: 'GPS speed',
        scale: 'kmh',
        stroke: RAW_STROKE,
        width: 2,
        spanGaps: true,
        value: legendValue('km/h', 1),
        points: pointsFor(RAW_STROKE),
      },
      {
        // Drawn after the raw series so it rides on top. At a low fix rate it
        // lands exactly on the raw trace, and that coincidence is the point:
        // the Savitzky-Golay window spans about one real fix, so it smooths
        // interpolation rather than data. It has to be light enough to read
        // against the amber, or the finding looks like a missing series.
        label: 'Used by pipeline',
        scale: 'kmh',
        stroke: PIPELINE_STROKE,
        width: 1.5,
        dash: [5, 5],
        spanGaps: true,
        value: legendValue('km/h', 1),
        points: { show: false },
      },
      {
        label: 'Fix-to-fix accel',
        scale: 'accel',
        stroke: ACCEL_STROKE,
        width: 2,
        spanGaps: true,
        value: legendValue('m/s²', 2),
        points: pointsFor(ACCEL_STROKE),
      },
      {
        label: 'Suspect fix',
        scale: 'accel',
        stroke: SUSPECT_STROKE,
        // Markers only. A connecting line here would imply the flagged fixes
        // are a trend rather than isolated artifacts.
        paths: () => null,
        value: legendValue('m/s²', 2),
        points: { show: true, size: HOVER_POINT_SIZE + 4, stroke: SUSPECT_STROKE, fill: SUSPECT_STROKE },
      },
    ];
    if (trace.spike_count > 0) {
      series.push({
        label: 'Grip limit',
        scale: 'accel',
        stroke: SUSPECT_STROKE,
        width: 1,
        dash: [2, 5],
        value: legendValue('m/s²', 0),
        points: { show: false },
      });
    }

    const opts: uPlot.Options = {
      width: containerRef.current.clientWidth,
      height: responsiveChartHeight(height),
      scales: { x: { time: false }, kmh: {}, accel: {} },
      axes: [
        themedAxis({ label: 'Time (s)' }),
        themedAxis({ label: 'Speed (km/h)', scale: 'kmh', decimals: 0 }),
        themedAxis({ label: 'Accel (m/s²)', scale: 'accel', side: 1, showGrid: false, decimals: 1 }),
      ],
      series,
      legend: { show: true },
      cursor: themedCursor({ x: true, y: true, points: { stroke: CURSOR_STROKE } }),
    };

    plotRef.current = new uPlot(opts, data, containerRef.current);
    const detach = attachChartResize(containerRef.current, plotRef.current, height);
    return () => {
      detach();
      plotRef.current?.destroy();
      plotRef.current = null;
    };
  }, [data, trace.spike_count, height]);

  if (!data) return <p className="text-zinc-500 text-sm p-3">Not enough fixes to plot.</p>;
  return <div ref={containerRef} />;
}
