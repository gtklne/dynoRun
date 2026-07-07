import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  // Web prod is served under the /dynorun/ subpath of the wasgoht.ch suite, so
  // CI builds with VITE_DEPLOY_BASE=/dynorun/. The Capacitor native build must
  // NOT set it — the webview serves from root, so base stays '/'.
  base: process.env.VITE_DEPLOY_BASE || '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  // Dev only: proxy API + auth calls to the local Hono server (npm run dev in
  // server/). Keeps frontend and API same-origin so better-auth session cookies
  // work without cross-site/secure-cookie hassle. Not used by the prod build —
  // nginx proxies /api there.
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
