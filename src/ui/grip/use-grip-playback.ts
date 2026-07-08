import { useCallback, useEffect, useRef, useState } from 'react';

const SAMPLE_HZ = 25;

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
}

/**
 * Lap playback at data rate × speed. Position accumulates as a float —
 * rounding into the cursor each frame would discard sub-sample progress and
 * freeze 1× playback on a 60 Hz display (0.42 samples/frame → round 0).
 */
export function useGripPlayback(lapLength: number, resetKey: unknown): GripPlayback {
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const playPos = useRef(0);
  const speedRef = useRef(speed);
  speedRef.current = speed;

  useEffect(() => {
    playPos.current = 0;
    setCursor(0);
    setPlaying(false);
  }, [resetKey]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let lastT = 0;
    const loop = (ts: number) => {
      if (!lastT) lastT = ts;
      const dt = (ts - lastT) / 1000;
      lastT = ts;
      playPos.current += dt * SAMPLE_HZ * speedRef.current;
      if (playPos.current >= lapLength - 1) {
        playPos.current = lapLength - 1;
        setCursor(lapLength - 1);
        setPlaying(false);
        return;
      }
      setCursor(Math.round(playPos.current));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, lapLength]);

  const seek = useCallback((i: number) => {
    const c = Math.max(0, Math.min(lapLength - 1, Math.round(i)));
    playPos.current = c;
    setCursor(c);
  }, [lapLength]);

  const stop = useCallback(() => setPlaying(false), []);

  const scrub = useCallback((i: number) => {
    setPlaying(false);
    seek(i);
  }, [seek]);

  const toggle = useCallback(() => {
    setPlaying((p) => {
      if (!p && playPos.current >= lapLength - 1) {
        playPos.current = 0;
        setCursor(0);
      }
      return !p;
    });
  }, [lapLength]);

  return { cursor, playing, speed, setSpeed, toggle, stop, seek, scrub };
}
