import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  LANDING_SOCIAL_IMAGE,
  LANDING_TITLE,
  LANDING_URL,
  renderLandingDocument,
} from '@/prerender/landing-document';

const html = renderLandingDocument({ css: '.sentinel{color:red}' });

describe('renderLandingDocument', () => {
  it('is a complete standalone document', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<html lang="en">');
    expect(html).toContain(`<title>${LANDING_TITLE}</title>`);
    expect(html).toContain(`<link rel="canonical" href="${LANDING_URL}" />`);
  });

  // Pinned to the literal URL, not just to LANDING_URL: this page exists at /hello
  // precisely because Google holds "/" in an inherited duplicate cluster, so a
  // canonical that quietly reverts to "/" would undo the whole move and still pass
  // a test written against the constant.
  it('claims /hello as its own canonical, never the domain root', () => {
    expect(LANDING_URL).toBe('https://wasgoht.ch/hello');
    expect(html).toContain('<link rel="canonical" href="https://wasgoht.ch/hello" />');
    expect(html).toContain('<meta property="og:url" content="https://wasgoht.ch/hello" />');
    expect(html).not.toContain('href="https://wasgoht.ch/"');
  });

  it('ships no JavaScript', () => {
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/\son[a-z]+=/i);
  });

  it('inlines the stylesheet instead of linking one', () => {
    expect(html).toContain('<style>.sentinel{color:red}</style>');
    expect(html).not.toMatch(/<link[^>]+rel="stylesheet"/i);
  });

  it('renders the six-section evidence-led story and conversion copy', () => {
    expect(html).toContain('Change one thing.');
    expect(html).toContain('Prove it worked.');
    expect(html).toContain('Measure wheel power from GPS. Find unused grip from RaceBox.');
    expect(html).toContain('GPS analysis');
    expect(html).toContain('RaceBox support');
    expect(html).toContain('Browser access');
    expect(html).toContain('Calibrate once.');
    // The primary audience recorded in PRODUCT.md leads with track-day
    // motorcycle riders, and the whole hands-free path exists for them, so the
    // page must not address car drivers alone.
    expect(html).toContain('drivers and riders');
    expect(html).toContain('Find the grip you left on track.');
    expect(html).toContain('Record. Compare. Decide.');
    expect(html).toContain('Make the next change count.');
  });

  it('keeps the public, product, and legal routes navigable without JavaScript', () => {
    for (const href of ['/hello', '/login', '/demo', '/grip', '/privacy', '/imprint']) {
      expect(html).toContain(`href="${href}"`);
    }
    // No internal link points at "/": it only 301s here, and linking it keeps asking
    // Google to crawl the URL this page was moved off.
    expect(html).not.toMatch(/href="\/"/);
    expect(html.match(/href="\/login"/g)?.length).toBeGreaterThanOrEqual(3);
    expect(html).toContain('Start measuring');
    expect(html).toContain('See a real run');
  });

  // The page used to ship four raster product captures. It no longer ships any:
  // the demonstration is drawn natively by LandingScreen from the shipping
  // analysis pipeline, so it cannot go stale against the app the way a
  // screenshot does, and the document has no image byte on its critical path.
  it('draws its demonstration natively instead of shipping product screenshots', () => {
    expect(html).not.toMatch(/<img/i);
    expect(html).not.toMatch(/<picture/i);
    expect(html).not.toContain('/media/dynorun-capture');
    expect(html).not.toContain('/media/grip-traction');
    expect(html).not.toContain('/media/grip-corners');
    expect(html).not.toContain('/media/wasgoht-track-hero');

    // Drawn, not decorative: every figure carries a role and a described label.
    const figures = html.match(/<svg[^>]+role="img"/g) ?? [];
    expect(figures.length).toBeGreaterThanOrEqual(3);
    expect(html).toMatch(/aria-label="Wheel power against engine RPM[^"]+"/);
    expect(html).toMatch(/aria-label="Traction circle[^"]+"/);
  });

  // The figures are the output of the real pipeline, not numbers typed into the
  // markup, so they have to be plausible readings rather than any string at all.
  it('plots real pipeline output, with the peak stated on the sheet', () => {
    const peak = html.match(/(\d+) kW at (\d+) RPM/);
    expect(peak).not.toBeNull();
    const kw = Number(peak![1]);
    const rpm = Number(peak![2]);
    expect(kw).toBeGreaterThan(50);
    expect(kw).toBeLessThan(600);
    expect(rpm).toBeGreaterThan(2000);
    expect(rpm).toBeLessThan(7000);
  });

  // Both caveats are a stated product principle, not decoration, so they are
  // pinned here: a rewrite that quietly drops either one changes the claim.
  it('states what the two measurements are worth', () => {
    expect(html).toContain('It is not a replacement for a calibrated rolling-road');
    expect(html).toContain('It does not measure the tyre&#x27;s absolute limit.');
    expect(html).toContain('Synthetic');
  });

  it('publishes large social-card metadata backed by a real image asset', () => {
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(html).toContain(`<meta property="og:image" content="${LANDING_SOCIAL_IMAGE}" />`);
    expect(html).toContain('<meta property="og:image:width" content="1200" />');
    expect(html).toContain('<meta property="og:image:height" content="630" />');
    expect(html).toContain('GPS power curves, RaceBox grip analysis, and run comparison');

    const socialCard = resolve('public/media/wasgoht-social-card.png');
    expect(existsSync(socialCard)).toBe(true);
    expect(statSync(socialCard).size).toBeGreaterThan(25_000);
  });

  it('carries a followable link to Partynado', () => {
    const anchor = html.match(/<a[^>]+href="https:\/\/partynado\.com"[^>]*>/)?.[0];
    expect(anchor).toBeDefined();
    expect(anchor).not.toMatch(/nofollow/);
    expect(html).toContain('Our friends');
    expect(html).toContain('Partynado');
  });
});
