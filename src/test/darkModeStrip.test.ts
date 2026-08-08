import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

// Regression guard for issue #140 / PR #160.
//
// product-manager's binding decision (docs/product/2026-08-08-uiux-audit-
// product-position.md, section 3.11) was to STRIP the unreachable dark-mode
// CSS rather than ship a toggle. That decision has two failure modes this
// suite exists to catch, both silent (no runtime error, no visual diff in
// the only theme that ships):
//
//   1. The dead `.dark { ... }` CSS variable block or `darkMode` Tailwind
//      config creeps back in (e.g. a future shadcn/ui regen, a careless
//      merge) with still no provider/toggle behind it -- dead code again.
//   2. Someone starts wiring `dark:` variants or a next-themes provider
//      into app code (pages/components, not the generated ui/ primitives)
//      WITHOUT also restoring the `.dark` CSS variables and `darkMode`
//      config -- a toggle that silently does nothing, which is worse than
//      no toggle because it looks like it works.
//
// This is a static-string/content check, not a live-DOM check: jsdom does
// not run Tailwind's build step or apply real CSS cascade rules, so a
// behavioral assertion here (e.g. "background is dark when class=dark") is
// impossible to make honestly. Reading the source files is the correct
// boundary for a config/dead-code regression like this one.
const repoRoot = resolve(__dirname, '../..');
const indexCssPath = resolve(repoRoot, 'src/index.css');
const tailwindConfigPath = resolve(repoRoot, 'tailwind.config.ts');

function listFilesRecursive(dir: string, predicate: (path: string) => boolean): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...listFilesRecursive(full, predicate));
    } else if (predicate(full)) {
      out.push(full);
    }
  }
  return out;
}

describe('dark mode: stripped, not partially wired (issue #140 / PR #160)', () => {
  it('src/index.css has no .dark selector block', () => {
    const css = readFileSync(indexCssPath, 'utf-8');
    // Match a `.dark` rule the way it would actually appear as a CSS
    // selector (word boundary before/after, followed by `{`), not merely
    // the substring "dark" appearing anywhere (e.g. in a comment).
    expect(css).not.toMatch(/(^|[\s,}])\.dark\s*\{/);
  });

  it('tailwind.config.ts declares no darkMode strategy', () => {
    const config = readFileSync(tailwindConfigPath, 'utf-8');
    expect(config).not.toMatch(/darkMode\s*:/);
  });

  it('no page or top-level component imports next-themes', () => {
    const dirs = [resolve(repoRoot, 'src/pages'), resolve(repoRoot, 'src/components')];
    const files = dirs.flatMap((dir) =>
      listFilesRecursive(dir, (p) => {
        // Generated shadcn/ui primitives (src/components/ui/**) are
        // explicitly out of scope per PR #160's description; they are not
        // reachable by the app and nobody edits them in place.
        if (p.includes(`${resolve(repoRoot, 'src/components/ui')}`)) return false;
        return p.endsWith('.ts') || p.endsWith('.tsx');
      }),
    );
    const offenders = files.filter((f) => readFileSync(f, 'utf-8').includes('next-themes'));
    expect(offenders).toEqual([]);
  });

  it('no page or top-level component uses a dark: Tailwind variant', () => {
    const dirs = [resolve(repoRoot, 'src/pages'), resolve(repoRoot, 'src/components')];
    const files = dirs.flatMap((dir) =>
      listFilesRecursive(dir, (p) => {
        if (p.includes(`${resolve(repoRoot, 'src/components/ui')}`)) return false;
        return p.endsWith('.tsx');
      }),
    );
    const offenders = files.filter((f) => /\bdark:/.test(readFileSync(f, 'utf-8')));
    expect(offenders).toEqual([]);
  });

  it('no ThemeProvider is wired up anywhere in src/', () => {
    // Excludes src/test/** (this suite itself lives there and necessarily
    // mentions "ThemeProvider" in prose/regex) -- production/app code only.
    const files = listFilesRecursive(resolve(repoRoot, 'src'), (p) => {
      if (p.includes(resolve(repoRoot, 'src/test'))) return false;
      if (p.endsWith('.test.ts') || p.endsWith('.test.tsx')) return false;
      return p.endsWith('.ts') || p.endsWith('.tsx');
    });
    const offenders = files.filter((f) => /ThemeProvider/.test(readFileSync(f, 'utf-8')));
    expect(offenders).toEqual([]);
  });
});
