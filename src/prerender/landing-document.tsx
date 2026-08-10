// Build-time prerender of the public landing page into a standalone, script-free
// HTML document (see scripts/prerender-landing.mjs).
//
// Why prerender instead of letting the SPA render "/": the landing page is the
// only route crawlers may fetch (robots.txt disallows /imprint and /privacy, and
// every other route sits behind RequireAuth), and it is the only page an
// anonymous first-time visitor ever sees. It also has no dynamic data at all, so
// there is nothing a request-time render could add — a file on disk is strictly
// better than an SSR round-trip through the API.
//
// The CSS is inlined rather than linked because nginx here only gzips text/html
// (gzip_types is left at its default), so 60 kB of inlined CSS goes over the wire
// at ~11 kB while the same bytes as /assets/index-*.css would go uncompressed —
// and the page ends up with no render-blocking sub-resource either way.

import { renderToStaticMarkup } from 'react-dom/server';
import { LandingScreen } from '@/ui/home/landing-screen';

export const LANDING_TITLE = 'wasgoht — motorsport telemetry';
export const LANDING_URL = 'https://wasgoht.ch/';

const DESCRIPTION =
  'wasgoht — motorsport telemetry tools. A GPS virtual dyno and a track-session grip analyzer, in one place.';

/**
 * Renders the complete landing document. Pure so it can be unit-tested without
 * running a build; `css` is the built stylesheet, injected by the build script.
 */
export function renderLandingDocument({ css }: { css: string }): string {
  // Wrapped in #root even though React never mounts here: index.css sizes
  // `html, body, #root` together, so keeping the element makes the prerendered
  // cascade identical to the SPA's.
  const body = `<div id="root">${renderToStaticMarkup(<LandingScreen />)}</div>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#09090b" />
    <meta name="description" content="${DESCRIPTION}" />
    <link rel="canonical" href="${LANDING_URL}" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="apple-touch-icon" href="/favicon.svg" />
    <meta property="og:site_name" content="wasgoht" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="wasgoht — motorsport telemetry tools" />
    <meta property="og:description" content="A GPS virtual dyno and a track-session grip analyzer, in one place." />
    <meta property="og:url" content="${LANDING_URL}" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="wasgoht — motorsport telemetry tools" />
    <meta name="twitter:description" content="A GPS virtual dyno and a track-session grip analyzer, in one place." />
    <title>${LANDING_TITLE}</title>
    <style>${css}</style>
  </head>
  <body>${body}</body>
</html>
`;
}
