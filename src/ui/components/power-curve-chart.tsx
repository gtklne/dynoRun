import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import type { RpmPoint } from '@/shared/types';

export function PowerCurveChart({ points, label = 'Power (kW)' }: { points: RpmPoint[]; label?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const plotRef = useRef<uPlot | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const xs = points.map((p) => p.rpm);
    const ys = points.map((p) => p.wheel_power_kw);
    const data: uPlot.AlignedData = [xs, ys];
    const opts: uPlot.Options = {
      width: ref.current.clientWidth,
      height: 320,
      scales: { x: { time: false } },
      axes: [{ label: 'RPM' }, { label }],
      series: [
        {},
        { label, stroke: '#1f77b4', width: 2 },
      ],
    };
    plotRef.current = new uPlot(opts, data, ref.current);
    return () => { plotRef.current?.destroy(); plotRef.current = null; };
  }, [points, label]);

  return <div ref={ref} />;
}
