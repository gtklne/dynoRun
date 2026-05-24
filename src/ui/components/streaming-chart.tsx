import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';

export interface StreamingChartHandle {
  pushSample(t_ms: number, speed_kmh: number, rpm: number): void;
  reset(): void;
}

interface StreamingChartProps {
  windowSeconds?: number;
}

export const StreamingChart = forwardRef<StreamingChartHandle, StreamingChartProps>(
  function StreamingChart({ windowSeconds = 30 }, ref) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const plotRef = useRef<uPlot | null>(null);
    const tsRef = useRef<number[]>([]);
    const speedsRef = useRef<number[]>([]);
    const rpmsRef = useRef<number[]>([]);

    useEffect(() => {
      if (!containerRef.current) return;
      const opts: uPlot.Options = {
        width: containerRef.current.clientWidth,
        height: 280,
        scales: {
          x: { time: false },
          speed: {},
          rpm: {},
        },
        axes: [
          { label: 'Time (s)' },
          { label: 'Speed (km/h)', scale: 'speed' },
          { label: 'RPM', side: 1, scale: 'rpm', grid: { show: false } },
        ],
        series: [
          {},
          { label: 'Speed (km/h)', stroke: '#1f77b4', width: 2, scale: 'speed' },
          { label: 'RPM', stroke: '#d62728', width: 2, scale: 'rpm' },
        ],
      };
      const data: uPlot.AlignedData = [[], [], []];
      plotRef.current = new uPlot(opts, data, containerRef.current);
      return () => { plotRef.current?.destroy(); plotRef.current = null; };
    }, []);

    useImperativeHandle(ref, () => ({
      pushSample(t_ms, speed_kmh, rpm) {
        const t = t_ms / 1000;
        tsRef.current.push(t);
        speedsRef.current.push(speed_kmh);
        rpmsRef.current.push(rpm);
        const cutoff = t - windowSeconds;
        while (tsRef.current.length > 0 && tsRef.current[0] < cutoff) {
          tsRef.current.shift();
          speedsRef.current.shift();
          rpmsRef.current.shift();
        }
        plotRef.current?.setData([tsRef.current, speedsRef.current, rpmsRef.current]);
      },
      reset() {
        tsRef.current = [];
        speedsRef.current = [];
        rpmsRef.current = [];
        plotRef.current?.setData([[], [], []]);
      },
    }), [windowSeconds]);

    return <div ref={containerRef} />;
  },
);
