import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Regression coverage for issue #100 / PR #202 acceptance criterion 1:
// "Darken --success, --muted-foreground, --destructive in src/index.css
// until all measured text/background pairs pass WCAG AA at their used
// sizes." This test reads the real src/index.css (not a copy), extracts
// the design-token HSL triples, and independently recomputes WCAG relative-
// luminance contrast ratios against the two backgrounds these tokens are
// actually rendered on in the app (the card and the page gradient's base
// color). It does not trust the ratios pasted in the PR description; it
// recomputes them from the shipped CSS values with a standard formula
// (https://www.w3.org/TR/WCAG21/#dfn-relative-luminance).
//
// All the app's use sites for --success, --muted-foreground and
// --destructive are small/normal text (see PracticeCard.tsx, Home.tsx),
// so this pins the stricter 4.5:1 normal-text AA threshold everywhere,
// matching the PR's own stated approach ("targeted the 4.5:1 normal-text
// threshold everywhere for margin").
const AA_NORMAL_TEXT = 4.5;

type Hsl = [h: number, s: number, l: number];

function hslToRgb([h, s, l]: Hsl): [number, number, number] {
  const sFrac = s / 100;
  const lFrac = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sFrac * Math.min(lFrac, 1 - lFrac);
  const f = (n: number) => lFrac - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const toLinear = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const rs = toLinear(r);
  const gs = toLinear(g);
  const bs = toLinear(b);
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastRatio(a: Hsl, b: Hsl): number {
  const la = relativeLuminance(hslToRgb(a));
  const lb = relativeLuminance(hslToRgb(b));
  const [lighter, darker] = la > lb ? [la, lb] : [lb, la];
  return (lighter + 0.05) / (darker + 0.05);
}

// Pull a single `--token: h s% l%;` declaration out of the `:root { ... }`
// block of the real index.css.
function readToken(css: string, blockSelector: 'root', token: string): Hsl {
  const blockRe = /:root\s*\{([\s\S]*?)\}/;
  const block = css.match(blockRe);
  const blockContent = block?.[1];
  if (blockContent === undefined) {
    throw new Error(`Could not find :${blockSelector} block in index.css`);
  }
  const tokenRe = new RegExp(`--${token}:\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%`);
  const match = blockContent.match(tokenRe);
  const h = match?.[1];
  const s = match?.[2];
  const l = match?.[3];
  if (h === undefined || s === undefined || l === undefined) {
    throw new Error(`Could not find --${token} in :${blockSelector} block`);
  }
  return [Number(h), Number(s), Number(l)];
}

const cssPath = path.resolve(__dirname, '../index.css');
const css = readFileSync(cssPath, 'utf-8');

describe('src/index.css design tokens meet WCAG AA contrast (issue #100)', () => {
  describe('light theme (:root)', () => {
    const card = readToken(css, 'root', 'card'); // 0 0% 100%
    const background = readToken(css, 'root', 'background'); // page gradient base

    it('--muted-foreground reaches 4.5:1 against the card', () => {
      const fg = readToken(css, 'root', 'muted-foreground');
      expect(contrastRatio(fg, card)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    });

    it('--muted-foreground reaches 4.5:1 against the page background', () => {
      const fg = readToken(css, 'root', 'muted-foreground');
      expect(contrastRatio(fg, background)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    });

    it('--destructive reaches 4.5:1 against the card (bg-destructive/10 renders near-card)', () => {
      const fg = readToken(css, 'root', 'destructive');
      expect(contrastRatio(fg, card)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    });

    it('--success reaches 4.5:1 against the card (bg-success/10 renders near-card)', () => {
      const fg = readToken(css, 'root', 'success');
      expect(contrastRatio(fg, card)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    });

    // Regression guard: pins the specific pre-fix lightness values called
    // out in the PR (before: muted-foreground 50%, destructive 60%,
    // success 45%) so nobody can silently revert the darkening. These
    // fail today's assertions above if reintroduced.
    it('is not using the pre-fix (too-light) lightness values', () => {
      const mutedForeground = readToken(css, 'root', 'muted-foreground');
      const destructive = readToken(css, 'root', 'destructive');
      const success = readToken(css, 'root', 'success');
      expect(mutedForeground[2]).toBeLessThanOrEqual(43);
      expect(destructive[2]).toBeLessThanOrEqual(44);
      expect(success[2]).toBeLessThanOrEqual(28);
    });
  });

  // Dark mode was removed by product decision (docs/product/2026-08-08-
  // dark-mode-decision.md) and src/index.css has no .dark block anymore
  // (enforced by src/test/darkModeStrip.test.ts). There is no dark-theme
  // contrast to pin here; readToken() only supports 'root'.
});
