import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useSrsProgress } from '@/hooks/useSrsProgress';
import type { ConjugatedVerb, Verb } from '@/lib/verbs';

const STORAGE_KEY = 'swedish-verbs-srs-progress';

// This suite mocks the swedish-linguist-owned '@/lib/verbs' boundary so the
// SRS wiring (owned by srs-engine) can be tested against a small, known,
// deterministic verb set instead of the real ~50-verb table. The real table
// currently has every verb at cefr "A1" (see verbs.realdata.test.ts), which
// makes the cefrLevels filter untestable against real data.
//
// v3 (issue #53): ids are infinitive-derived, so the fixture ids mirror
// that (id === infinitive), matching the real '@/lib/verbs' contract.
const FIXTURE_VERBS: Verb[] = [
  { id: 'testa', infinitive: 'testa', cefr: 'A1' },
  { id: 'prova', infinitive: 'prova', cefr: 'B1' },
];

const FIXTURE_CONJUGATIONS: Record<string, ConjugatedVerb> = {
  testa: {
    id: 'testa',
    infinitive: 'testa',
    cefr: 'A1',
    presens: 'testar',
    preteritum: 'testade',
    supinum: 'testat',
    imperativ: 'testa',
  },
  prova: {
    id: 'prova',
    infinitive: 'prova',
    cefr: 'B1',
    presens: 'provar',
    preteritum: 'provade',
    supinum: 'provat',
    // "prova" has no attested imperativ in this fixture; the hook's
    // getDueItems must skip this form entirely.
    imperativ: '(not available)',
  },
};

vi.mock('@/lib/verbs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/verbs')>();
  return {
    ...actual,
    getVerbs: vi.fn(async () => FIXTURE_VERBS),
    conjugateVerb: vi.fn(async (infinitive: string) => {
      return (
        FIXTURE_CONJUGATIONS[infinitive] ?? {
          id: 'unknown',
          infinitive,
          presens: '(not available)',
          preteritum: '(not available)',
          supinum: '(not available)',
          imperativ: '(not available)',
        }
      );
    }),
  };
});

const FIXED_NOW = new Date('2026-01-01T00:00:00.000Z').getTime();

// Every form the hook would practice, across both fixture verbs, that IS
// available ("prova" has no imperativ). This is the full due set on a
// cold, sparse store: an absent key means "new, due now" (issue #53).
const ALL_DUE_ITEM_IDS = [
  'testa-presens',
  'testa-preteritum',
  'testa-supinum',
  'testa-imperativ',
  'prova-presens',
  'prova-preteritum',
  'prova-supinum',
];

beforeEach(() => {
  localStorage.clear();
  // Only fake Date: RTL's waitFor polls with real setTimeout/MutationObserver
  // internally, so faking timers wholesale would freeze that polling too.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('cold start (sparse storage, issue #53)', () => {
  it('starts with an empty state map when localStorage is empty: untouched items are not materialized', async () => {
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.srsStates).toEqual({});
  });

  it('still treats every available verb x form combination as due, via the absent-key contract', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const due = await result.current.getDueItems();
    expect(due.map((i) => i.itemId).sort()).toEqual(ALL_DUE_ITEM_IDS.slice().sort());
  });
});

describe('persistence - the irreplaceable-progress invariant', () => {
  it('writes state to the documented localStorage key and re-reads it verbatim on remount', async () => {
    const first = renderHook(() => useSrsProgress());
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));

    act(() => {
      first.result.current.recordAnswer('testa-presens', 5);
    });
    await waitFor(() =>
      expect(first.result.current.srsStates['testa-presens'].repetitions).toBe(1),
    );

    const stored = localStorage.getItem(STORAGE_KEY);
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored as string);
    expect(parsed.version).toBe(3);
    expect(parsed.items['testa-presens'].repetitions).toBe(1);
    // Sparse: only the one answered item is persisted, nothing else.
    expect(Object.keys(parsed.items)).toEqual(['testa-presens']);

    first.unmount();

    // Advance the clock so a fresh initialization (a bug) would produce a
    // different dueAt than the one already persisted (correct behavior).
    vi.setSystemTime(FIXED_NOW + 60_000);

    const second = renderHook(() => useSrsProgress());
    await waitFor(() => expect(second.result.current.isLoading).toBe(false));

    expect(second.result.current.srsStates['testa-presens']).toEqual(parsed.items['testa-presens']);
  });
});

