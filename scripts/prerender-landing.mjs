// Post-build step: render the landing page to dist/landing.html as a standalone
// document with no <script> at all. Runs after `vite build` (see package.json),
// because it reads the built stylesheet out of dist/ and inlines it.
//
// nginx serves this file for exactly "/" and keeps the SPA shell for everything
// else: see the "Zero-JS landing page" note in CLAUDE.md.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';

const dist = path.resolve(process.cwd(), 'dist');

const manifest = JSON.parse(await readFile(path.join(dist, '.vite/manifest.json'), 'utf8'));
const cssFiles = manifest['index.html']?.css ?? [];
if (cssFiles.length === 0) {
  throw new Error('prerender: no CSS in the index.html manifest entry. Did the build emit a stylesheet?');
}
const css = (await Promise.all(cssFiles.map((f) => readFile(path.join(dist, f), 'utf8')))).join('\n');

// A throwaway Vite dev server is the cheapest way to import TSX with the '@'
// alias resolved exactly as the app resolves it; middlewareMode never binds a port.
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'warn' });
let html;
try {
  const mod = await vite.ssrLoadModule('/src/prerender/landing-document.tsx');
  html = mod.renderLandingDocument({ css });
} finally {
  await vite.close();
}

// Guards, not decoration: a silently-empty or silently-scripted landing page
// would still deploy and still look fine to anyone testing with JS enabled.
if (/<script/i.test(html)) {
  throw new Error('prerender: landing.html contains a <script> tag. The page must run no JS.');
}
const markup = html.slice(html.indexOf('<body>'));
if (markup.length < 2000) {
  throw new Error(`prerender: landing.html body is only ${markup.length} bytes. The render looks empty.`);
}

const out = path.join(dist, 'landing.html');
await writeFile(out, html);
console.log(`prerender: wrote ${path.relative(process.cwd(), out)} (${(html.length / 1024).toFixed(1)} kB, 0 scripts)`);
