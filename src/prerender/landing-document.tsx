// Build-time prerender of the public landing page into a standalone, script-free
// HTML document (see scripts/prerender-landing.mjs).
//
// Why prerender instead of letting the SPA render "/": the landing page is the
// only route crawlers may fetch (robots.txt disallows /imprint and /privacy, and
// every other route sits behind RequireAuth), and it is the only page an
// anonymous first-time visitor ever sees. It also has no dynamic data at all, so
// there is nothing a request-time render could add. A file on disk is strictly
// better than an SSR round-trip through the API.
//
// The CSS is inlined rather than linked because nginx here only gzips text/html
// (gzip_types is left at its default), so 60 kB of inlined CSS goes over the wire
// at ~11 kB while the same bytes as /assets/index-*.css would go uncompressed,
// and the page ends up with no render-blocking sub-resource either way.

import { renderToStaticMarkup } from 'react-dom/server';
import { LandingScreen } from '@/ui/home/landing-screen';

export const LANDING_TITLE = 'wasgoht | GPS dyno and grip analysis for drivers.';
export const LANDING_URL = 'https://wasgoht.ch/';
export const LANDING_SOCIAL_IMAGE = 'https://wasgoht.ch/media/wasgoht-social-card.png';

const DESCRIPTION =
  'Measure GPS-derived wheel power, compare runs, and analyze RaceBox grip and corners in one focused browser toolkit for drivers.';

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
    <link rel="preload" as="image" href="/media/wasgoht-track-hero-768.avif" type="image/avif" media="(max-width: 767px)" />
    <link rel="preload" as="image" href="/media/wasgoht-track-hero-1536.avif" type="image/avif" media="(min-width: 768px)" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="apple-touch-icon" href="/favicon.svg" />
    <meta property="og:site_name" content="wasgoht" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${LANDING_TITLE}" />
    <meta property="og:description" content="GPS power curves, RaceBox grip analysis, and run comparison for drivers who tune through evidence." />
    <meta property="og:url" content="${LANDING_URL}" />
    <meta property="og:image" content="${LANDING_SOCIAL_IMAGE}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="wasgoht GPS dyno and Grip analysis with an unbranded track car" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${LANDING_TITLE}" />
    <meta name="twitter:description" content="GPS power curves, RaceBox grip analysis, and run comparison for drivers who tune through evidence." />
    <meta name="twitter:image" content="${LANDING_SOCIAL_IMAGE}" />
    <meta name="twitter:image:alt" content="wasgoht GPS dyno and Grip analysis with an unbranded track car" />
    <title>${LANDING_TITLE}</title>
    <style>${css}</style>
  </head>
  <body>${body}</body>
</html>
`;
}
