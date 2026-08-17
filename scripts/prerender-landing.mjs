// Post-build step: render the landing page to a standalone document with no
// <script> at all, named after LANDING_URL's path (dist/hello.html). Runs after
// `vite build` (see package.json), because it reads the built stylesheet out of
// dist/ and inlines it.
//
// nginx serves this file for exactly that path, 301s "/" to it for anonymous
// visitors, and keeps the SPA shell for everything else: see the "Zero-JS landing
// page" note in CLAUDE.md.

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
let landingUrl;
try {
  const mod = await vite.ssrLoadModule('/src/prerender/landing-document.tsx');
  html = mod.renderLandingDocument({ css });
  landingUrl = mod.LANDING_URL;
} finally {
  await vite.close();
}

// Derived from LANDING_URL rather than hardcoded so the file nginx serves and the
// canonical the document declares cannot drift apart: a page served at /hello that
// still declared "/" as its canonical would hand Google the one URL this page exists
// to stop using, and the move would fail silently.
const landingPath = new URL(landingUrl).pathname;
const slug = landingPath.replace(/^\/+|\/+$/g, '');
if (!slug || slug.includes('/')) {
  throw new Error(`prerender: LANDING_URL path must be one flat segment, got "${landingPath}".`);
}
const file = `${slug}.html`;

// Guards, not decoration: a silently-empty or silently-scripted landing page
// would still deploy and still look fine to anyone testing with JS enabled.
if (/<script/i.test(html)) {
  throw new Error(`prerender: ${file} contains a <script> tag. The page must run no JS.`);
}
if (!html.includes(`<link rel="canonical" href="${landingUrl}" />`)) {
  throw new Error(`prerender: ${file} does not declare ${landingUrl} as its canonical.`);
}
const markup = html.slice(html.indexOf('<body>'));
if (markup.length < 2000) {
  throw new Error(`prerender: ${file} body is only ${markup.length} bytes. The render looks empty.`);
}

const out = path.join(dist, file);
await writeFile(out, html);
console.log(
  `prerender: wrote ${path.relative(process.cwd(), out)} for ${landingPath} (${(html.length / 1024).toFixed(1)} kB, 0 scripts)`,
);
