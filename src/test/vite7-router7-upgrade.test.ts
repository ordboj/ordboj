import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Regression suite for issue #119 (PR #161): react-router 7 upgrade, with
// React 19 explicitly deferred (React is still 18.x); the Tailwind 4
// deferral ended with the migration in epic #259 / issue #69, and the
// Tailwind block below now pins the post-migration state. These are
// static-manifest checks (package.json / package-lock.json /
// postcss.config.js), not node_modules introspection: node_modules
// reflects whatever was last
// `npm install`ed in this environment, but the manifests are the actual
// contract the PR changes and the one that regresses silently if someone
// reverts a version bump by hand. devops owns these files; qa only reads
// them here.
//
// react-router-dom's own MemoryRouterProps no longer accepting the old v6
// `future={{ v7_startTransition, v7_relativeSplatPath }}` opt-in flags is
// pinned by `npm run typecheck`, not here: restoring the pre-fix
// src/test/renderWithProviders.tsx against the v7 install fails with
// TS2322 ("Property 'future' does not exist on type
// '... & MemoryRouterProps'"), which is the real, non-vacuous regression
// signal for that half of the fix (an extra unknown prop on a React
// function component is silently ignored at runtime, so no Vitest
// assertion here could ever observe it going wrong).

const packageJsonPath = resolve(__dirname, '../../package.json');
const packageLockPath = resolve(__dirname, '../../package-lock.json');
const postcssConfigPath = resolve(__dirname, '../../postcss.config.js');

const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};
const packageLock = JSON.parse(readFileSync(packageLockPath, 'utf-8')) as {
  packages: Record<string, { version?: string }>;
};
const postcssConfig = readFileSync(postcssConfigPath, 'utf-8');

describe('react-router-dom upgraded to 7.x (issue #119)', () => {
  it('package.json pins react-router-dom to a 7.x range, not 6.x', () => {
    const declared = packageJson.dependencies['react-router-dom'];
    expect(declared, 'react-router-dom must stay a declared dependency').toBeDefined();
    expect(declared).toMatch(/^\^7\./);
    expect(declared).not.toMatch(/^\^6\./);
  });

  it('the installed/resolved react-router-dom in the lockfile is 7.x', () => {
    const resolved = packageLock.packages['node_modules/react-router-dom']?.version;
    expect(resolved, 'react-router-dom must be resolvable in the lockfile').toBeDefined();
    expect(resolved).toMatch(/^7\./);
  });

  // react-router 7 dropped the standalone @remix-run/router package that v6
  // depended on (its router core moved into react-router itself). A stale
  // partial upgrade (e.g. bumping the declared range without a real
  // `npm install`) would leave this entry in the lockfile.
  it('the lockfile no longer carries the v6-only @remix-run/router package', () => {
    expect(packageLock.packages['node_modules/@remix-run/router']).toBeUndefined();
  });
});

describe('caniuse-lite / browserslist data refreshed (issue #119)', () => {
  it('caniuse-lite in the lockfile is newer than the pre-upgrade pin (1.0.30001727)', () => {
    const version = packageLock.packages['node_modules/caniuse-lite']?.version;
    expect(version, 'caniuse-lite must be resolvable in the lockfile').toBeDefined();

    // caniuse-lite versions are date-coded as 1.0.<sequence>; compare the
    // sequence numerically rather than asserting an exact pinned string so
    // this doesn't need editing every time browserslist-update-db runs
    // again, while still catching "the refresh silently didn't happen".
    const sequence = Number(version!.replace(/^1\.0\.0*/, ''));
    const preUpgradeSequence = Number('1.0.30001727'.replace(/^1\.0\.0*/, ''));
    expect(sequence).toBeGreaterThan(preUpgradeSequence);
  });
});

describe('Tailwind 4 active via @tailwindcss/postcss (issue #267)', () => {
  // The Tailwind 4 upgrade that issue #119 deferred landed via epic #259 /
  // issue #69 (see postcss.config.js). This pins the current, post-migration
  // truth instead of the old deferral: v4's PostCSS plugin is
  // @tailwindcss/postcss, declared as a real dependency and wired into the
  // PostCSS pipeline.
  it('package.json declares @tailwindcss/postcss on a 4.x range', () => {
    const declared = packageJson.devDependencies['@tailwindcss/postcss'];
    expect(declared, '@tailwindcss/postcss must be a declared dependency').toBeDefined();
    expect(declared).toMatch(/^\^4\./);
  });

  it('postcss.config.js wires up @tailwindcss/postcss as a plugin, not just in a comment', () => {
    // A bare /@tailwindcss\/postcss/ match is vacuous: the file's own header
    // comment names the package, so reverting only the plugin entry back to
    // `tailwindcss: {}` would keep that assertion green. Anchor on the
    // plugin-key shape instead.
    expect(postcssConfig).toMatch(/^\s*['"]@tailwindcss\/postcss['"]\s*:/m);
  });

  it('postcss.config.js no longer registers the legacy tailwindcss v3 plugin entry', () => {
    expect(postcssConfig).not.toMatch(/^\s*['"]?tailwindcss['"]?\s*:/m);
  });
});
