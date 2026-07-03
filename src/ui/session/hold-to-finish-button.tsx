import { useEffect, useRef, useState } from 'react';

const HOLD_MS = 1500;

/**
 * Press-and-hold trigger for ending a hands-free session. A plain tap must
 * NOT finish it — with the phone in a pocket or tank bag, stray touches are
 * expected; only a deliberate sustained press counts.
 */
export function HoldToFinishButton({ onFinish, label = 'Hold to finish' }: { onFinish: () => void; label?: string }) {
  const [progress, setProgress] = useState(0);
  const holdStartRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const firedRef = useRef(false);

  useEffect(() => () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
  }, []);

  function tick() {
    if (holdStartRef.current == null) return;
    const elapsed = performance.now() - holdStartRef.current;
    const p = Math.min(1, elapsed / HOLD_MS);
    setProgress(p);
    if (p >= 1) {
      if (!firedRef.current) {
        firedRef.current = true;
        holdStartRef.current = null;
        onFinish();
      }
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  }

  function begin() {
    if (firedRef.current) return;
    holdStartRef.current = performance.now();
    rafRef.current = requestAnimationFrame(tick);
  }

  function cancel() {
    holdStartRef.current = null;
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    setProgress(0);
  }

  return (
    <button
      onPointerDown={begin}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
      className="relative w-full overflow-hidden bg-red-600 active:bg-red-700 text-white font-bold py-6 rounded-xl text-lg select-none touch-none"
    >
      <span
        className="absolute inset-y-0 left-0 bg-red-900/70 transition-none"
        style={{ width: `${progress * 100}%` }}
      />
      <span className="relative">
        {progress > 0 ? 'Keep holding…' : label}
      </span>
    </button>
  );
}
