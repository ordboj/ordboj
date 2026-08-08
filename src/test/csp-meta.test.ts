import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Regression guard for the CSP <meta> tag in index.html. index.html is
// staff-engineer-owned; this test only reads it, never edits it. If a
// scaffold regeneration (Lovable, a Vite upgrade, etc.) drops the tag or
// weakens it back to 'unsafe-inline'/missing worker-src, this must fail
// loudly instead of only being caught by someone eyeballing a diff.
//
// This is a static-string check, not a live-DOM check: jsdom (vitest's
// environment) does not enforce CSP the way a real browser does, so
// asserting behavior here would be a false sense of security. The e2e
// suite (e2e/csp-violations.spec.ts) is what proves the policy is actually
// enforced by a real browser against the production build.
const indexHtmlPath = resolve(__dirname, '../../index.html');
const html = readFileSync(indexHtmlPath, 'utf-8');

function extractCspContent(markup: string): string {
  const match = markup.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"/);
  if (!match) {
    throw new Error('No CSP <meta http-equiv="Content-Security-Policy"> tag found in index.html');
  }
  return match[1]!;
}

describe('index.html Content-Security-Policy meta tag', () => {
  it('is present', () => {
    expect(() => extractCspContent(html)).not.toThrow();
  });

  it('restricts script-src to self, with no unsafe-inline', () => {
    const csp = extractCspContent(html);
    const scriptSrc = csp.match(/script-src\s+([^;]+);/)?.[1];
    expect(scriptSrc, 'script-src directive must be present').toBeDefined();
    expect(scriptSrc).toContain("'self'");
    expect(scriptSrc).not.toContain('unsafe-inline');
    expect(scriptSrc).not.toContain('unsafe-eval');
  });

  it('allows worker-src blob:, required by canvas-confetti', () => {
    const csp = extractCspContent(html);
    const workerSrc = csp.match(/worker-src\s+([^;]+);/)?.[1];
    expect(workerSrc, 'worker-src directive must be present').toBeDefined();
    expect(workerSrc).toContain("'self'");
    expect(workerSrc).toContain('blob:');
  });

  it('restricts form-action to self', () => {
    const csp = extractCspContent(html);
    const formAction = csp.match(/form-action\s+([^;]+);/)?.[1];
    expect(formAction, 'form-action directive must be present').toBeDefined();
    expect(formAction).toContain("'self'");
  });

  it('appears before any <script> tag in <head>', () => {
    const cspIndex = html.indexOf('http-equiv="Content-Security-Policy"');
    const scriptIndex = html.indexOf('<script');
    expect(cspIndex).toBeGreaterThan(-1);
    expect(scriptIndex).toBeGreaterThan(-1);
    expect(cspIndex).toBeLessThan(scriptIndex);
  });
});
