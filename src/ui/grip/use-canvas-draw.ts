import { useCallback, useEffect, useRef } from 'react';

export interface CanvasSize {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
}

/** Match the canvas bitmap to its CSS size × devicePixelRatio. */
function fitCanvas(cv: HTMLCanvasElement): CanvasSize | null {
  const r = cv.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return null;
  const dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(r.width * dpr);
  cv.height = Math.round(r.height * dpr);
  const ctx = cv.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: r.width, h: r.height };
}

export const CANVAS_FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/**
 * Redraw a canvas whenever `deps` change or the element resizes. The draw
 * callback always sees CSS-pixel coordinates.
 */
export function useCanvasDraw(
  draw: (c: CanvasSize) => void,
  deps: unknown[],
): React.RefObject<HTMLCanvasElement> {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;

  const render = useCallback(() => {
    const cv = ref.current;
    if (!cv) return;
    const size = fitCanvas(cv);
    if (size) drawRef.current(size);
  }, []);

  useEffect(() => {
    const cv = ref.current;
    if (!cv || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(render);
    ro.observe(cv);
    return () => ro.disconnect();
  }, [render]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(render, deps);

  return ref;
}
