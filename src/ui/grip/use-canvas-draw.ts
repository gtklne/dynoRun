import { useCallback, useEffect, useRef } from 'react';

export interface CanvasSize {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  /** device pixel ratio the bitmap was sized at, needed for offscreen layers */
  dpr: number;
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
  return { ctx, w: r.width, h: r.height, dpr };
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

/**
 * An offscreen canvas holding the parts of a chart that do not move.
 *
 * The playback cursor changes 25-60 times a second, and both the track map and
 * the traction circle used to repaint everything for it: one stroked path per
 * lap sample and one filled arc per lap sample, measured at ~3,900 path
 * submissions per frame (~234k/s at 4×) for roughly fifty changed pixels. The
 * static content is redrawn only when `key` changes, then blitted.
 *
 * Returns the layer, or null if it could not be created (draw inline then).
 */
export function useStaticLayer(): (
  deps: unknown[],
  size: CanvasSize,
  paint: (ctx: CanvasRenderingContext2D) => void,
) => HTMLCanvasElement | null {
  const held = useRef<{ cv: HTMLCanvasElement; deps: unknown[] } | null>(null);

  return useCallback((deps, { w, h, dpr }, paint) => {
    const key = [...deps, Math.round(w), Math.round(h), dpr];
    const cur = held.current;
    if (cur && cur.deps.length === key.length && cur.deps.every((d, i) => Object.is(d, key[i]))) {
      return cur.cv;
    }
    const cv = cur?.cv ?? document.createElement('canvas');
    cv.width = Math.max(1, Math.round(w * dpr));
    cv.height = Math.max(1, Math.round(h * dpr));
    const ctx = cv.getContext('2d');
    if (!ctx) return null;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    paint(ctx);
    held.current = { cv, deps: key };
    return cv;
  }, []);
}
