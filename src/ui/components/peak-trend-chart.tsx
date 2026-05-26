import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { convertPower } from '@/shared/format-power';
import { useUnits } from '@/app/units-context';
import {
  CURSOR_STROKE,
  HOVER_POINT_SIZE,
  responsiveChartHeight,
  themedAxis,
  themedCursor,
} from '@/ui/components/uplot-theme';

export interface PeakTrendRun {
  id: string;
  started_at: string;
  peak_power_kw: number | null;
  status: string;
  title?: string | null;
  gear_label?: string | null;
}

interface PeakTrendChartProps {
  runs: PeakTrendRun[];
  onSelectRun?: (id: string) => void;
  height?: number;
}

interface ValidRun {
  id: string;
  ts: number;
  peak_kw: number;
  label: string;
}

const SERIES_COLOR = '#fbbf24';
const BEST_COLOR = '#a16207';

function prepareRuns(runs: PeakTrendRun[]): ValidRun[] {
  const valid: ValidRun[] = [];
  for (const r of runs) {
    if (r.status !== 'complete') continue;
    if (r.peak_power_kw == null) continue;
    const ts = Date.parse(r.started_at);
    if (!isFinite(ts)) continue;
    valid.push({
      id: r.id,
      ts: ts / 1000,
      peak_kw: r.peak_power_kw,
      label: r.title ?? r.gear_label ?? '',
    });
  }
  valid.sort((a, b) => a.ts - b.ts);
  return valid;
}

export function PeakTrendChart({ runs, onSelectRun, height = 200 }: PeakTrendChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const plotRef = useRef<uPlot | null>(null);
  const validRef = useRef<ValidRun[]>([]);
  const onSelectRef = useRef<typeof onSelectRun>(onSelectRun);
  const { unit } = useUnits();

  useEffect(() => {
    onSelectRef.current = onSelectRun;
  }, [onSelectRun]);

  const valid = prepareRuns(runs);

  useEffect(() => {
    if (!containerRef.current) return;
    if (valid.length < 2) return;

    validRef.current = valid;

    const xs = valid.map((v) => v.ts);
    const ys = valid.map((v) => convertPower(v.peak_kw, unit));
    const bestKw = valid.reduce((m, v) => (v.peak_kw > m ? v.peak_kw : m), valid[0].peak_kw);
    const bestVal = convertPower(bestKw, unit);
    const bestLine = xs.map(() => bestVal);

    const handleClick = (): void => {
      const cb = onSelectRef.current;
      if (!cb) return;
      const idx = plotRef.current?.cursor.idx;
      if (idx == null) return;
      const run = validRef.current[idx];
      if (run) cb(run.id);
    };

    const opts: uPlot.Options = {
      width: containerRef.current.clientWidth,
      height: responsiveChartHeight(height),
      scales: {
        x: { time: true },
        y: { auto: true },
      },
      axes: [
        themedAxis({}),
        themedAxis({ label: `Peak (${unit})`, labelSize: 30 }),
      ],
      series: [
        {},
        {
          label: `Peak power (${unit})`,
          stroke: SERIES_COLOR,
          width: 2,
          points: { show: true, size: HOVER_POINT_SIZE, stroke: SERIES_COLOR, fill: SERIES_COLOR },
        },
        {
          label: 'Personal best',
          stroke: BEST_COLOR,
          width: 1,
          dash: [4, 4],
          points: { show: false },
        },
      ],
      cursor: themedCursor({
        x: true,
        y: false,
        points: { show: true, stroke: CURSOR_STROKE },
        drag: { x: false, y: false, setScale: false },
      }),
      legend: { show: true },
      hooks: {
        ready: [
          (u): void => {
            u.over.style.cursor = onSelectRef.current ? 'pointer' : 'default';
            u.over.addEventListener('click', handleClick);
          },
        ],
        destroy: [
          (u): void => {
            u.over.removeEventListener('click', handleClick);
          },
        ],
      },
    };

    const data: uPlot.AlignedData = [xs, ys, bestLine];

    plotRef.current = new uPlot(opts, data, containerRef.current);
    return () => {
      plotRef.current?.destroy();
      plotRef.current = null;
    };
    // valid is derived from runs; recomputing on every prop change is intentional
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runs, unit, height]);

  if (valid.length < 2) {
    return (
      <p className="text-zinc-600 text-sm text-center py-2">
        Not enough complete runs yet to show a trend.
      </p>
    );
  }

  return <div ref={containerRef} data-testid="peak-trend-chart" />;
}
