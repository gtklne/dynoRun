import '@testing-library/jest-dom/vitest';
import fs from 'node:fs';
import path from 'node:path';

// jsdom doesn't implement matchMedia; uPlot calls it at module load.
if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

// jsdom doesn't implement canvas 2d context; mock getContext so uPlot
// doesn't throw console errors during tests.
if (typeof window !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (HTMLCanvasElement.prototype as any).getContext = function () {
    return {
      fillRect: () => {},
      clearRect: () => {},
      getImageData: () => ({ data: new Uint8ClampedArray(0) }),
      putImageData: () => {},
      createImageData: () => [],
      setTransform: () => {},
      drawImage: () => {},
      save: () => {},
      fillText: () => {},
      restore: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      closePath: () => {},
      stroke: () => {},
      translate: () => {},
      scale: () => {},
      rotate: () => {},
      arc: () => {},
      fill: () => {},
      measureText: () => ({ width: 0 }),
      transform: () => {},
      rect: () => {},
      clip: () => {},
      createLinearGradient: () => ({ addColorStop: () => {} }),
      canvas: this,
    };
  };
}

const wasmPath = path.resolve('node_modules/sql.js/dist/sql-wasm.wasm');
const wasmBinary = fs.readFileSync(wasmPath);

// In jsdom (Node-backed), sql.js uses fs.readFileSync rather than fetch to load
// the wasm binary. Supplying wasmBinary directly bypasses all URL loading.
(globalThis as Record<string, unknown>).__sqlJsConfig = { wasmBinary };

const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input.toString();
  if (url.endsWith('sql-wasm.wasm')) {
    return new Response(wasmBinary, { headers: { 'content-type': 'application/wasm' } });
  }
  return originalFetch(input as never, init);
}) as typeof fetch;
