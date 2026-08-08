import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Regression guard for issue #115 / PR #169 ("Remove dead dependencies,
// unused shadcn primitives and the second toast system").
//
// package.json (devops-owned) and src/App.tsx (staff-engineer-owned) are
// only *read* here, never edited - same pattern as csp-meta.test.ts reading
// index.html. src/components/ui/** is generated shadcn/ui; this only checks
// file existence.
//
// Without this, a future scaffold regeneration, a careless `npx shadcn add`,
// or a revert could silently reintroduce the 33 files and 27 packages this
// PR deleted, and nobody would notice until `du -sh node_modules` or a
// bundle-size regression months later - exactly the kind of drift the
// acceptance criteria's "grep evidence for every deletion" was trying to
// make permanent, not just a one-time PR description.

const repoRoot = resolve(__dirname, '../..');

function readPackageJson(): { dependencies: Record<string, string> } {
  const raw = readFileSync(resolve(repoRoot, 'package.json'), 'utf-8');
  return JSON.parse(raw);
}

// The 32 shadcn/ui primitives + the orphaned ui/use-toast.ts re-export shim
// that PR #169's first commit (5c8411c) deleted. Exact list taken from the
// PR's own file list (`gh pr diff 169 --name-only`).
const deletedUiFiles = [
  'accordion.tsx',
  'alert-dialog.tsx',
  'alert.tsx',
  'aspect-ratio.tsx',
  'avatar.tsx',
  'breadcrumb.tsx',
  'calendar.tsx',
  'carousel.tsx',
  'chart.tsx',
  'collapsible.tsx',
  'command.tsx',
  'context-menu.tsx',
  'drawer.tsx',
  'dropdown-menu.tsx',
  'form.tsx',
  'hover-card.tsx',
  'input-otp.tsx',
  'menubar.tsx',
  'navigation-menu.tsx',
  'pagination.tsx',
  'popover.tsx',
  'radio-group.tsx',
  'resizable.tsx',
  'separator.tsx',
  'sheet.tsx',
  'sidebar.tsx',
  'skeleton.tsx',
  'slider.tsx',
  'tabs.tsx',
  'textarea.tsx',
  'toggle-group.tsx',
  'toggle.tsx',
  'use-toast.ts',
];

// shadcn/ui primitives that ARE consumed by src/pages/** or src/components/*
// (non-ui) and must survive any cleanup pass. Grep evidence: each of these
// is imported outside src/components/ui/** as of this PR.
const keptUiFiles = [
  'button.tsx',
  'card.tsx',
  'input.tsx',
  'label.tsx',
  'badge.tsx',
  'checkbox.tsx',
  'dialog.tsx',
  'progress.tsx',
  'scroll-area.tsx',
  'select.tsx',
  'switch.tsx',
  'table.tsx',
  'tooltip.tsx',
  'sonner.tsx',
];

// npm packages the ticket named explicitly as dead (only the 32 deleted
// primitives imported them) - `zod` is deliberately excluded, it must stay.
const removedNpmPackages = [
  'recharts',
  'embla-carousel-react',
  'input-otp',
  'react-day-picker',
  'react-resizable-panels',
  'cmdk',
  'vaul',
  'react-hook-form',
  '@hookform/resolvers',
  'date-fns',
];

// The @radix-ui/* packages that only the deleted primitives depended on
// (package.json diff, merge-base 7f30106 -> HEAD).
const removedRadixPackages = [
  '@radix-ui/react-accordion',
  '@radix-ui/react-alert-dialog',
  '@radix-ui/react-aspect-ratio',
  '@radix-ui/react-avatar',
  '@radix-ui/react-collapsible',
  '@radix-ui/react-context-menu',
  '@radix-ui/react-dropdown-menu',
  '@radix-ui/react-hover-card',
  '@radix-ui/react-menubar',
  '@radix-ui/react-navigation-menu',
  '@radix-ui/react-popover',
  '@radix-ui/react-radio-group',
  '@radix-ui/react-separator',
  '@radix-ui/react-slider',
  '@radix-ui/react-tabs',
  '@radix-ui/react-toggle',
  '@radix-ui/react-toggle-group',
];

describe('issue #115: dead shadcn/ui primitives are deleted', () => {
  it.each(deletedUiFiles)('src/components/ui/%s no longer exists', (file) => {
    const path = resolve(repoRoot, 'src/components/ui', file);
    expect(existsSync(path), `${path} should have been deleted by PR #169`).toBe(false);
  });

  it.each(keptUiFiles)('src/components/ui/%s (still used outside ui/**) still exists', (file) => {
    const path = resolve(repoRoot, 'src/components/ui', file);
    expect(
      existsSync(path),
      `${path} is still imported by a page/component and must not be deleted`,
    ).toBe(true);
  });
});

describe('issue #115: dead npm dependencies are removed from package.json', () => {
  const pkg = readPackageJson();

  it.each(removedNpmPackages)('"%s" is not a dependency', (name) => {
    expect(pkg.dependencies, `${name} should have been removed`).not.toHaveProperty(name);
  });

  it.each(removedRadixPackages)('"%s" is not a dependency', (name) => {
    expect(pkg.dependencies, `${name} should have been removed`).not.toHaveProperty(name);
  });

  it('zod is kept (needed by upcoming store-validation work per issue #115)', () => {
    expect(pkg.dependencies).toHaveProperty('zod');
  });

  it('@radix-ui/react-dialog is kept (dialog.tsx is still used by VerbDetailsModal)', () => {
    expect(pkg.dependencies).toHaveProperty('@radix-ui/react-dialog');
  });
});

// Regression test for commit 988bacf ("remove dead QueryClientProvider and
// duplicate Radix Toaster"): before that commit, App.tsx wrapped every route
// in an unused <QueryClientProvider> and rendered a second, silently-dead
// <Toaster /> (Radix ui/toaster.tsx) alongside the live Sonner toaster. A
// regression here (e.g. a bad merge reintroducing either import) would ship
// a react-query context nothing reads and a second toast portal nothing
// calls - dead weight a learner never sees but every build pays for.
describe('issue #115 / commit 988bacf: App.tsx duplicate toaster + dead query provider removed', () => {
  const appTsxSource = readFileSync(resolve(repoRoot, 'src/App.tsx'), 'utf-8');

  it('does not import QueryClientProvider from @tanstack/react-query', () => {
    expect(appTsxSource).not.toMatch(/@tanstack\/react-query/);
  });

  it('does not import the Radix ui/toaster', () => {
    expect(appTsxSource).not.toMatch(/['"]@\/components\/ui\/toaster['"]/);
  });

  it('still renders the live Sonner toaster', () => {
    expect(appTsxSource).toMatch(/['"]@\/components\/ui\/sonner['"]/);
    expect(appTsxSource).toMatch(/<Sonner\s*\/>/);
  });
});
