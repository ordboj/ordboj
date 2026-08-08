import { describe, it, expect } from 'vitest';
import { VERB_DATA } from '@/data/verbData';
import { getVerbs } from '@/lib/verbs';

// SRS item ids are `${String(index + 1)}-${form}` (src/lib/verbs.ts:22), so
// a verb's identity in every learner's localStorage is its *position* in
// VERB_DATA and nothing else. Reordering the array, inserting a row in the
// middle, or deleting one silently repoints every stored key from that
// position onward: a learner's `bygga` history becomes their `börja`
// history, with no error and no way to notice. Progress is irreplaceable
// (CLAUDE.md), so the mapping is pinned here as a literal table and any
// change to it has to be a deliberate edit of this file rather than an
// accident in that one.
//
// This is prework for the stable-id migration (v2 -> v3) tracked separately:
// the same snapshot is the lookup table that migration needs to rewrite
// index-derived keys into slug-derived ones. Until that ships, VERB_DATA
// order is frozen and this test is the freeze.
//
// Appending a new verb at the END is the only safe growth, and it requires
// adding its row to the bottom of this table in the same commit.
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
  it('has exactly the pinned number of rows', () => {
    // Deletion or insertion anywhere fails here first, with a count that
    // says which happened.
    expect(VERB_DATA.length).toBe(PINNED_INFINITIVES.length);
  });

  it('maps every index to the pinned infinitive', () => {
    // Compared as whole arrays so a reorder reports the full before/after
    // rather than only the first row that moved.
    expect(VERB_DATA.map((verb) => verb.infinitive)).toEqual([...PINNED_INFINITIVES]);
  });

  it.each(PINNED_INFINITIVES.map((infinitive, index) => ({ index, infinitive })))(
    'index $index is still $infinitive',
    ({ index, infinitive }) => {
      expect(VERB_DATA[index]?.infinitive).toBe(infinitive);
    },
  );

  it('derives the same verb ids the SRS store already holds', () => {
    // The pin only protects learner progress if it protects the *id*, so
    // assert against the id-producing path rather than the raw array.
    return getVerbs().then((verbs) => {
      expect(verbs.map((verb) => [verb.id, verb.infinitive])).toEqual(
        PINNED_INFINITIVES.map((infinitive, index) => [String(index + 1), infinitive]),
      );
    });
  });

  it('pins no infinitive twice, so an id is never ambiguous', () => {
    expect(new Set(PINNED_INFINITIVES).size).toBe(PINNED_INFINITIVES.length);
  });
});
