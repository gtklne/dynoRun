import '@testing-library/jest-dom/vitest';
import fs from 'node:fs';
import path from 'node:path';

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
