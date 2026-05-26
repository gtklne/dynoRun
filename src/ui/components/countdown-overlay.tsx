import { useEffect, useState } from 'react';
import { pulseTick, pulseStart } from '@/app/haptics';

interface CountdownOverlayProps {
  /** Called when the countdown finishes. */
  onComplete: () => void;
  /** Called if the user taps to cancel. */
  onCancel?: () => void;
  from?: number;
}

export function CountdownOverlay({ onComplete, onCancel, from = 3 }: CountdownOverlayProps) {
  const [count, setCount] = useState(from);

  useEffect(() => {
    if (count <= 0) {
      pulseStart();
      onComplete();
      return;
    }
    pulseTick();
    const id = window.setTimeout(() => setCount((c) => c - 1), 1000);
    return () => window.clearTimeout(id);
  }, [count, onComplete]);

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-zinc-950/95 backdrop-blur-sm"
      onClick={onCancel}
      role="dialog"
      aria-label="Run countdown"
    >
      <p className="text-zinc-400 uppercase tracking-[0.3em] text-xs">Get ready</p>
      <div
        key={count}
        className="text-[10rem] font-bold text-amber-400 tabular-nums animate-pulse"
        style={{ lineHeight: 1 }}
      >
        {count > 0 ? count : 'GO'}
      </div>
      {onCancel && (
        <button
          className="text-zinc-500 text-xs underline underline-offset-4"
          onClick={(e) => { e.stopPropagation(); onCancel(); }}
        >
          Tap anywhere to cancel
        </button>
      )}
    </div>
  );
}
