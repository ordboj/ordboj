import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useSrsProgress } from '@/hooks/useSrsProgress';
import { getVerbs, getAllConjugatedVerbs, conjugateVerb } from '@/lib/verbs';
import type { ConjugatedVerb, Verb } from '@/lib/verbs';

const STORAGE_KEY = 'swedish-verbs-srs-progress';

// This suite mocks the swedish-linguist-owned '@/lib/verbs' boundary so the
// SRS wiring (owned by srs-engine) can be tested against a small, known,
// deterministic verb set instead of the real ~50-verb table. The real table
// currently has every verb at cefr "A1" (see verbs.realdata.test.ts), which
// makes the cefrLevels filter untestable against real data.
const FIXTURE_VERBS: Verb[] = [
  { id: '1', infinitive: 'testa', cefr: 'A1' },
  { id: '2', infinitive: 'prova', cefr: 'B1' },
];

const FIXTURE_CONJUGATIONS: Record<string, ConjugatedVerb> = {
  testa: {
    id: '1',
    infinitive: 'testa',
    cefr: 'A1',
    presens: 'testar',
    preteritum: 'testade',
    supinum: 'testat',
    imperativ: 'testa',
  },
  prova: {
    id: '2',
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
    // getDueItems (src/hooks/useSrsProgress.ts) calls this bulk entry point
    // instead of per-verb conjugateVerb (see #56); it must agree with
    // FIXTURE_CONJUGATIONS or this mock silently falls through to the real
    // ~50-verb VERB_DATA table and the fixture-based assertions below break.
    getAllConjugatedVerbs: vi.fn(async () => Object.values(FIXTURE_CONJUGATIONS)),
  };
});

const FIXED_NOW = new Date('2026-01-01T00:00:00.000Z').getTime();
const ALL_ITEM_IDS = [
  '1-presens',
  '1-preteritum',
  '1-supinum',
  '1-imperativ',
  '2-presens',
  '2-preteritum',
  '2-supinum',
  '2-imperativ',
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

describe('cold start', () => {
  it('initializes every verb x form combination when localStorage is empty', async () => {
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(Object.keys(result.current.srsStates).sort()).toEqual(ALL_ITEM_IDS.sort());
    for (const itemId of ALL_ITEM_IDS) {
      const state = result.current.srsStates[itemId];
      expect(state).toMatchObject({
        itemId,
        repetitions: 0,
        intervalDays: 0,
        easeFactor: 2.5,
        dueAt: FIXED_NOW,
      });
    }
  });
});

describe('persistence - the irreplaceable-progress invariant', () => {
  it('writes state to the documented localStorage key and re-reads it verbatim on remount', async () => {
    const first = renderHook(() => useSrsProgress());
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));

    act(() => {
      first.result.current.recordAnswer('1-presens', 5);
    });
    await waitFor(() => expect(first.result.current.srsStates['1-presens'].repetitions).toBe(1));

    const stored = localStorage.getItem(STORAGE_KEY);
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored as string);
    expect(parsed.version).toBe(2);
    expect(parsed.items['1-presens'].repetitions).toBe(1);

    first.unmount();

    // Advance the clock so a fresh initialization (a bug) would produce a
    // different dueAt than the one already persisted (correct behavior).
    vi.setSystemTime(FIXED_NOW + 60_000);

    const second = renderHook(() => useSrsProgress());
    await waitFor(() => expect(second.result.current.isLoading).toBe(false));

    expect(second.result.current.srsStates['1-presens']).toEqual(parsed.items['1-presens']);
  });
});

describe('recordAnswer', () => {
  it('moves an item out of the due set once it has been answered', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const before = await result.current.getDueItems();
    expect(before.map((i) => i.itemId)).toContain('1-presens');

    act(() => {
      result.current.recordAnswer('1-presens', 5);
    });
    await waitFor(() => expect(result.current.srsStates['1-presens'].repetitions).toBe(1));

    const after = await result.current.getDueItems();
    expect(after.map((i) => i.itemId)).not.toContain('1-presens');
    // Its sibling items, untouched, are still due.
    expect(after.map((i) => i.itemId)).toContain('1-preteritum');
  });
});

