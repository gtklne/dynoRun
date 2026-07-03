import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import type { DayCount } from '@/shared/daily-series';
import {
  attachChartResize,
  legendValue,
  responsiveChartHeight,
  themedAxis,
  themedCursor,
} from '@/ui/components/uplot-theme';

export interface DailySeries {
  label: string;
  color: string;
  data: DayCount[];
}

interface DailySeriesChartProps {
  /** All series must share the same dense day grid (see fillDailySeries). */
  series: DailySeries[];
  height?: number;
  testId?: string;
}

export function DailySeriesChart({ series, height = 180, testId }: DailySeriesChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const plotRef = useRef<uPlot | null>(null);

  const hasData = series.length > 0 && series[0].data.length > 0;

  useEffect(() => {
    if (!containerRef.current || !hasData) return;

    const xs = series[0].data.map((d) => Date.parse(`${d.day}T00:00:00Z`) / 1000);
    const bars = uPlot.paths.bars!({ size: [0.6, 100], align: 0 });
    const countValue = legendValue('', 0);

    const opts: uPlot.Options = {
      width: containerRef.current.clientWidth,
      height: responsiveChartHeight(height),
      scales: {
        x: { time: true },
        y: { auto: true, range: (_u, _min, max) => [0, Math.max(max, 1)] },
      },
      axes: [
        themedAxis({}),
        themedAxis({ decimals: 0 }),
      ],
      series: [
        {},
        ...series.map((s) => ({
          label: s.label,
          stroke: s.color,
          fill: `${s.color}66`,
          width: 1,
          paths: bars,
          value: countValue,
          points: { show: false },
        })),
      ],
      cursor: themedCursor({
        x: true,
        y: false,
        drag: { x: false, y: false, setScale: false },
      }),
      legend: { show: true },
    };

    const data: uPlot.AlignedData = [xs, ...series.map((s) => s.data.map((d) => d.count))];
    plotRef.current = new uPlot(opts, data, containerRef.current);
    const detach = attachChartResize(containerRef.current, plotRef.current, height);
    return () => {
      detach();
      plotRef.current?.destroy();
      plotRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, height, hasData]);

  if (!hasData) {
    return <p className="text-zinc-600 text-sm text-center py-2">No data yet.</p>;
  }

  return <div ref={containerRef} data-testid={testId} />;
}
