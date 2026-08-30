import { useEffect, useState } from 'react';
import { pulseTick, pulseStart } from '@/app/haptics';

interface CountdownOverlayProps {
  /** Called when the countdown finishes. */
  onComplete: () => void;
  /** Called if the user taps to cancel. */
  onCancel?: () => void;
  from?: number;
}

/**
 * The whole sheet is replaced by one number, because this is read from the
 * driver's seat at a glance and nothing else on screen can compete with it.
 * No blur, no scrim over a half-legible page: an opaque plate.
 */
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
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6"
      style={{ background: 'var(--color-sheet)' }}
      onClick={onCancel}
      role="dialog"
      aria-label="Run countdown"
    >
      <p className="t-label">Get ready</p>
      <p
        key={count}
        className="t-readout-xl"
        style={{ color: count > 0 ? 'var(--color-ink)' : 'var(--color-go)' }}
      >
        {count > 0 ? count : 'GO'}
      </p>
      {onCancel && (
        <button
          type="button"
          className="t-annotation underline underline-offset-4"
          onClick={(e) => {
            e.stopPropagation();
            onCancel();
          }}
        >
          Tap anywhere to cancel
        </button>
      )}
    </div>
  );
}