describe('getDueItems filtering', () => {
  it('respects the cefrLevels filter', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { result } = renderHook(() => useSrsProgress(['B1']));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const due = await result.current.getDueItems();
    expect(due.every((item) => item.verbId === '2')).toBe(true);
    expect(due.some((item) => item.verbId === '1')).toBe(false);
  });

  it('skips forms whose conjugation is "(not available)"', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { result } = renderHook(() => useSrsProgress(['B1']));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const due = await result.current.getDueItems();
    expect(due.map((i) => i.itemId)).not.toContain('2-imperativ');
    expect(due.map((i) => i.itemId).sort()).toEqual(
      ['2-presens', '2-preteritum', '2-supinum'].sort(),
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

  // Regression test for issue #137: an explicit empty cefrLevels selection
  // must never be silently widened back to "no filter = every verb". The
  // two calls below are the entire contract: `undefined` (caller did not
  // opt in to filtering) means "all verbs in scope", while `[]` (caller
  // explicitly selected nothing) means zero verbs in scope. These are
  // deliberately different outcomes for what a naive `cefrLevels?.length`
  // check would treat identically.
  it('issue #137: treats an explicit empty cefrLevels array as "match nothing", not as "no filter"', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const noFilter = renderHook(() => useSrsProgress(undefined));
    await waitFor(() => expect(noFilter.result.current.isLoading).toBe(false));
    const dueWithNoFilter = await noFilter.result.current.getDueItems();
    // Sanity check: with no filter argument at all, verbs from both CEFR
    // levels in the fixture are in scope.
    expect(dueWithNoFilter.some((item) => item.verbId === '1')).toBe(true);
    expect(dueWithNoFilter.some((item) => item.verbId === '2')).toBe(true);

    const emptyFilter = renderHook(() => useSrsProgress([]));
    await waitFor(() => expect(emptyFilter.result.current.isLoading).toBe(false));
    const dueWithEmptyFilter = await emptyFilter.result.current.getDueItems();

    // The bug this guards against: an empty array silently falling back to
    // "all verbs" (i.e. behaving like the `undefined` case above).
    expect(dueWithEmptyFilter).toEqual([]);
  });
});

describe('corrupt localStorage', () => {
  it('does not throw on garbage JSON and initializes fresh state instead of leaving the app stuck', async () => {
    localStorage.setItem(STORAGE_KEY, '{not valid json!!');

    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(Object.keys(result.current.srsStates).sort()).toEqual(ALL_ITEM_IDS.sort());
  });
});

describe('importData', () => {
  it('returns false and leaves in-memory state intact when given malformed JSON', async () => {
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.recordAnswer('1-presens', 5);
    });
    await waitFor(() => expect(result.current.srsStates['1-presens'].repetitions).toBe(1));

    const snapshot = JSON.parse(JSON.stringify(result.current.srsStates));

    let importResult: boolean | undefined;
    act(() => {
      importResult = result.current.importData('{this is not json');
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
        result.current.recordAnswer('1-presens', 5);
      });
    }).not.toThrow();
  });
});

