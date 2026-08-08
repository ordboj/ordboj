import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';

// Regression guard for issue #140 / PR #160.
//
// Binding decision: docs/product/2026-08-08-dark-mode-decision.md. Strip the
// unreachable `.dark` palette (C3); KEEP `darkMode: 'class'` in the Tailwind
// config (C1) so the config line stays a no-op tripwire instead of a bug.
// Deleting `darkMode` entirely flips Tailwind v3 to its `media` default,
// which activates every `dark:` utility (e.g. the shadcn-generated
// `src/components/ui/alert.tsx`) for OS-dark users with no palette behind
// it -- that is the actual regression, and the only way to catch it
// honestly is to compile the real CSS and check the emitted rule, not to
// grep app source (jsdom doesn't run the Tailwind build, and a source-scoped
// grep excluding src/components/ui/** provably passes on unfixed code too,
// since it's ui/** that carries the only authored `dark:` utility).
const repoRoot = resolve(__dirname, '../..');
const indexCssPath = resolve(repoRoot, 'src/index.css');
const tailwindConfigPath = resolve(repoRoot, 'tailwind.config.ts');

describe('dark mode: stripped palette, pinned class strategy (issue #140 / PR #160)', () => {
  it('src/index.css has no .dark selector block', () => {
    const css = readFileSync(indexCssPath, 'utf-8');
    // Match a `.dark` rule the way it would actually appear as a CSS
    // selector (word boundary before/after, followed by `{`), not merely
    // the substring "dark" appearing anywhere (e.g. in a comment).
    expect(css).not.toMatch(/(^|[\s,}])\.dark\s*\{/);
  });

  it('tailwind.config.ts pins the class dark-mode strategy (C1)', () => {
    const config = readFileSync(tailwindConfigPath, 'utf-8');
    expect(config).toMatch(/darkMode\s*:\s*(['"]class['"]|\[\s*['"]class['"]\s*\])/);
  });

  it('the compiled CSS has no @media (prefers-color-scheme: dark) rule', async () => {
    // This is the honest version of "no dark: variant reaches OS-dark
    // users": it runs the real Tailwind/PostCSS pipeline (same plugin, same
    // tailwind.config.ts) over src/index.css and inspects the output, which
    // is exactly what breaks if C1's `darkMode: 'class'` line is ever
    // deleted again -- Tailwind falls back to compiling every `dark:`
    // utility (present in generated src/components/ui/** primitives such as
    // alert.tsx) into a media-query rule instead of a class selector.
    const css = readFileSync(indexCssPath, 'utf-8');
    const result = await postcss([tailwindcss(tailwindConfigPath)]).process(css, {
      from: indexCssPath,
    });
    expect(result.css).not.toMatch(/@media\s*\(prefers-color-scheme:\s*dark\)/);
  });
});
