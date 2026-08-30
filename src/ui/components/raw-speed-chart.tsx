import { useEffect, useMemo, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import type { RawTrace } from '@/analysis/raw-trace';
import { mpsToKmh } from '@/shared/units';
import { usePlateInk } from '@/ui/plate';
import {
  attachChartResize,
  HOVER_POINT_SIZE,
  legendValue,
  responsiveChartHeight,
  themedAxis,
  themedCursor,
} from '@/ui/components/uplot-theme';

interface Props {
  trace: RawTrace;
  /** Ceiling drawn as a dashed reference line. Only rendered when a fix has
   *  actually crossed it, otherwise it would stretch the axis on a clean run
   *  and squash the trace nobody needed to worry about. */
  accelCeilingMs2: number;
  height?: number;
  /**
   * Seconds from the start of the trace to mark, published by another view of
   * the same procedure (the power curve's RPM cursor). This is the profile
   * half of the plate's cross-reference: null draws nothing.
   */
  cursorTimeS?: number | null;
}

export function RawSpeedChart({ trace, accelCeilingMs2, height = 260, cursorTimeS = null }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const plotRef = useRef<uPlot | null>(null);
  const ink = usePlateInk();
  // Read inside the draw hook so moving the cross-reference repaints without
  // rebuilding the plot.
  const cursorRef = useRef<number | null>(cursorTimeS);
  cursorRef.current = cursorTimeS;

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
        stroke: ink.ink,
        width: 2,
        spanGaps: true,
        value: legendValue('km/h', 1),
        points: pointsFor(ink.ink),
      },
      {
        // Drawn after the raw series so it rides on top. At a low fix rate it
        // lands exactly on the raw trace, and that coincidence is the point:
        // the Savitzky-Golay window spans about one real fix, so it smooths
        // interpolation rather than data. It has to be legible against the raw
        // ink, or the finding looks like a missing series.
        label: 'Used by pipeline',
        scale: 'kmh',
        stroke: ink.ink3,
        width: 1.5,
        dash: [5, 5],
        spanGaps: true,
        value: legendValue('km/h', 1),
        points: { show: false },
      },
      {
        label: 'Fix-to-fix accel',
        scale: 'accel',
        stroke: ink.gain,
        width: 2,
        dash: [2, 3],
        spanGaps: true,
        value: legendValue('m/s²', 2),
        points: pointsFor(ink.gain),
      },
      {
        label: 'Suspect fix',
        scale: 'accel',
        stroke: ink.caution,
        // Markers only. A connecting line here would imply the flagged fixes
        // are a trend rather than isolated artifacts.
        paths: () => null,
        value: legendValue('m/s²', 2),
        points: { show: true, size: HOVER_POINT_SIZE + 4, stroke: ink.caution, fill: ink.caution },
      },
    ];
    if (trace.spike_count > 0) {
      series.push({
        label: 'Grip limit',
        scale: 'accel',
        stroke: ink.caution,
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
        themedAxis({ label: 'Time (s)', ink }),
        themedAxis({ label: 'Speed (km/h)', scale: 'kmh', decimals: 0, ink }),
        themedAxis({ label: 'Accel (m/s²)', scale: 'accel', side: 1, showGrid: false, decimals: 1, ink }),
      ],
      series,
      legend: { show: true },
      cursor: themedCursor({ x: true, y: true }, ink),
      hooks: {
        draw: [
          (u): void => {
            const at = cursorRef.current;
            if (at == null || !Number.isFinite(at)) return;
            const x = u.valToPos(at, 'x', true);
            if (!Number.isFinite(x)) return;
            const ctx = u.ctx;
            ctx.save();
            ctx.beginPath();
            ctx.rect(u.bbox.left, u.bbox.top, u.bbox.width, u.bbox.height);
            ctx.clip();
            ctx.strokeStyle = ink.ink;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(x, u.bbox.top);
            ctx.lineTo(x, u.bbox.top + u.bbox.height);
            ctx.stroke();
            ctx.restore();
          },
        ],
      },
    };

    plotRef.current = new uPlot(opts, data, containerRef.current);
    const detach = attachChartResize(containerRef.current, plotRef.current, height);
    return () => {
      detach();
      plotRef.current?.destroy();
      plotRef.current = null;
    };
  }, [data, trace.spike_count, height, ink]);

  // Repaint the cross-reference marker without rebuilding the plot.
  useEffect(() => {
    plotRef.current?.redraw(false, false);
  }, [cursorTimeS]);

  if (!data) return <p className="t-annotation px-3 py-6">Not enough fixes to plot.</p>;
  return <div ref={containerRef} data-plate-figures />;
}
