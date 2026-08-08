import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Regression guard for issue #148 ("Decide browser support target after
// Vite 8 default bump"). vite.config.ts is devops-owned; this test only
// reads it, never edits it. Vite 8 changed build.target's *default* to
// 'baseline-widely-available' - a machine-generated, rolling target that
// narrows (widens the browsers it drops) on every future Vite bump with no
// review checkpoint. #148 pinned an explicit, fixed array reproducing the
// pre-Vite-8 baseline instead. If a future scaffold regeneration or a
// careless config rewrite drops the pin, this must fail loudly rather than
// only being caught by someone eyeballing a diff or an unreviewed shrink in
// supported browsers reaching production.
//
// This is a static-source check, not a live-build check: it reads the
// config file's text rather than importing/executing it, since vite.config
// exports a function meant to run under Vite's own loader (import.meta.dirname
// resolution, etc.), not vitest's. `npm run build`'s own output is what
// proves the pinned target is actually applied to the production bundle.
const viteConfigPath = resolve(__dirname, '../../vite.config.ts');
const source = readFileSync(viteConfigPath, 'utf-8');

describe('vite.config.ts build.target (issue #148)', () => {
  it('pins an explicit build.target, not the Vite 8 default', () => {
    expect(source).toMatch(/build:\s*\{\s*target:/);
  });

  it('pins the exact pre-Vite-8 baseline array', () => {
    const inner = source.match(/target:\s*\[([^\]]*)\]/)?.[1];
    expect(inner, 'build.target array must be present').toBeDefined();
    const targets = (inner ?? '').split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, ''));
    expect(targets).toEqual(['es2020', 'edge88', 'firefox78', 'chrome87', 'safari14']);
  });
});
