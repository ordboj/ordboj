import { describe, it, expect } from 'vitest';
import { VERB_DATA } from '@/data/verbData';
import { getVerbs } from '@/lib/verbs';

// SRS item ids are `${infinitive}-${form}` (src/lib/verbs.ts, issue #53):
// a verb's identity in every learner's localStorage is its infinitive, not
// its position in VERB_DATA. Before that migration, ids were positional
// (`${String(index + 1)}-${form}`), so reordering the array silently
// repointed every stored key from the change point onward. The infinitive
// scheme fixes that class of bug, but it depends on every infinitive in the
// table being unique (see "pins no infinitive twice" below) - a duplicate
// would make two verbs share one id and silently merge their progress. This
// table is still pinned as a literal snapshot so any change to VERB_DATA's
// contents is a deliberate, reviewable edit of this file rather than an
// accident in that one.
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
  'slå', // 57
  'dra', // 58
  'köra', // 59
  'arbeta', // 60
  'hänga', // 61
  'sitta', // 62
  'falla', // 63
  'kasta', // 64
  'bryta', // 65
  'åka', // 66
  'plocka', // 67
  'titta', // 68
  'växa', // 69
  'dela', // 70
  'dyka', // 71
  'hjälpa', // 72
  'låna', // 73
  'spela', // 74
  'koppla', // 75
  'lämna', // 76
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
    // Issue #53: the id is the infinitive itself, not a 1-based position.
    return getVerbs().then((verbs) => {
      expect(verbs.map((verb) => [verb.id, verb.infinitive])).toEqual(
        PINNED_INFINITIVES.map((infinitive) => [infinitive, infinitive]),
      );
    });
  });

  it('pins no infinitive twice, so an id is never ambiguous', () => {
    expect(new Set(PINNED_INFINITIVES).size).toBe(PINNED_INFINITIVES.length);
  });
});