describe('legacy storage migration (v1 unversioned blob -> v2 ease rebase)', () => {
  it('rebases easeFactor to at least 1.8 for legacy items with repetitions >= 2, leaves lower-repetition items untouched', async () => {
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

    expect(result.current.srsStates['1-presens'].easeFactor).toBe(1.8);
    expect(result.current.srsStates['1-presens'].repetitions).toBe(3); // other fields carried through unchanged
    expect(result.current.srsStates['1-preteritum'].easeFactor).toBe(1.3); // repetitions < 2: not rebased
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

    expect(result.current.srsStates['1-presens'].easeFactor).toBe(2.4);
  });

  it('persists the migration as a version 2 envelope and does not re-rebase an already-versioned payload on remount (one-shot)', async () => {
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
    expect(first.result.current.srsStates['1-presens'].easeFactor).toBe(1.8);
    first.unmount();

    const storedAfterFirst = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
    expect(storedAfterFirst.version).toBe(2);

    // Prove the rebase does not run again on a versioned payload: knock the
    // persisted ease back under the rebase threshold from outside. If load
    // re-applied rebaseLegacyEase to a version-2 envelope, this would bounce
    // back up to 1.8; the one-shot contract says a versioned envelope is
    // taken as-is.
    storedAfterFirst.items['1-presens'].easeFactor = 1.3;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storedAfterFirst));

    const second = renderHook(() => useSrsProgress());
    await waitFor(() => expect(second.result.current.isLoading).toBe(false));
    expect(second.result.current.srsStates['1-presens'].easeFactor).toBe(1.3);
  });
});

// Integration-level proof (issue #11) that the hook's getDueItems - and
// therefore Home.tsx's dueCount, which is just getDueItems().length - picks
// up srs.ts's local-end-of-day isDue boundary rather than some independent
// (and possibly stale) comparison. isDue is unit-tested in isolation in
// srs.test.ts; this exercises the real load -> getDueItems path through
// localStorage so a regression where the hook stopped calling isDue (or
// wrapped it with its own now/boundary logic) would show up here too.
describe('getDueItems - local day boundary (issue #11)', () => {
  const originalTz = process.env.TZ;

  beforeEach(() => {
    process.env.TZ = 'Europe/Stockholm';
  });

  afterEach(() => {
    // Assigning undefined would store the literal string "undefined" as
    // the timezone; delete the key instead.
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it('includes an item due later the same local day and excludes one due at the start of the next local day', async () => {
    const now = new Date(2026, 0, 15, 10, 0, 0, 0).getTime(); // Jan 15, 2026 10:00 local
    vi.setSystemTime(now);

    const dueLaterToday = new Date(2026, 0, 15, 22, 0, 0, 0).getTime(); // same local day, 12h ahead
    const dueStartOfTomorrow = new Date(2026, 0, 16, 0, 0, 0, 0).getTime(); // next local day, 14h ahead

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 2,
        items: {
          '1-presens': {
            itemId: '1-presens',
            repetitions: 1,
            intervalDays: 1,
            easeFactor: 2.5,
            dueAt: dueLaterToday,
          },
          '2-presens': {
            itemId: '2-presens',
            repetitions: 1,
            intervalDays: 1,
            easeFactor: 2.5,
            dueAt: dueStartOfTomorrow,
          },
        },
      }),
    );

    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const due = await result.current.getDueItems();
    const dueIds = due.map((i) => i.itemId);

    // Note the excluded item is *further* from `now` in raw ms (14h) than
    // the included one (12h) - only the calendar-day boundary, not ms
    // distance, explains why one is due and the other isn't.
    expect(dueIds).toContain('1-presens');
    expect(dueIds).not.toContain('2-presens');
  });
});

describe('importData legacy rebase', () => {
  it('applies the one-time ease rebase when importing a legacy (unversioned) export', async () => {
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
        intervalDays: 0,
        easeFactor: 1.3,
        dueAt: FIXED_NOW,
      },
    });

    let importResult: boolean | undefined;
    act(() => {
      importResult = result.current.importData(legacyExport);
    });

    expect(importResult).toBe(true);
    expect(result.current.srsStates['1-presens'].easeFactor).toBe(1.8);
    expect(result.current.srsStates['1-preteritum'].easeFactor).toBe(1.3);
  });

  it('does not rebase a versioned (v2) import even when its easeFactor is below the legacy threshold', async () => {
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

    expect(result.current.srsStates['1-presens'].easeFactor).toBe(1.3);
  });
});

