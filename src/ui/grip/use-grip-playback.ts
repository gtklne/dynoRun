import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { floorIndex } from '@/analysis/grip/align';

export interface GripPlayback {
  /** local sample index within the active lap */
  cursor: number;
  playing: boolean;
  speed: number;
  setSpeed: (s: number) => void;
  toggle: () => void;
  stop: () => void;
  /** jump to a local index; does not change play state */
  seek: (i: number) => void;
  /** stop playback, then jump */
  scrub: (i: number) => void;
  /** Seconds from the first recorded sample. */
  scrubSeconds: (seconds: number) => void;
}

/**
 * Lap playback at data rate × speed. Position accumulates as a float:
 * rounding into the cursor each frame would discard sub-sample progress and
 * freeze 1× playback on a 60 Hz display (0.42 samples/frame → round 0).
 */
export function useGripPlayback(lapLength: number, resetKey: unknown, timestamps?: number[]): GripPlayback {
  const times = useMemo(() => timestamps ?? Array.from({ length: lapLength }, (_, i) => i / 25), [timestamps, lapLength]);
  const endTime = times[times.length - 1] ?? 0;
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const playPos = useRef(0);
  const speedRef = useRef(speed);
  speedRef.current = speed;

  useEffect(() => {
    playPos.current = times[0] ?? 0;
    setCursor(0);
    setPlaying(false);
  }, [resetKey]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let lastT: number | undefined;
    const loop = (ts: number) => {
      if (lastT === undefined) lastT = ts;
      const dt = (ts - lastT) / 1000;
      lastT = ts;
      playPos.current += dt * speedRef.current;
      if (playPos.current >= endTime) {
        playPos.current = endTime;
        setCursor(lapLength - 1);
        setPlaying(false);
        return;
      }
      setCursor(floorIndex(times, playPos.current));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, lapLength, times, endTime]);

  const seek = useCallback((i: number) => {
    const c = Math.max(0, Math.min(lapLength - 1, Math.round(i)));
    playPos.current = times[c];
    setCursor(c);
  }, [lapLength, times, endTime]);

  const stop = useCallback(() => setPlaying(false), []);

  const scrub = useCallback((i: number) => {
    setPlaying(false);
    seek(i);
  }, [seek]);

  const scrubSeconds = useCallback((seconds: number) => scrub(floorIndex(times, times[0] + seconds)), [scrub, times]);

  const toggle = useCallback(() => {
    setPlaying((p) => {
      if (!p && playPos.current >= endTime) {
        playPos.current = times[0] ?? 0;
        setCursor(0);
      }
      return !p;
    });
  }, [lapLength, times, endTime]);

  return { cursor, playing, speed, setSpeed, toggle, stop, seek, scrub, scrubSeconds };
}
