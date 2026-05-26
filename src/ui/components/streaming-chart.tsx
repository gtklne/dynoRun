import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import {
  CURSOR_STROKE,
  HOVER_POINT_SIZE,
  responsiveChartHeight,
  themedAxis,
  themedCursor,
} from '@/ui/components/uplot-theme';

const SPEED_STROKE = '#22d3ee';
const RPM_STROKE = '#f59e0b';
const BASE_HEIGHT = 280;

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
        height: responsiveChartHeight(BASE_HEIGHT),
        scales: {
          x: { time: false },
          speed: {},
          rpm: {},
        },
        axes: [
          themedAxis({ label: 'Time (s)' }),
          themedAxis({ label: 'Speed (km/h)', scale: 'speed' }),
          themedAxis({ label: 'RPM', scale: 'rpm', side: 1, showGrid: false }),
        ],
        series: [
          {},
          {
            label: 'Speed (km/h)',
            stroke: SPEED_STROKE,
            width: 2,
            scale: 'speed',
            points: { size: HOVER_POINT_SIZE, stroke: SPEED_STROKE, fill: SPEED_STROKE },
          },
          {
            label: 'RPM',
            stroke: RPM_STROKE,
            width: 2,
            scale: 'rpm',
            points: { size: HOVER_POINT_SIZE, stroke: RPM_STROKE, fill: RPM_STROKE },
          },
        ],
        cursor: themedCursor({ x: true, y: true, points: { stroke: CURSOR_STROKE } }),
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
