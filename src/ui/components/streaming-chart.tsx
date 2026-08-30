import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { usePlateInk } from '@/ui/plate';
import {
  attachChartResize,
  HOVER_POINT_SIZE,
  legendValue,
  responsiveChartHeight,
  seriesStyle,
  themedAxis,
  themedCursor,
} from '@/ui/components/uplot-theme';

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
    const ink = usePlateInk();
    const tsRef = useRef<number[]>([]);
    const speedsRef = useRef<number[]>([]);
    const rpmsRef = useRef<number[]>([]);

    useEffect(() => {
      if (!containerRef.current) return;
      // Two channels on one strip: speed is the measurement, RPM is derived
      // from it, so RPM steps back to the second ink weight and takes the dash
      // rather than a second full-weight stroke competing for the same glance.
      // Both come from the shared series order, which is what stopped them
      // resolving to the identical ink once identity became ink-only.
      const speed = seriesStyle(0, ink);
      const rpm = seriesStyle(1, ink);
      const SPEED_STROKE = speed.stroke;
      const RPM_STROKE = rpm.stroke;
      const opts: uPlot.Options = {
        width: containerRef.current.clientWidth,
        height: responsiveChartHeight(BASE_HEIGHT),
        scales: {
          x: { time: false },
          speed: {},
          rpm: {},
        },
        axes: [
          themedAxis({ label: 'Time (s)', ink }),
          themedAxis({ label: 'Speed (km/h)', scale: 'speed', decimals: 0, ink }),
          themedAxis({ label: 'RPM', scale: 'rpm', side: 1, showGrid: false, ink }),
        ],
        series: [
          { value: legendValue('s', 1) },
          {
            label: 'Speed (km/h)',
            stroke: SPEED_STROKE,
            width: 2,
            scale: 'speed',
            value: legendValue('km/h', 1),
            points: { size: HOVER_POINT_SIZE, stroke: SPEED_STROKE, fill: SPEED_STROKE },
          },
          {
            label: 'RPM',
            stroke: RPM_STROKE,
            width: 2,
            dash: rpm.dash,
            scale: 'rpm',
            value: legendValue('RPM', 0),
            points: { size: HOVER_POINT_SIZE, stroke: RPM_STROKE, fill: RPM_STROKE },
          },
        ],
        cursor: themedCursor({ x: true, y: true }, ink),
      };
      const data: uPlot.AlignedData = [[], [], []];
      plotRef.current = new uPlot(opts, data, containerRef.current);
      const detach = attachChartResize(containerRef.current, plotRef.current, BASE_HEIGHT);
      return () => { detach(); plotRef.current?.destroy(); plotRef.current = null; };
    }, [ink]);

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

    return <div ref={containerRef} data-plate-figures />;
  },
);
