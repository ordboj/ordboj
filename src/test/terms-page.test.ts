import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { termsResponse, TERMS_HTML } from '../../functions/terms';

// /terms is a Pages Function (functions/terms.ts), same as /privacy.
// Cloudflare does not apply public/_redirects to a Function, so the SPA
// rule `/* /index.html 200` cannot replace this response with the trainer.
// A 200 rewrite to a .html file is the wrong fix: Pages strips ".html"
// and requests /terms again.

const repoRoot = resolve(__dirname, '../..');

const CLAUSES = [
  'Ordböj is a free site for practicing Swedish verbs.',
  'You may use Ordböj for your own learning. Do not misuse the service, try to break it, or harm other users.',
  'The service is provided as is. We may change or stop it.',
  'These terms are governed by the laws of Sweden.',
  'If we change these terms, we will update this page.',
];

function parseRedirects(text: string): { source: string; destination: string; status: number }[] {
  const rules = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 2) continue;
    rules.push({
      source: parts[0] ?? '',
      destination: parts[1] ?? '',
      status: parts[2] ? Number(parts[2]) : 302,
    });
  }
  return rules;
}

describe('GET /terms', () => {
  it('returns the terms as HTML, not the trainer shell', async () => {
    const response = termsResponse();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    const body = await response.text();
    expect(body).toBe(TERMS_HTML);

    expect(body).toContain('<title>Terms of Use — Ordböj</title>');
    expect(body).toContain('<h1>Terms of Use</h1>');
    const missing = CLAUSES.filter((clause) => !body.includes(clause));
    expect(missing).toEqual([]);
    expect(body).toContain(
      'How we handle your data is described in the <a href="/privacy">Privacy Policy</a>.',
    );
    expect(body).toContain('<a href="/">Back to Ordböj</a>');
    expect(body).toContain('<a href="/privacy">Privacy</a>');
    expect(body).not.toMatch(/<script/i);
    expect(body).not.toContain('id="root"');
    expect(body).not.toContain('/src/main.tsx');
    expect(body).not.toMatch(/needs JavaScript/i);
    expect(body).not.toMatch(/cloudflareinsights/i);
    expect(body).not.toMatch(/Content-Security-Policy/i);
    // Sign-in is required, and Google is the provider this release offers
    // (ORD-109). Main omitted these sentences while sign-in was not required.
    expect(body).toContain('To use the site, you must sign in.');
    expect(body).toContain('We currently offer sign-in with Google.');
    expect(body).not.toMatch(/\bgdpr\b/i);
    expect(body).not.toMatch(/encrypt/i);
  });

  it('is served by the Pages Function, which _redirects does not override', () => {
    const source = readFileSync(resolve(repoRoot, 'functions/terms.ts'), 'utf8');
    expect(source).toMatch(/export const onRequest\b/);
    expect(source).toContain('termsResponse');

    const redirects = readFileSync(resolve(repoRoot, 'public/_redirects'), 'utf8');
    const rules = parseRedirects(redirects);
    const explicit = rules.find((rule) => rule.source === '/terms' || rule.source === '/terms/');
    expect(explicit, 'a rewrite of /terms to an html file loops on Pages').toBeUndefined();
  });

  it('is served in local dev the same way as /privacy', () => {
    const vite = readFileSync(resolve(repoRoot, 'vite.config.ts'), 'utf8');
    expect(vite).toContain("from './functions/terms.ts'");
    expect(vite).toContain('TERMS_HTML');
    expect(vite).toContain("pathname !== '/terms' && pathname !== '/terms/'");
    expect(vite).toContain("from './functions/privacy.ts'");
    expect(vite).toContain("pathname !== '/privacy' && pathname !== '/privacy/'");
  });

  it('still rewrites other app routes to the trainer shell', () => {
    const redirects = parseRedirects(readFileSync(resolve(repoRoot, 'public/_redirects'), 'utf8'));
    const splat = redirects.find((rule) => rule.source === '/*');
    expect(splat?.destination).toBe('/index.html');
    expect(splat?.status).toBe(200);
    const shell = readFileSync(resolve(repoRoot, 'index.html'), 'utf8');
    expect(shell).toContain('id="root"');
  });

  it('keeps the homepage a product page with a plain Terms anchor', () => {
    const home = readFileSync(resolve(repoRoot, 'src/pages/Home.tsx'), 'utf8');
    expect(home).toContain('Master Swedish verbs with spaced repetition');
    expect(home).toMatch(/<a[\s\S]*?href="\/terms"[\s\S]*?>\s*Terms\s*<\/a>/);
    expect(home).not.toMatch(/<Link[^>]*to=["']\/terms["']/);
    expect(home).toMatch(/<a[\s\S]*?href="\/privacy"[\s\S]*?>\s*Privacy\s*<\/a>/);
  });
});
