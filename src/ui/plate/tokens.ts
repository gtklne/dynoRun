import { useEffect, useState } from 'react';

/**
 * Canvas cannot read Tailwind utilities, and every grip/dyno chart in this app
 * draws to canvas. So the plate's inks are resolved once from the same custom
 * properties the CSS uses: one source of truth, and the night plate switches
 * both halves together instead of only the DOM half.
 */
export interface PlateInk {
  sheet: string;
  sunk: string;
  ink: string;
  ink2: string;
  ink3: string;
  rule: string;
  ruleFaint: string;
  terrain: string;
  terrainTint: string;
  procedure: string;
  procedureTint: string;
  caution: string;
  cautionTint: string;
  gain: string;
  gainTint: string;
}

const VARS: Record<keyof PlateInk, string> = {
  sheet: '--color-sheet',
  sunk: '--color-sunk',
  ink: '--color-ink',
  ink2: '--color-ink-2',
  ink3: '--color-ink-3',
  rule: '--color-rule',
  ruleFaint: '--color-rule-faint',
  terrain: '--color-terrain',
  terrainTint: '--color-terrain-tint',
  procedure: '--color-procedure',
  procedureTint: '--color-procedure-tint',
  caution: '--color-caution',
  cautionTint: '--color-caution-tint',
  gain: '--color-gain',
  gainTint: '--color-gain-tint',
};

/** Day-plate values, used when there is no document (SSR prerender, tests). */
const FALLBACK: PlateInk = {
  sheet: '#ffffff',
  sunk: '#f1f3f5',
  ink: '#14161a',
  ink2: '#4c5560',
  ink3: '#66707b',
  rule: '#c3cbd2',
  ruleFaint: '#e3e8ec',
  terrain: '#92a4b0',
  terrainTint: '#dce3e8',
  procedure: '#c6188e',
  procedureTint: '#fbe7f4',
  caution: '#a85d00',
  cautionTint: '#fbf0dd',
  gain: '#007f86',
  gainTint: '#dff0f1',
};

export function readPlateInk(): PlateInk {
  if (typeof document === 'undefined' || !document.documentElement) return FALLBACK;
  const cs = getComputedStyle(document.documentElement);
  const out = {} as PlateInk;
  for (const key of Object.keys(VARS) as (keyof PlateInk)[]) {
    const value = cs.getPropertyValue(VARS[key]).trim();
    out[key] = value || FALLBACK[key];
  }
  return out;
}

/**
 * Re-reads when the plate flips. Watching `data-plate` covers the explicit
 * toggle and the media query covers the OS preference; a chart that only
 * watched one would keep drawing day ink on a night sheet.
 */
export function usePlateInk(): PlateInk {
  const [ink, setInk] = useState<PlateInk>(readPlateInk);

  useEffect(() => {
    const sync = () => setInk(readPlateInk());
    sync();

    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-plate'],
    });

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', sync);

    return () => {
      observer.disconnect();
      media.removeEventListener('change', sync);
    };
  }, []);

  return ink;
}

/**
 * Series distinction for overlaid runs and laps. Colour plus a dash pattern,
 * because a chart legend that relies on hue alone fails both a colour-blind
 * reader and a phone screen in direct sun. Six is the compare screen's cap.
 */
export function seriesInk(ink: PlateInk): string[] {
  // Series 0 is the subject: this run, this lap, the line you actually flew.
  // It takes procedure magenta, and everything it is measured against falls
  // back to ink. Ordering ink first inverted the world's one colour rule, so a
  // single-series run curve drew near-black while a marketing chart drew
  // magenta, and the only magenta left on a measurement screen was a button.
  return [ink.procedure, ink.ink, ink.gain, ink.caution, ink.terrain, ink.ink3];
}

export const SERIES_DASH: number[][] = [[], [7, 3], [2, 3], [10, 3, 2, 3], [1, 3], [14, 4]];

/**
 * Diagonal hatch for unmeasured, masked, or out-of-section regions. The DOM
 * half of this lives in `.hatch`; both must stay at 45 degrees and the same
 * pitch or a masked canvas region stops matching its own legend swatch.
 */
export function hatchPattern(
  ctx: CanvasRenderingContext2D,
  color: string,
  scale = 1,
): CanvasPattern | string {
  const size = Math.max(6, Math.round(8 * scale));
  const tile = document.createElement('canvas');
  tile.width = size;
  tile.height = size;
  const tctx = tile.getContext('2d');
  if (!tctx) return color;
  tctx.strokeStyle = color;
  tctx.lineWidth = Math.max(1, scale);
  tctx.beginPath();
  tctx.moveTo(-size, size);
  tctx.lineTo(size, -size);
  tctx.moveTo(0, size * 2);
  tctx.lineTo(size * 2, 0);
  tctx.stroke();
  return ctx.createPattern(tile, 'repeat') ?? color;
}
