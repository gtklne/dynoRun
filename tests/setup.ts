import '@testing-library/jest-dom/vitest';

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

// jsdom doesn't implement canvas 2d context; mock getContext so uPlot and
// the share-card renderer don't throw during tests. Use a Proxy so any
// method we forget falls back to a no-op rather than breaking tests.
if (typeof window !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (HTMLCanvasElement.prototype as any).getContext = function () {
    const real = {
      fillRect: () => {},
      strokeRect: () => {},
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
      createRadialGradient: () => ({ addColorStop: () => {} }),
      quadraticCurveTo: () => {},
      bezierCurveTo: () => {},
      canvas: this,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new Proxy(real, {
      get(target, prop) {
        if (prop in target) return (target as any)[prop];
        // Default: no-op function for unknown methods, undefined for unknown props.
        return () => {};
      },
      set(target, prop, value) {
        (target as any)[prop] = value;
        return true;
      },
    });
  };

  // jsdom's HTMLCanvasElement.toBlob throws "Not implemented" without the
  // optional `canvas` npm package. Replace with a stub that produces a tiny
  // PNG-typed blob so the share-card renderer can be tested end-to-end.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (HTMLCanvasElement.prototype as any).toBlob = function (
    cb: (blob: Blob | null) => void,
    type = 'image/png',
  ) {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    cb(new Blob([bytes], { type }));
  };
}

