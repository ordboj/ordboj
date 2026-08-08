import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, sep } from 'node:path';
import { conjugationItemId } from '@/lib/itemIds';
import type { Form } from '@/lib/verbs';

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    if (!/\.tsx?$/.test(entry)) return [];
    if (/\.test\.tsx?$/.test(entry)) return [];
    return [full];
  });
}

describe('conjugationItemId', () => {
  it('produces the exact id format already in learners localStorage', () => {
    // These literals are what stored progress keys look like today. If this
    // assertion has to change, every existing key is orphaned and the change
    // needs a storage migration, not a new expectation.
    expect(conjugationItemId('1', 'presens')).toBe('1-presens');
    expect(conjugationItemId('50', 'imperativ')).toBe('50-imperativ');
  });

  it('covers every scheduled form', () => {
    const forms: Form[] = ['presens', 'preteritum', 'supinum', 'imperativ'];
    expect(forms.map((form) => conjugationItemId('7', form))).toEqual([
      '7-presens',
      '7-preteritum',
      '7-supinum',
      '7-imperativ',
    ]);
  });

  it('is the only place production code builds a conjugation item id', () => {
    // Refuse-to-merge rule from the partikelverb spec: "no second copy of an
    // id scheme in a page component". The id is a storage primary key, and a
    // divergent copy fails by silently reading zero progress rather than by
    // throwing, so the duplication has to be caught at review time.
    const inlineIdTemplate = /`\$\{[\w.]+\}-\$\{[\w.]+\}`/;
    const offenders = sourceFiles(srcRoot)
      .filter((file) => relative(srcRoot, file) !== join('lib', 'itemIds.ts'))
      .filter((file) => inlineIdTemplate.test(readFileSync(file, 'utf-8')))
      .map((file) => relative(srcRoot, file).split(sep).join('/'));

    expect(offenders).toEqual([]);
  });
});
