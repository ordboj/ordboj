import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Pins the tsconfig acceptance criteria of issue #105 ("Enable TypeScript
// strict mode, noUncheckedIndexedAccess and React StrictMode"). Both files
// are JSONC (they contain comments), so JSON.parse would choke on them —
// targeted text assertions on the raw source are used instead.
const __dirname = dirname(fileURLToPath(import.meta.url));
const appConfig = readFileSync(resolve(__dirname, '../../tsconfig.app.json'), 'utf-8');
const rootConfig = readFileSync(resolve(__dirname, '../../tsconfig.json'), 'utf-8');

describe('tsconfig.app.json - strict mode (#105)', () => {
  it('turns strict mode on', () => {
    expect(appConfig).toMatch(/"strict"\s*:\s*true/);
  });

  it('turns noUncheckedIndexedAccess on', () => {
    expect(appConfig).toMatch(/"noUncheckedIndexedAccess"\s*:\s*true/);
  });
});

describe('tsconfig.json - dead root compilerOptions removed (#105)', () => {
  // Pre-#105, the root tsconfig.json's compilerOptions block duplicated
  // options that only tsconfig.app.json (and tsconfig.node.json) can
  // meaningfully apply, silently overriding the app config's own settings
  // for anyone reading just the root file. "files": [] plus "references" is
  // the standard TS project-references shell pattern (tells tsc to build
  // only the referenced sub-projects) and is intentionally kept — it is not
  // one of the dead nested compilerOptions.
  it('no longer sets strictNullChecks at the root', () => {
    expect(rootConfig).not.toMatch(/strictNullChecks/);
  });

  it('no longer sets noImplicitAny at the root', () => {
    expect(rootConfig).not.toMatch(/noImplicitAny/);
  });

  it('no longer sets allowJs at the root', () => {
    expect(rootConfig).not.toMatch(/allowJs/);
  });

  it('still uses the project-references shell pattern (files: [] + references), unrelated to the dead-options cleanup', () => {
    expect(rootConfig).toMatch(/"files"\s*:\s*\[\s*\]/);
    expect(rootConfig).toMatch(/"references"\s*:/);
  });
});
