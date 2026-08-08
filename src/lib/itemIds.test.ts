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
    // These literals are what stored progress keys look like today: an
    // infinitive, not a table position (issue #8 -- a legacy positional ref
    // like '1' is resolved against VERB_DATA before the id is built; see
    // src/data/verbData.orderPin.test.ts, which pins '1' -> "vara"). If this
    // assertion has to change, every existing key is orphaned and the change
    // needs a storage migration, not a new expectation. The v2 -> v3
    // migration that made this change (src/hooks/useSrsProgress.ts) shipped
    // in this PR; the next change to this format needs the same treatment.
    expect(conjugationItemId('1', 'presens')).toBe('vara-presens');
    expect(conjugationItemId('50', 'imperativ')).toBe('höra-imperativ');
  });

  it('covers every scheduled form', () => {
    const forms: Form[] = ['presens', 'preteritum', 'supinum', 'imperativ'];
    expect(forms.map((form) => conjugationItemId('7', form))).toEqual([
      'komma-presens',
      'komma-preteritum',
      'komma-supinum',
      'komma-imperativ',
    ]);
  });

  it('resolves a legacy positional ref to the same id as the infinitive itself', () => {
    // The whole point of the legacy resolution branch: a caller that still
    // has Verb.id (positional) and one that already has the infinitive must
    // land on the exact same storage key, or progress silently splits in two.
    expect(conjugationItemId('komma', 'presens')).toBe(conjugationItemId('7', 'presens'));
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