describe('recordAnswer', () => {
  it('moves an item out of the due set once it has been answered', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const before = await result.current.getDueItems();
    expect(before.map((i) => i.itemId)).toContain('testa-presens');

    act(() => {
      result.current.recordAnswer('testa-presens', 5);
    });
    await waitFor(() => expect(result.current.srsStates['testa-presens'].repetitions).toBe(1));

    const after = await result.current.getDueItems();
    expect(after.map((i) => i.itemId)).not.toContain('testa-presens');
    // Its sibling items, untouched, are still due.
    expect(after.map((i) => i.itemId)).toContain('testa-preteritum');
  });
});

describe('getDueItems filtering', () => {
  it('respects the cefrLevels filter', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { result } = renderHook(() => useSrsProgress(['B1']));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const due = await result.current.getDueItems();
    expect(due.every((item) => item.verbId === 'prova')).toBe(true);
    expect(due.some((item) => item.verbId === 'testa')).toBe(false);
  });

  it('skips forms whose conjugation is "(not available)"', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { result } = renderHook(() => useSrsProgress(['B1']));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const due = await result.current.getDueItems();
    expect(due.map((i) => i.itemId)).not.toContain('prova-imperativ');
    expect(due.map((i) => i.itemId).sort()).toEqual(
      ['prova-presens', 'prova-preteritum', 'prova-supinum'].sort(),
    );
  });

  it('shuffles deterministically when Math.random is stubbed', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const first = await result.current.getDueItems();
    const second = await result.current.getDueItems();
    expect(first.map((i) => i.itemId)).toEqual(second.map((i) => i.itemId));
  });
});

describe('corrupt localStorage', () => {
  it('does not throw on garbage JSON and falls back to empty (sparse) state instead of leaving the app stuck', async () => {
    localStorage.setItem(STORAGE_KEY, '{not valid json!!');

    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.srsStates).toEqual({});
  });
});

describe('importData', () => {
  it('returns false and leaves in-memory state intact when given malformed JSON', async () => {
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.recordAnswer('testa-presens', 5);
    });
    await waitFor(() => expect(result.current.srsStates['testa-presens'].repetitions).toBe(1));

    const snapshot = JSON.parse(JSON.stringify(result.current.srsStates));

    let importResult: boolean | undefined;
    act(() => {
      importResult = result.current.importData('{this is not json');
    });

    expect(importResult).toBe(false);
    expect(result.current.srsStates).toEqual(snapshot);
  });
});

describe('importData rejects non-SRS / malformed payloads without touching existing progress', () => {
  const SETTINGS_EXPORT = JSON.stringify({
    theme: 'dark',
    dailyGoal: 20,
    cefrLevels: ['A1', 'B1'],
  });

  it.each<[string, string]>([
    ['an empty array', '[]'],
    ['an unrelated object', '{"x":1}'],
    ['a settings export (wrong store entirely)', SETTINGS_EXPORT],
    ['an empty object', '{}'],
    ['a bare string', '"hello"'],
    ['a bare number', '42'],
    ['the literal null', 'null'],
    ['a version above the current schema', JSON.stringify({ version: 99, items: {} })],
    ['a non-integer version', JSON.stringify({ version: 2.5, items: {} })],
    [
      'an item with a non-finite easeFactor',
      JSON.stringify({
        'x-presens': { repetitions: 1, intervalDays: 1, easeFactor: 'oops', dueAt: FIXED_NOW },
      }),
    ],
    [
      'an item with an implausible negative repetitions count',
      JSON.stringify({
        'x-presens': { repetitions: -1, intervalDays: 1, easeFactor: 2.5, dueAt: FIXED_NOW },
      }),
    ],
    [
      'an item with a dueAt far outside plausible bounds',
      JSON.stringify({
        'x-presens': { repetitions: 1, intervalDays: 1, easeFactor: 2.5, dueAt: 1 },
      }),
    ],
  ])('rejects %s and leaves existing progress byte-identical', async (_label, payload) => {
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.recordAnswer('testa-presens', 5);
    });
    await waitFor(() => expect(result.current.srsStates['testa-presens'].repetitions).toBe(1));

    const snapshot = JSON.parse(JSON.stringify(result.current.srsStates));

    let importResult: boolean | undefined;
    act(() => {
      importResult = result.current.importData(payload);
    });

    expect(importResult).toBe(false);
    expect(result.current.srsStates).toEqual(snapshot);
  });
});