describe('getDueItems scaling (regression guard for #56: O(V^2) per-verb lookup)', () => {
  // Before #56, getDueItems called conjugateVerb(infinitive) once per verb,
  // and conjugateVerb's real implementation does an O(V) VERB_DATA.find()
  // internally -> O(V) calls x O(V) search = O(V^2) total. The fix replaced
  // that with a single getAllConjugatedVerbs() call (O(V)) indexed into a
  // Map for O(1) per-verb lookups in the loop.
  //
  // To make that complexity difference observable without depending on
  // real wall-clock noise at small V, both conjugateVerb and
  // getAllConjugatedVerbs are given an artificial per-call cost
  // proportional to the verb count N, mirroring the real functions' O(N)
  // shape. getDueItems's current (fixed) implementation only ever calls
  // getAllConjugatedVerbs once, so total cost stays O(N) regardless of how
  // many verbs there are. If a future change reintroduces a per-verb
  // conjugateVerb call in that loop, this test's large-N run pays for N
  // calls at O(N) each and the assertion below fails loudly (or the test
  // times out) instead of drifting unnoticed.
  it(
    'keeps getDueItems wall time close to linear as verb count grows 10x',
    { timeout: 15000 },
    async () => {
      function busyWork(n: number) {
        let acc = 0;
        for (let i = 0; i < n * 2000; i++) acc += i % 7;
        return acc;
      }

      function makeVerbs(n: number): Verb[] {
        return Array.from({ length: n }, (_, i) => ({
          id: String(i + 1),
          infinitive: `verb${i}`,
          cefr: 'A1',
        }));
      }

      function makeConjugated(n: number): ConjugatedVerb[] {
        return Array.from({ length: n }, (_, i) => ({
          id: String(i + 1),
          infinitive: `verb${i}`,
          cefr: 'A1',
          presens: 'x',
          preteritum: 'x',
          supinum: 'x',
          imperativ: 'x',
        }));
      }

      async function timeGetDueItems(n: number): Promise<number> {
        const verbs = makeVerbs(n);
        const conjugated = makeConjugated(n);

        vi.mocked(getVerbs).mockImplementation(async () => verbs);
        vi.mocked(getAllConjugatedVerbs).mockImplementation(async () => {
          busyWork(n); // one O(n) pass, mirroring a real VERB_DATA.map()
          return conjugated;
        });
        vi.mocked(conjugateVerb).mockImplementation(async (infinitive: string) => {
          busyWork(n); // one O(n) scan, mirroring a real VERB_DATA.find()
          return (
            conjugated.find((c) => c.infinitive === infinitive) ?? {
              id: 'unknown',
              infinitive,
              presens: '(not available)',
              preteritum: '(not available)',
              supinum: '(not available)',
              imperativ: '(not available)',
            }
          );
        });

        const { result } = renderHook(() => useSrsProgress());
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        const start = performance.now();
        await result.current.getDueItems();
        return performance.now() - start;
      }

      try {
        const small = await timeGetDueItems(100);
        const large = await timeGetDueItems(1000); // 10x verb count

        // O(V) work should land near ~10x; the pre-#56 O(V^2) bug would be
        // ~100x. Generous slack (15x, plus a flat floor) keeps this stable
        // under CI timer noise while still catching a real quadratic
        // regression.
        expect(large).toBeLessThan(Math.max(small * 15, small + 50));
      } finally {
        // These three are module-scoped vi.fn()s shared by every test in
        // this file via the top-level vi.mock('@/lib/verbs', ...) factory;
        // restore their fixture-backed behavior so later test runs (or a
        // different execution order) don't inherit this test's synthetic
        // large-N implementations.
        vi.mocked(getVerbs).mockImplementation(async () => FIXTURE_VERBS);
        vi.mocked(getAllConjugatedVerbs).mockImplementation(async () =>
          Object.values(FIXTURE_CONJUGATIONS),
        );
        vi.mocked(conjugateVerb).mockImplementation(async (infinitive: string) => {
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
        });
      }
    },
  );
});

