import '@testing-library/jest-dom/vitest';

// This jsdom build exposes no localStorage (and Node 26's own global is inert
// without --localstorage-file), so every storage-backed test and the native
// token store read undefined. Install a plain in-memory Storage instead.
if (typeof window !== 'undefined' && !window.localStorage) {
  const store = new Map<string, string>();
  const memoryStorage: Storage = {
    get length() { return store.size; },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => { store.clear(); },
  };
  for (const target of [window, globalThis]) {
    Object.defineProperty(target, 'localStorage', {
      configurable: true,
      writable: true,
      value: memoryStorage,
    });
  }
}

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

// jsdom's Blob/File lack the async read methods (text/arrayBuffer) that every
// real browser has; upload flows call file.text().
if (typeof Blob !== 'undefined' && !Blob.prototype.text) {
  Blob.prototype.text = function (this: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(r.error);
      r.readAsText(this);
    });
  };
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

