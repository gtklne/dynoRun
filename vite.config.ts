import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
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
