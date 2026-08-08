import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Issue #227 AC: "Badge text meets WCAG 4.5:1 contrast." Rather than
// snapshotting the CSS, this test parses the actual HSL custom-property
// values shipped in src/index.css and computes the real WCAG contrast
// ratio for each stage badge's bg/foreground pair, so a future edit to
// these tokens that regresses contrast fails loudly here instead of
// silently shipping unreadable badge text. Against the pre-fix CSS (no
// --stage-* tokens at all) the regex below finds nothing and the test
// fails with "Could not find --stage-* token", which is the right reason.

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b]: [number, number, number] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const linearize = (v: number): number => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

function contrastRatio(hsl1: [number, number, number], hsl2: [number, number, number]): number {
  const l1 = relativeLuminance(hslToRgb(...hsl1));
  const l2 = relativeLuminance(hslToRgb(...hsl2));
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function readToken(css: string, name: string): [number, number, number] {
  // e.g. "--stage-learning: 22 85% 36%;"
  const match = css.match(new RegExp(`--${name}:\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%\\s*;`));
  if (!match) throw new Error(`Could not find --${name} token in src/index.css`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

describe('SRS stage badge tokens meet WCAG 4.5:1 text contrast (issue #227)', () => {
  const css = readFileSync(resolve(__dirname, 'index.css'), 'utf-8');

  const pairs: Array<[string, string]> = [
    ['stage-learning', 'stage-learning-foreground'],
    ['stage-reviewing', 'stage-reviewing-foreground'],
    ['stage-mastered', 'stage-mastered-foreground'],
  ];

  it.each(pairs)('%s / %s clears 4.5:1', (bgName, fgName) => {
    const bg = readToken(css, bgName);
    const fg = readToken(css, fgName);
    const ratio = contrastRatio(bg, fg);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});