describe('quota exceeded on write', () => {
  // FIXED: src/hooks/useSrsProgress.ts wraps the localStorage.setItem call
  // in a try/catch (the save effect around STORAGE_VERSION). When the
  // browser's storage quota is exceeded, setItem throwing a DOMException is
  // now caught and logged instead of propagating as an uncaught
  // render-phase error, so a full write failure no longer crashes the tree.
  // Owner: srs-engine (src/hooks/useSrsProgress.ts).
  it('does not crash the component tree when localStorage.setItem throws (quota exceeded)', async () => {
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    });

    expect(() => {
      act(() => {
        result.current.recordAnswer('testa-presens', 5);
      });
    }).not.toThrow();
  });
});

describe('legacy storage migration (v1 unversioned blob -> v3: re-key, rebase, prune)', () => {
  it('rebases easeFactor to at least 1.8 for legacy items with repetitions >= 2, re-keys positional ids to infinitives, and leaves lower-repetition items untouched by the rebase', async () => {
    const legacyBlob = {
      '1-presens': {
        itemId: '1-presens',
        repetitions: 3,
        intervalDays: 16,
        easeFactor: 1.3,
        dueAt: FIXED_NOW,
      },
      '1-preteritum': {
        itemId: '1-preteritum',
        repetitions: 1,
        intervalDays: 1,
        easeFactor: 1.3,
        dueAt: FIXED_NOW,
      },
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(legacyBlob));

    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.srsStates['testa-presens'].easeFactor).toBe(1.8);
    expect(result.current.srsStates['testa-presens'].repetitions).toBe(3); // other fields carried through unchanged
    expect(result.current.srsStates['testa-preteritum'].easeFactor).toBe(1.3); // repetitions < 2: not rebased

    // The old positional keys are gone entirely, and v3 never carries the
    // legacy duplicated itemId field forward.
    expect(result.current.srsStates['1-presens']).toBeUndefined();
    expect(result.current.srsStates['testa-presens']).not.toHaveProperty('itemId');
  });

  it('does not lower an already-higher easeFactor when rebasing', async () => {
    const legacyBlob = {
      '1-presens': {
        itemId: '1-presens',
        repetitions: 5,
        intervalDays: 40,
        easeFactor: 2.4,
        dueAt: FIXED_NOW,
      },
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(legacyBlob));

    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.srsStates['testa-presens'].easeFactor).toBe(2.4);
  });

  it('persists the migration as a version 3 envelope and does not re-rebase an already-versioned payload on remount (one-shot)', async () => {
    const legacyBlob = {
      '1-presens': {
        itemId: '1-presens',
        repetitions: 2,
        intervalDays: 6,
        easeFactor: 1.3,
        dueAt: FIXED_NOW,
      },
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(legacyBlob));

    const first = renderHook(() => useSrsProgress());
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));
    expect(first.result.current.srsStates['testa-presens'].easeFactor).toBe(1.8);
    first.unmount();

    const storedAfterFirst = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
    expect(storedAfterFirst.version).toBe(3);
    expect(storedAfterFirst.items['testa-presens']).not.toHaveProperty('itemId');

    // Prove the rebase does not run again on a versioned payload: knock the
    // persisted ease back under the rebase threshold from outside. If load
    // re-applied rebaseLegacyEase to a version-3 envelope, this would bounce
    // back up to 1.8; the one-shot contract says a versioned envelope is
    // taken as-is.
    storedAfterFirst.items['testa-presens'].easeFactor = 1.3;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storedAfterFirst));

    const second = renderHook(() => useSrsProgress());
    await waitFor(() => expect(second.result.current.isLoading).toBe(false));
    expect(second.result.current.srsStates['testa-presens'].easeFactor).toBe(1.3);
  });

  // Pruning predicate (suggested in PR #189): a pristine item is 100%
  // derivable from initializeSrsState and is not worth a byte of storage; a
  // lapsed item (repetitions reset to 0 by a miss) genuinely represents
  // history and must survive.
  it('drops a pristine (never-touched) legacy item during migration but keeps a lapsed one', async () => {
    const legacyBlob = {
      '1-presens': {
        // Pristine: exactly what initializeSrsState() produces.
        repetitions: 0,
        intervalDays: 0,
        easeFactor: 2.5,
        dueAt: FIXED_NOW,
      },
      '1-preteritum': {
        // Lapsed: repetitions reset to 0 by a miss, but intervalDays 1 and
        // a recorded lastGrade prove this item WAS practiced.
        repetitions: 0,
        intervalDays: 1,
        easeFactor: 2.3,
        dueAt: FIXED_NOW,
        lastGrade: 0,
      },
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(legacyBlob));

    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.srsStates['testa-presens']).toBeUndefined();
    expect(result.current.srsStates['testa-preteritum']).toBeDefined();
    expect(result.current.srsStates['testa-preteritum'].lastGrade).toBe(0);
  });
});

