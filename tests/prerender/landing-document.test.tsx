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

  it('ships no JavaScript', () => {
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/\son[a-z]+=/i);
  });

  it('inlines the stylesheet instead of linking one', () => {
    expect(html).toContain('<style>.sentinel{color:red}</style>');
    expect(html).not.toMatch(/<link[^>]+rel="stylesheet"/i);
  });

  it('renders the six-section evidence-led story and conversion copy', () => {
    expect(html).toContain('Tune the car.');
    expect(html).toContain('Prove the difference.');
    expect(html).toContain('Measure wheel power from GPS. Find unused grip from RaceBox.');
    expect(html).toContain('GPS analysis');
    expect(html).toContain('RaceBox support');
    expect(html).toContain('Browser access');
    expect(html).toContain('Change one thing.');
    expect(html).toContain('Find the grip you left on track.');
    expect(html).toContain('Record. Compare. Decide.');
    expect(html).toContain('Make the next change count.');
  });

  it('keeps the public, product, and legal routes navigable without JavaScript', () => {
    for (const href of ['/', '/login', '/demo', '/grip', '/privacy', '/imprint']) {
      expect(html).toContain(`href="${href}"`);
    }
    expect(html.match(/href="\/login"/g)?.length).toBeGreaterThanOrEqual(3);
    expect(html).toContain('Start measuring');
    expect(html).toContain('See a real run');
  });

  it('includes responsive modern image formats, dimensions, and useful alt text', () => {
    expect(html).toContain('/media/wasgoht-track-hero-1536.avif');
    expect(html).toContain('/media/wasgoht-track-hero-768.webp');
    expect(html).toContain('/media/dynorun-capture-1200.avif');
    expect(html).toContain('/media/dynorun-capture-768.webp');
    expect(html).toContain('/media/grip-traction-824.avif');
    expect(html).toContain('/media/grip-corners-720.webp');
    expect(html).toContain('width="1536" height="1024"');
    expect(html).toContain('alt="Unbranded track car waiting in a quiet pit lane before a test session"');
    expect(html.match(/loading="eager"/g)).toHaveLength(1);
    expect(html.match(/loading="lazy"/g)).toHaveLength(3);
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

  it('keeps every referenced responsive asset in the public bundle', () => {
    const assets = [
      'wasgoht-track-hero-1536.avif',
      'wasgoht-track-hero-1536.webp',
      'wasgoht-track-hero-768.avif',
      'wasgoht-track-hero-768.webp',
      'dynorun-capture-1200.avif',
      'dynorun-capture-1200.webp',
      'dynorun-capture-768.avif',
      'dynorun-capture-768.webp',
      'grip-traction-824.avif',
      'grip-traction-824.webp',
      'grip-traction-520.avif',
      'grip-traction-520.webp',
      'grip-corners-1120.avif',
      'grip-corners-1120.webp',
      'grip-corners-720.avif',
      'grip-corners-720.webp',
    ];
    for (const asset of assets) {
      const path = resolve('public/media', asset);
      expect(existsSync(path), asset).toBe(true);
      expect(statSync(path).size, asset).toBeGreaterThan(1_000);
    }
  });

  it('carries a followable link to Partynado', () => {
    const anchor = html.match(/<a[^>]+href="https:\/\/partynado\.com"[^>]*>/)?.[0];
    expect(anchor).toBeDefined();
    expect(anchor).not.toMatch(/nofollow/);
    expect(html).toContain('Our friends');
    expect(html).toContain('Partynado');
  });
});
