import { useEffect, useState } from 'react';

/**
 * Canvas cannot read Tailwind utilities, and every grip/dyno chart in this app
 * draws to canvas. So the plate's inks are resolved once from the same custom
 * properties the CSS uses: one source of truth, and the night plate switches
 * both halves together instead of only the DOM half.
 */
export interface PlateInk {
  sheet: string;
  plane: string;
  plane2: string;
  ink: string;
  ink2: string;
  ink3: string;
  grid: string;
  gridStrong: string;
  /** Traffic light. Judgement only: gained, read this, lost. Never identity. */
  go: string;
  goPlane: string;
  caution: string;
  cautionPlane: string;
  /** Alias for cautionPlane. */
  cautionTint: string;
  stop: string;
  stopPlane: string;

  /* Aliases kept so the three domains re-skin without being rewritten. Each
     points at whatever now carries that job. */
  sunk: string;
  rule: string;
  ruleFaint: string;
  terrain: string;
  terrainTint: string;
  /** The subject series. Identity is ink now, so judgement keeps the colour. */
  procedure: string;
  procedureTint: string;
  gain: string;
  gainTint: string;
}

const VARS: Record<keyof PlateInk, string> = {
  sheet: '--color-sheet',
  plane: '--color-plane',
  plane2: '--color-plane-2',
  ink: '--color-ink',
  ink2: '--color-ink-2',
  ink3: '--color-ink-3',
  grid: '--color-grid',
  gridStrong: '--color-grid-strong',
  go: '--color-go',
  goPlane: '--color-go-plane',
  caution: '--color-caution',
  cautionPlane: '--color-caution-plane',
  cautionTint: '--color-caution-plane',
  stop: '--color-stop',
  stopPlane: '--color-stop-plane',

  sunk: '--color-plane-2',
  rule: '--color-grid-strong',
  ruleFaint: '--color-grid',
  terrain: '--color-ink-3',
  terrainTint: '--color-plane-2',
  procedure: '--color-ink',
  procedureTint: '--color-plane-2',
  gain: '--color-go',
  gainTint: '--color-go-plane',
};

/** Day-plate values, used when there is no document (SSR prerender, tests). */
const FALLBACK: PlateInk = {
  sheet: '#f1f2f0',
  plane: '#e7e9e5',
  plane2: '#dcdfd9',
  ink: '#22252a',
  ink2: '#5a6068',
  ink3: '#656b72',
  grid: '#dee1db',
  gridStrong: '#c7cbc3',
  go: '#1f6b33',
  goPlane: '#dbe8dc',
  caution: '#8f5c0c',
  cautionPlane: '#f3e8d4',
  cautionTint: '#f3e8d4',
  stop: '#b3261e',
  stopPlane: '#f7e0dd',

  sunk: '#dcdfd9',
  rule: '#c7cbc3',
  ruleFaint: '#dee1db',
  terrain: '#656b72',
  terrainTint: '#dcdfd9',
  procedure: '#22252a',
  procedureTint: '#dcdfd9',
  gain: '#1f6b33',
  gainTint: '#dbe8dc',
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
  // Identity and judgement are separate channels, and mixing them is what made
  // the old palette unreadable: a lap cannot be "the green one" on a screen
  // where green also means you gained time. So series identity is ink at three
  // weights, carried mainly by the dash pattern, and the traffic light is left
  // to mean only gained, caution, lost. Series 0 is the subject and is drawn
  // in full ink; everything measured against it steps back.
  return [ink.ink, ink.ink2, ink.ink3, ink.ink, ink.ink2, ink.ink3];
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