describe('legacy migration is verb-for-verb correct (regression: no id crosstalk between verbs)', () => {
  it("migrates each positional key to the matching verb's infinitive, not a neighboring verb's, with progress intact", async () => {
    const legacyBlob = {
      '1-presens': {
        itemId: '1-presens',
        repetitions: 3,
        intervalDays: 16,
        easeFactor: 2.6,
        dueAt: FIXED_NOW,
      },
      '2-supinum': {
        itemId: '2-supinum',
        repetitions: 5,
        intervalDays: 100,
        easeFactor: 2.75,
        dueAt: FIXED_NOW + 1000,
      },
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(legacyBlob));

    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.srsStates['testa-presens']).toMatchObject({
      repetitions: 3,
      intervalDays: 16,
      dueAt: FIXED_NOW,
    });
    expect(result.current.srsStates['prova-supinum']).toMatchObject({
      repetitions: 5,
      intervalDays: 100,
      dueAt: FIXED_NOW + 1000,
    });
    // Not swapped or merged into the wrong verb.
    expect(result.current.srsStates['testa-supinum']).toBeUndefined();
    expect(result.current.srsStates['prova-presens']).toBeUndefined();
  });
});

describe('importData legacy rebase and re-keying', () => {
  it('applies the one-time ease rebase and re-keys positional ids to infinitives when importing a legacy (unversioned) export', async () => {
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const legacyExport = JSON.stringify({
      '1-presens': {
        itemId: '1-presens',
        repetitions: 4,
        intervalDays: 20,
        easeFactor: 1.3,
        dueAt: FIXED_NOW,
      },
      '1-preteritum': {
        itemId: '1-preteritum',
        repetitions: 0,
        intervalDays: 1,
        easeFactor: 1.3,
        dueAt: FIXED_NOW,
        lastGrade: 0,
      },
    });

    let importResult: boolean | undefined;
    act(() => {
      importResult = result.current.importData(legacyExport);
    });

    expect(importResult).toBe(true);
    expect(result.current.srsStates['testa-presens'].easeFactor).toBe(1.8);
    expect(result.current.srsStates['testa-preteritum'].easeFactor).toBe(1.3);
    expect(result.current.srsStates['1-presens']).toBeUndefined();
  });

  it('does not rebase a versioned (v2) import even when its easeFactor is below the legacy threshold, but still re-keys the positional id', async () => {
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const versionedExport = JSON.stringify({
      version: 2,
      items: {
        '1-presens': {
          itemId: '1-presens',
          repetitions: 4,
          intervalDays: 20,
          easeFactor: 1.3,
          dueAt: FIXED_NOW,
        },
      },
    });

    act(() => {
      result.current.importData(versionedExport);
    });

    expect(result.current.srsStates['testa-presens'].easeFactor).toBe(1.3);
    expect(result.current.srsStates['1-presens']).toBeUndefined();
  });
});
