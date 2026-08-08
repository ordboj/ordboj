import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Regression guard for issue #115 / PR #203 ("Remove dead dependencies,
// unused shadcn primitives and the second toast system"). devops owns
// package.json, package-lock.json and src/components/ui/**-the-32-deletions;
// this suite only reads those files, never edits them. If a future scaffold
// regeneration or a careless `npm install` reintroduces any of this dead
// weight, this must fail loudly rather than only being caught by someone
// eyeballing a diff or a bundle-size regression weeks later.

const repoRoot = resolve(__dirname, '../..');
const uiDir = resolve(repoRoot, 'src/components/ui');

function readJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(resolve(repoRoot, relativePath), 'utf-8'));
}

// --- 1. The 32 unused shadcn primitives are gone -------------------------

const deletedPrimitives = [
  'accordion',
  'alert-dialog',
  'alert',
  'aspect-ratio',
  'avatar',
  'breadcrumb',
  'calendar',
  'carousel',
  'chart',
  'collapsible',
  'command',
  'context-menu',
  'drawer',
  'dropdown-menu',
  'form',
  'hover-card',
  'input-otp',
  'menubar',
  'navigation-menu',
  'pagination',
  'popover',
  'radio-group',
  'resizable',
  'separator',
  'sheet',
  'sidebar',
  'skeleton',
  'slider',
  'tabs',
  'textarea',
  'toggle-group',
  'toggle',
];

describe('issue #115 - 32 unused shadcn/ui primitives deleted', () => {
  it.each(deletedPrimitives)('src/components/ui/%s.tsx no longer exists', (name) => {
    expect(existsSync(resolve(uiDir, `${name}.tsx`))).toBe(false);
  });
});

// --- 2. The second (Radix) toast system is gone ---------------------------

describe('issue #115 - Radix toast system removed', () => {
  it.each(['toast.tsx', 'toaster.tsx', 'use-toast.ts'])(
    'src/components/ui/%s no longer exists',
    (file) => {
      expect(existsSync(resolve(uiDir, file))).toBe(false);
    },
  );
});

// --- 3. Dead standalone files removed -------------------------------------

describe('issue #115 - dead standalone files removed', () => {
  it('src/App.css no longer exists', () => {
    expect(existsSync(resolve(repoRoot, 'src/App.css'))).toBe(false);
  });

  it('src/hooks/use-toast.ts no longer exists', () => {
    expect(existsSync(resolve(repoRoot, 'src/hooks/use-toast.ts'))).toBe(false);
  });

  it('src/hooks/use-mobile.tsx no longer exists', () => {
    expect(existsSync(resolve(repoRoot, 'src/hooks/use-mobile.tsx'))).toBe(false);
  });
});

// --- 4. The 29 dead dependencies are gone from package.json --------------

// Asserting absence of exactly the removed set (rather than exact key
// equality against a full census) means this test doesn't need editing
// every time an unrelated dependency is legitimately added later - it only
// fails if one of #115's specific removals is ever reintroduced, and it
// still fails hard against the pre-#115 package.json.
const removedDependencies = [
  '@hookform/resolvers',
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
  '@radix-ui/react-toast',
  '@radix-ui/react-toggle',
  '@radix-ui/react-toggle-group',
  '@tanstack/react-query',
  'cmdk',
  'date-fns',
  'embla-carousel-react',
  'input-otp',
  'react-day-picker',
  'react-hook-form',
  'react-resizable-panels',
  'recharts',
  'vaul',
];

describe('issue #115 - dead package.json "dependencies" removed', () => {
  const pkg = readJson('package.json') as { dependencies: Record<string, string> };

  it.each(removedDependencies)('"%s" is not a dependency', (name) => {
    expect(pkg.dependencies).not.toHaveProperty(name);
  });

  it('zod is kept (explicitly required by the issue)', () => {
    expect(pkg.dependencies).toHaveProperty('zod');
  });
});

// --- 5. package-lock.json actually regenerated, not just package.json edited

describe('issue #115 - package-lock.json regenerated to match package.json', () => {
  const lockText = readFileSync(resolve(repoRoot, 'package-lock.json'), 'utf-8');

  it.each([
    '"node_modules/@tanstack/react-query"',
    '"node_modules/@tanstack/query-core"',
    '"node_modules/recharts"',
    '"node_modules/react-hook-form"',
    '"node_modules/@radix-ui/react-toast"',
    '"node_modules/cmdk"',
    '"node_modules/vaul"',
    '"node_modules/date-fns"',
  ])('lockfile has no resolved package entry for %s', (needle) => {
    expect(lockText).not.toContain(needle);
  });
});

// --- 6. App.tsx's provider tree matches the trimmed dependency set --------

describe('issue #115 - App.tsx no longer wires the deleted providers', () => {
  const appSource = readFileSync(resolve(repoRoot, 'src/App.tsx'), 'utf-8');

  it('does not import the deleted Radix Toaster', () => {
    expect(appSource).not.toMatch(/from ['"]@\/components\/ui\/toaster['"]/);
    expect(appSource).not.toMatch(/<Toaster\s*\/>/);
  });

  it('does not import or construct a react-query QueryClient', () => {
    expect(appSource).not.toMatch(/@tanstack\/react-query/);
    expect(appSource).not.toMatch(/QueryClientProvider/);
    expect(appSource).not.toMatch(/new QueryClient\(/);
  });
});
