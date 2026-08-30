import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import type { DayCount } from '@/shared/daily-series';
import { usePlateInk } from '@/ui/plate';
import {
  attachChartResize,
  legendValue,
  responsiveChartHeight,
  seriesStyle,
  themedAxis,
  themedCursor,
} from '@/ui/components/uplot-theme';

export interface DailySeries {
  label: string;
  data: DayCount[];
}

interface DailySeriesChartProps {
  /** All series must share the same dense day grid (see fillDailySeries). */
  series: DailySeries[];
  height?: number;
  testId?: string;
}

/**
 * Bars overlay each other, so the fill has to be transparent enough to read a
 * second series through. The plate's inks are hex, and appending an alpha pair
 * is the only way to get a translucent version onto a canvas; anything that is
 * not a plain hex is left opaque rather than silently producing an invalid
 * colour that the canvas would drop to black.
 */
function translucent(color: string): string {
  return /^#[0-9a-f]{6}$/i.test(color) ? `${color}59` : color;
}

export function DailySeriesChart({ series, height = 180, testId }: DailySeriesChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const plotRef = useRef<uPlot | null>(null);
  const ink = usePlateInk();

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
      axes: [themedAxis({ ink }), themedAxis({ decimals: 0, ink })],
      series: [
        {},
        ...series.map((s, i) => {
          // Ink and dash together: two overlaid bar series stay separable for a
          // colour-blind reader and on a washed-out screen.
          const style = seriesStyle(i, ink);
          return {
            label: s.label,
            stroke: style.stroke,
            fill: translucent(style.stroke),
            dash: style.dash.length ? style.dash : undefined,
            width: 1,
            paths: bars,
            value: countValue,
            points: { show: false },
          };
        }),
      ],
      cursor: themedCursor(
        {
          x: true,
          y: false,
          drag: { x: false, y: false, setScale: false },
        },
        ink,
      ),
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
  }, [series, height, hasData, ink]);

  if (!hasData) {
    return <p className="t-annotation px-3 py-4 text-center">No data yet.</p>;
  }

  return <div ref={containerRef} data-testid={testId} data-plate-figures />;
}
