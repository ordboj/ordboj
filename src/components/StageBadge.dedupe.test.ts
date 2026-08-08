import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Issue #227 AC #1: "Single shared stage-badge helper replaces both
// duplicates." Before the fix, VerbDetailsModal.tsx and Progress.tsx each
// defined their own inline `getStageBadge` function (identical logic,
// different className shape). This test reads the two call-site source
// files directly and asserts each imports the shared helper from
// StageBadge.tsx and no longer defines its own copy. Against the pre-fix
// sources (each has its own `const getStageBadge = (stage: number) => {`)
// the "does not define its own" assertion fails, so this is non-vacuous.
describe('getStageBadge is not duplicated across call sites (issue #227)', () => {
  const localDefinitionPattern = /const\s+getStageBadge\s*=\s*\(/;
  const sharedImportPattern =
    /import\s*\{[^}]*getStageBadge[^}]*\}\s*from\s*['"]@\/components\/StageBadge['"]/;

  it('VerbDetailsModal.tsx imports the shared helper and defines no local copy', () => {
    const source = readFileSync(resolve(__dirname, 'VerbDetailsModal.tsx'), 'utf-8');
    expect(source).toMatch(sharedImportPattern);
    expect(source).not.toMatch(localDefinitionPattern);
  });

  it('Progress.tsx imports the shared helper and defines no local copy', () => {
    const source = readFileSync(resolve(__dirname, '../pages/Progress.tsx'), 'utf-8');
    expect(source).toMatch(sharedImportPattern);
    expect(source).not.toMatch(localDefinitionPattern);
  });
});
