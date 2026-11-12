import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { privacyResponse, PRIVACY_HTML } from '../../functions/privacy';

// /privacy is a Pages Function (functions/privacy.ts). Cloudflare does not
// apply public/_redirects to a Function, so the SPA rule `/* /index.html 200`
// cannot replace this response with the trainer. A 200 rewrite to a .html
// file is the wrong fix: Pages strips ".html" and requests /privacy again.

const repoRoot = resolve(__dirname, '../..');

const DISCLOSURES: { label: string; pattern: RegExp }[] = [
  { label: 'Google sign-in', pattern: /google/i },
  { label: 'email', pattern: /email/i },
  { label: 'basic profile', pattern: /profile/i },
  { label: 'openid', pattern: /openid/i },
  { label: 'sign-in cookie', pattern: /sign-in cookie/i },
  { label: 'practice progress', pattern: /practice progress/i },
  { label: 'Cloudflare D1', pattern: /cloudflare d1/i },
  { label: 'EU', pattern: /\bEU\b/ },
  { label: 'this browser', pattern: /this browser/i },
  { label: 'does not sell', pattern: /does not sell/i },
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

describe('GET /privacy', () => {
  it('returns the policy as HTML, not the trainer shell', async () => {
    const response = privacyResponse();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    const body = await response.text();
    expect(body).toBe(PRIVACY_HTML);

    const missing = DISCLOSURES.filter(({ pattern }) => !pattern.test(body)).map(
      ({ label }) => label,
    );
    expect(missing).toEqual([]);
    expect(body).not.toContain('id="root"');
    expect(body).not.toContain('/src/main.tsx');
    expect(body).not.toMatch(/needs JavaScript/i);
    expect(body).not.toMatch(/<script/i);
  });

  it('is served by the Pages Function, which _redirects does not override', () => {
    const source = readFileSync(resolve(repoRoot, 'functions/privacy.ts'), 'utf8');
    expect(source).toMatch(/export const onRequest\b/);
    expect(source).toContain('privacyResponse');

    const redirects = readFileSync(resolve(repoRoot, 'public/_redirects'), 'utf8');
    const rules = parseRedirects(redirects);
    const explicit = rules.find(
      (rule) => rule.source === '/privacy' || rule.source === '/privacy/',
    );
    expect(explicit, 'a rewrite of /privacy to an html file loops on Pages').toBeUndefined();
  });

  it('still rewrites other app routes to the trainer shell', () => {
    const redirects = parseRedirects(readFileSync(resolve(repoRoot, 'public/_redirects'), 'utf8'));
    const splat = redirects.find((rule) => rule.source === '/*');
    expect(splat?.destination).toBe('/index.html');
    expect(splat?.status).toBe(200);
    const shell = readFileSync(resolve(repoRoot, 'index.html'), 'utf8');
    expect(shell).toContain('id="root"');
  });
});