// Issue #135: "Import Progress accepts any JSON and overwrites the store
// unvalidated". These pin the three acceptance-criteria cases directly:
// a structurally valid backup is applied, and anything that isn't —
// non-JSON garbage or valid JSON with the wrong shape — is rejected without
// touching either the in-memory state or the persisted localStorage entry.
describe('importData shape validation (issue #135)', () => {
  it('accepts a structurally valid versioned backup and applies it verbatim', async () => {
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const validExport = JSON.stringify({
      version: 2,
      items: {
        '1-presens': {
          itemId: '1-presens',
          repetitions: 7,
          intervalDays: 40,
          easeFactor: 2.1,
          dueAt: FIXED_NOW,
          lastGrade: 5,
        },
      },
    });

    let importResult: boolean | undefined;
    act(() => {
      importResult = result.current.importData(validExport);
    });

    expect(importResult).toBe(true);
    expect(result.current.srsStates).toEqual({
      '1-presens': {
        itemId: '1-presens',
        repetitions: 7,
        intervalDays: 40,
        easeFactor: 2.1,
        dueAt: FIXED_NOW,
        lastGrade: 5,
      },
    });
  });

  it('rejects a valid-JSON payload shaped like a settings export, without mutating in-memory state or localStorage', async () => {
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.recordAnswer('1-presens', 5);
    });
    await waitFor(() => expect(result.current.srsStates['1-presens'].repetitions).toBe(1));

    const stateSnapshot = JSON.parse(JSON.stringify(result.current.srsStates));
    const storageSnapshot = localStorage.getItem(STORAGE_KEY);

    // Well-formed JSON, but it is a settings export, not a progress backup:
    // none of its values are SrsState-shaped.
    const settingsExport = JSON.stringify({
      theme: 'dark',
      dailyGoal: 20,
      soundEnabled: true,
    });

    let importResult: boolean | undefined;
    act(() => {
      importResult = result.current.importData(settingsExport);
    });

    expect(importResult).toBe(false);
    expect(result.current.srsStates).toEqual(stateSnapshot);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(storageSnapshot);
  });

  it('rejects a versioned envelope where one item is missing required SrsState fields (all-or-nothing), without mutating the store', async () => {
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.recordAnswer('1-presens', 5);
    });
    await waitFor(() => expect(result.current.srsStates['1-presens'].repetitions).toBe(1));

    const stateSnapshot = JSON.parse(JSON.stringify(result.current.srsStates));
    const storageSnapshot = localStorage.getItem(STORAGE_KEY);

    const partiallyBrokenExport = JSON.stringify({
      version: 2,
      items: {
        '1-presens': {
          itemId: '1-presens',
          repetitions: 3,
          intervalDays: 16,
          easeFactor: 2.0,
          dueAt: FIXED_NOW,
        },
        // Missing dueAt entirely: not a valid SrsState.
        '1-preteritum': {
          itemId: '1-preteritum',
          repetitions: 1,
          intervalDays: 1,
          easeFactor: 2.0,
        },
      },
    });

    let importResult: boolean | undefined;
    act(() => {
      importResult = result.current.importData(partiallyBrokenExport);
    });

    expect(importResult).toBe(false);
    expect(result.current.srsStates).toEqual(stateSnapshot);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(storageSnapshot);
  });

  it('rejects a version number newer than this build understands, without mutating the store', async () => {
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.recordAnswer('1-presens', 5);
    });
    await waitFor(() => expect(result.current.srsStates['1-presens'].repetitions).toBe(1));

    const stateSnapshot = JSON.parse(JSON.stringify(result.current.srsStates));
    const storageSnapshot = localStorage.getItem(STORAGE_KEY);

    const futureVersionExport = JSON.stringify({
      version: 99,
      items: {
        '1-presens': {
          itemId: '1-presens',
          repetitions: 3,
          intervalDays: 16,
          easeFactor: 2.0,
          dueAt: FIXED_NOW,
        },
      },
    });

    let importResult: boolean | undefined;
    act(() => {
      importResult = result.current.importData(futureVersionExport);
    });

    expect(importResult).toBe(false);
    expect(result.current.srsStates).toEqual(stateSnapshot);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(storageSnapshot);
  });

  it('rejects a top-level JSON array, without mutating the store', async () => {
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const stateSnapshot = JSON.parse(JSON.stringify(result.current.srsStates));
    const storageSnapshot = localStorage.getItem(STORAGE_KEY);

    let importResult: boolean | undefined;
    act(() => {
      importResult = result.current.importData('[1, 2, 3]');
    });

    expect(importResult).toBe(false);
    expect(result.current.srsStates).toEqual(stateSnapshot);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(storageSnapshot);
  });

  it('rejects malformed (non-JSON) input without touching the persisted localStorage entry', async () => {
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.recordAnswer('1-presens', 5);
    });
    await waitFor(() => expect(result.current.srsStates['1-presens'].repetitions).toBe(1));

    const storageSnapshot = localStorage.getItem(STORAGE_KEY);

    let importResult: boolean | undefined;
    act(() => {
      importResult = result.current.importData('{this is not json');
    });

    expect(importResult).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(storageSnapshot);
  });
});

