import { describe, it, expect } from 'vitest';
import { VERB_DATA } from '@/data/verbData';
import { LEGACY_VERB_INFINITIVES } from '@/hooks/useSrsProgress';

// SRS item ids are infinitive-based as of issue #8
// (src/lib/itemIds.ts, `conjugationItemId`): a verb's identity in every
// learner's localStorage is its infinitive, not its position in VERB_DATA.
// PINNED_INFINITIVES below is no longer live protection for that identity --
// it is the historical index -> infinitive snapshot that the v2 -> v3
// migration (src/hooks/useSrsProgress.ts, `LEGACY_VERB_INFINITIVES`) reads
// to translate a pre-#8 store's position-derived keys. That migration's
// correctness depends on this exact list matching what every released build
// before #8 could have written, so PINNED_INFINITIVES must never be edited
// or reordered -- not even to fix a typo -- regardless of how VERB_DATA
// itself changes from here on.
//
// One rule, stated once: PINNED_INFINITIVES is a frozen historical record
// for the v2 -> v3 migration and is never edited. VERB_DATA may grow,
// reorder or insert freely -- that is safe under the v3 (infinitive-keyed)
// scheme and only ever mattered for the position-derived v2 one. The only
// change to VERB_DATA this file forbids is deleting a row PINNED_INFINITIVES
// names, because that would silently orphan that verb's legacy progress at
// migration time. The tests below protect exactly that (the superset check),
// that no live infinitive collides with another (conjugationItemId would
// become ambiguous), that PINNED_INFINITIVES itself has no internal
// duplicate, and that the production copy of this list
// (`LEGACY_VERB_INFINITIVES` in src/hooks/useSrsProgress.ts) has not drifted
// from it.
const PINNED_INFINITIVES: readonly string[] = [
  'vara', // 1
  'ha', // 2
  'kunna', // 3
  'unna', // 4
  'få', // 5
  'bli', // 6
  'komma', // 7
  'vilja', // 8
  'göra', // 9
  'finna', // 10
  'ta', // 11
  'se', // 12
  'gå', // 13
  'säga', // 14
  'äga', // 15
  'betyda', // 16
  'ge', // 17
  'skriva', // 18
  'te sig', // 19
  'riva', // 20
  'börja', // 21
  'tro', // 22
  'tycka', // 23
  'veta', // 24
  'försöka', // 25
  'behöva', // 26
  'känna', // 27
  'läsa', // 28
  'ro', // 29
  'låta', // 30
  'stå', // 31
  'visa', // 32
  'använda', // 33
  'vända', // 34
  'hålla', // 35
  'tänka', // 36
  'söka', // 37
  'ligga', // 38
  'lägga', // 39
  'anse', // 40
  'öva', // 41
  'handla', // 42
  'öka', // 43
  'skapa', // 44
  'kapa', // 45
  'gälla', // 46
  'verka', // 47
  'tala', // 48
  'bära', // 49
  'höra', // 50
  'stänga', // 51
  'sätta', // 52
  'stiga', // 53
  'hälsa', // 54
  'bygga', // 55
  'ställa', // 56
];

describe('VERB_DATA order pin', () => {
  it('never drops a verb the migration snapshot depends on (VERB_DATA is a superset of PINNED_INFINITIVES)', () => {
    // A pre-#8 store's positional keys can only be migrated correctly if
    // every infinitive the snapshot names still exists in VERB_DATA today.
    // Growth (append, insert, reorder) is fine under the v3 scheme; deleting
    // one of these rows is not -- it would orphan that verb's legacy
    // progress at migration time with no error.
    const liveInfinitives = new Set(VERB_DATA.map((verb) => verb.infinitive));
    const missing = PINNED_INFINITIVES.filter((infinitive) => !liveInfinitives.has(infinitive));
    expect(missing).toEqual([]);
  });

  it('never lets two live verbs share an infinitive, so conjugationItemId is never ambiguous', () => {
    // itemIds.ts builds the storage key from the infinitive alone; a
    // duplicate would make two different verbs' progress collide on one key.
    expect(new Set(VERB_DATA.map((verb) => verb.infinitive)).size).toBe(VERB_DATA.length);
  });

  it('pins no infinitive twice, so an id is never ambiguous', () => {
    expect(new Set(PINNED_INFINITIVES).size).toBe(PINNED_INFINITIVES.length);
  });

  it('keeps LEGACY_VERB_INFINITIVES (src/hooks/useSrsProgress.ts) byte-identical to PINNED_INFINITIVES', () => {
    // LEGACY_VERB_INFINITIVES is a copy of this exact list, kept inside
    // useSrsProgress.ts because production code must not import a qa-owned
    // test file. The v2 -> v3 migration reads that copy, not this one, to
    // translate a pre-#8 store's positional keys. The two are supposed to
    // be the same historical snapshot by construction; this test is the
    // only thing that would catch them drifting apart if either were ever
    // hand-edited (or one updated and the other forgotten) without the
    // other changing too.
    expect([...LEGACY_VERB_INFINITIVES]).toEqual([...PINNED_INFINITIVES]);
  });
});
