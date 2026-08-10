import { describe, expect, it } from 'vitest';
import { LANDING_TITLE, LANDING_URL, renderLandingDocument } from '@/prerender/landing-document';

const html = renderLandingDocument({ css: '.sentinel{color:red}' });

describe('renderLandingDocument', () => {
  it('is a complete standalone document', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<html lang="en">');
    expect(html).toContain(`<title>${LANDING_TITLE}</title>`);
    expect(html).toContain(`<link rel="canonical" href="${LANDING_URL}" />`);
  });

  it('ships no JavaScript', () => {
    // The whole point of prerendering: the page must be readable by a client that
    // runs no JS at all. A <script> tag here means a crawler or a JS-off visitor
    // sees a blank page.
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/\son[a-z]+=/i);
  });

  it('inlines the stylesheet instead of linking one', () => {
    expect(html).toContain('<style>.sentinel{color:red}</style>');
    expect(html).not.toMatch(/<link[^>]+rel="stylesheet"/i);
  });

  it('renders the real page content, not an empty shell', () => {
    expect(html).toContain('DynoRun');
    expect(html).toContain('Grip Utilization');
    expect(html).toContain('Sign in to get started');
    expect(html).toContain('See an example run');
    expect(html).toContain('href="/login"');
  });

  it('carries a followable link to Partynado', () => {
    const anchor = html.match(/<a[^>]+href="https:\/\/partynado\.com"[^>]*>/)?.[0];
    expect(anchor).toBeDefined();
    // A nofollow here would defeat the reason the link exists.
    expect(anchor).not.toMatch(/nofollow/);
    expect(html).toContain('Our friends');
    expect(html).toContain('Partynado');
  });
});