describe('#241: forward-compat guard against a newer store', () => {
  // A build older than the store it finds must not write to it. The store
  // holds the only copy of a learner's schedule, so rewriting a version-3
  // envelope as version 2 would discard whatever the newer build recorded
  // with no backup and no error. The session runs read-only instead.
  const futureStore = JSON.stringify({
    version: 99,
    items: {
      '1-presens': {
        itemId: '1-presens',
        repetitions: 7,
        intervalDays: 30,
        easeFactor: 2.5,
        dueAt: FIXED_NOW - 1000,
        somethingNewerBuildsTrack: 'do not lose me',
      },
    },
  });

  it('reports the store as read-only', async () => {
    localStorage.setItem(STORAGE_KEY, futureStore);
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isReadOnly).toBe(true);
  });

  it('leaves the stored bytes exactly as found, even after an answer', async () => {
    localStorage.setItem(STORAGE_KEY, futureStore);
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(localStorage.getItem(STORAGE_KEY)).toBe(futureStore);

    act(() => {
      result.current.recordAnswer('1-presens', 5);
    });
    await waitFor(() => expect(result.current.srsStates['1-presens'].repetitions).toBe(8));

    // In-memory the session advances, so the learner can still practise.
    // On disk nothing moved — including the field this build cannot read.
    expect(localStorage.getItem(STORAGE_KEY)).toBe(futureStore);
  });

  it('still persists normally for a store this build understands', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 2,
        items: {
          '1-presens': {
            itemId: '1-presens',
            repetitions: 1,
            intervalDays: 1,
            easeFactor: 2.5,
            dueAt: FIXED_NOW - 1000,
          },
        },
      }),
    );
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isReadOnly).toBe(false);

    act(() => {
      result.current.recordAnswer('1-presens', 5);
    });
    await waitFor(() => expect(result.current.srsStates['1-presens'].repetitions).toBe(2));

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
    expect(stored.version).toBe(2);
    expect(stored.items['1-presens'].repetitions).toBe(2);
  });

  it('treats a legacy unversioned store as writable, not as newer', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        '1-presens': {
          itemId: '1-presens',
          repetitions: 3,
          intervalDays: 6,
          easeFactor: 1.3,
          dueAt: FIXED_NOW - 1000,
        },
      }),
    );
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isReadOnly).toBe(false);
    // And the legacy ease rebase still ran on the way in.
    expect(result.current.srsStates['1-presens'].easeFactor).toBe(1.8);
  });
});
