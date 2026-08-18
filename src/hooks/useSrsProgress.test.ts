import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useSrsProgress, STORAGE_VERSION } from '@/hooks/useSrsProgress';
import { useAnswerLog } from '@/hooks/useAnswerLog';
import { getVerbs, getAllConjugatedVerbs, conjugateVerb, verbs } from '@/lib/verbs';
import type { ConjugatedVerb, Verb } from '@/lib/verbs';
import { conjugationItemId, particleItemId } from '@/lib/itemIds';
import { ANSWER_LOG_STORAGE_KEY, type AnswerLogEntry } from '@/lib/answerLog';

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

// Writes are coalesced with a real-clock window (issue #253,
// src/lib/storage.ts). A test that snapshots localStorage and later asserts
// it did not change must first let the armed write land — otherwise the
// flush can fire between snapshot and assertion and fail it spuriously.
//
// A plain "storage is non-null" check is not enough: on load, the hook
// itself schedules a write for the initial (empty) state, so storage can go
// non-null before a subsequent recordAnswer's write has landed. If that
// initial write's timer fires after the caller already recorded an answer,
// settlePersistence would return on the stale pre-answer content, and the
// still-pending post-answer flush would land later, between the caller's
// snapshot and its "storage unchanged" assertion. Callers that just
// recorded an answer must say so, so this waits for storage to actually
// reflect it rather than merely existing.
async function settlePersistence(isSettled: (stored: unknown) => boolean = () => true) {
  await waitFor(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(isSettled(JSON.parse(raw as string))).toBe(true);
  });
}

// Shorthand for the common case: an answer was just recorded for
// '1-presens' and the caller needs storage to reflect that repetition
// count before it starts comparing snapshots.
function reflectsRecordedAnswer(repetitions: number) {
  return (stored: unknown) =>
    (stored as { items?: Record<string, { repetitions?: number }> }).items?.['1-presens']
      ?.repetitions === repetitions;
}

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
    await waitFor(() => expect(first.result.current.srsStates['1-presens']!.repetitions).toBe(1));

    // Writes are coalesced (issue #253): the answer reaches disk at the
    // latest when the hook unmounts and the writer's dispose() flushes.
    first.unmount();

    const stored = localStorage.getItem(STORAGE_KEY);
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored as string);
    expect(parsed.version).toBe(STORAGE_VERSION);
    expect(parsed.items['1-presens'].repetitions).toBe(1);

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
    await waitFor(() => expect(result.current.srsStates['1-presens']!.repetitions).toBe(1));

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
    await waitFor(() => expect(result.current.srsStates['1-presens']!.repetitions).toBe(1));

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
  // The save path goes through the coalesced writer (src/lib/storage.ts,
  // issue #253), whose writeSerialized swallows a throwing setItem. When
  // the browser's storage quota is exceeded, the DOMException is caught and
  // logged instead of propagating, so a full write failure never crashes
  // the tree — neither when the answer is recorded nor when the pending
  // write is flushed at unmount.
  // Owner: srs-engine (src/hooks/useSrsProgress.ts, src/lib/storage.ts).
  it('does not crash the component tree when localStorage.setItem throws (quota exceeded)', async () => {
    const { result, unmount } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    });

    expect(() => {
      act(() => {
        result.current.recordAnswer('1-presens', 5);
      });
      // Force the pending write to actually hit the throwing setItem.
      unmount();
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

    expect(result.current.srsStates['1-presens']!.easeFactor).toBe(1.8);
    expect(result.current.srsStates['1-presens']!.repetitions).toBe(3); // other fields carried through unchanged
    expect(result.current.srsStates['1-preteritum']!.easeFactor).toBe(1.3); // repetitions < 2: not rebased
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

    expect(result.current.srsStates['1-presens']!.easeFactor).toBe(2.4);
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
    expect(first.result.current.srsStates['1-presens']!.easeFactor).toBe(1.8);
    first.unmount();

    const storedAfterFirst = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
    expect(storedAfterFirst.version).toBe(STORAGE_VERSION);

    // Prove the rebase does not run again on a versioned payload: knock the
    // persisted ease back under the rebase threshold from outside. If load
    // re-applied rebaseLegacyEase to a version-2 envelope, this would bounce
    // back up to 1.8; the one-shot contract says a versioned envelope is
    // taken as-is.
    storedAfterFirst.items['1-presens'].easeFactor = 1.3;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storedAfterFirst));

    const second = renderHook(() => useSrsProgress());
    await waitFor(() => expect(second.result.current.isLoading).toBe(false));
    expect(second.result.current.srsStates['1-presens']!.easeFactor).toBe(1.3);
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
    expect(result.current.srsStates['1-presens']!.easeFactor).toBe(1.8);
    expect(result.current.srsStates['1-preteritum']!.easeFactor).toBe(1.3);
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

    expect(result.current.srsStates['1-presens']!.easeFactor).toBe(1.3);
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
    // v3 -> v4 (ORD-88): a practised item (lastGrade set, non-zero interval)
    // imported without firstSeenAt is backfilled on import the same way it
    // is backfilled on load — dueAt - intervalDays * 24h, per
    // backfillFirstSeenAt in useSrsProgress.ts.
    expect(result.current.srsStates).toEqual({
      '1-presens': {
        itemId: '1-presens',
        repetitions: 7,
        intervalDays: 40,
        easeFactor: 2.1,
        dueAt: FIXED_NOW,
        lastGrade: 5,
        firstSeenAt: FIXED_NOW - 40 * 24 * 60 * 60 * 1000,
      },
    });
  });

  it('rejects a valid-JSON payload shaped like a settings export, without mutating in-memory state or localStorage', async () => {
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.recordAnswer('1-presens', 5);
    });
    await waitFor(() => expect(result.current.srsStates['1-presens']?.repetitions).toBe(1));

    await settlePersistence(reflectsRecordedAnswer(1));
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
    await waitFor(() => expect(result.current.srsStates['1-presens']?.repetitions).toBe(1));

    await settlePersistence(reflectsRecordedAnswer(1));
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
    await waitFor(() => expect(result.current.srsStates['1-presens']?.repetitions).toBe(1));

    await settlePersistence(reflectsRecordedAnswer(1));
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

  // ORD-88 staff-engineer review: the version-99 case above proves "some
  // future version is refused"; it does not prove the refusal boundary
  // itself is right. A version one past what this build understands is the
  // sharper pin — an off-by-one (`>=` where the code means `>`) would still
  // fail the 99 case but would wrongly refuse this one, or wrongly accept a
  // real v5 payload.
  it('refuses to import a version one newer than this build understands (v5 relative to v4), without mutating the store', async () => {
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.recordAnswer('1-presens', 5);
    });
    await waitFor(() => expect(result.current.srsStates['1-presens']?.repetitions).toBe(1));
    await settlePersistence(reflectsRecordedAnswer(1));
    const stateSnapshot = JSON.parse(JSON.stringify(result.current.srsStates));
    const storageSnapshot = localStorage.getItem(STORAGE_KEY);

    const nextVersionExport = JSON.stringify({
      version: STORAGE_VERSION + 1,
      items: {
        '1-presens': {
          repetitions: 3,
          intervalDays: 16,
          easeFactor: 2.0,
          dueAt: FIXED_NOW,
        },
      },
    });

    let importResult: boolean | undefined;
    act(() => {
      importResult = result.current.importData(nextVersionExport);
    });

    expect(importResult).toBe(false);
    expect(result.current.srsStates).toEqual(stateSnapshot);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(storageSnapshot);
  });

  it('accepts an import at exactly the current storage version — nothing about being "current" refuses it', async () => {
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const currentVersionExport = JSON.stringify({
      version: STORAGE_VERSION,
      items: {
        '1-presens': {
          repetitions: 6,
          intervalDays: 18,
          easeFactor: 2.4,
          dueAt: FIXED_NOW,
          lastGrade: 5,
          firstSeenAt: FIXED_NOW - 18 * 24 * 60 * 60 * 1000,
        },
      },
    });

    let importResult: boolean | undefined;
    act(() => {
      importResult = result.current.importData(currentVersionExport);
    });

    expect(importResult).toBe(true);
    expect(result.current.srsStates['1-presens']).toMatchObject({
      repetitions: 6,
      firstSeenAt: FIXED_NOW - 18 * 24 * 60 * 60 * 1000,
    });
  });

  it('rejects a top-level JSON array, without mutating the store', async () => {
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await settlePersistence();
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
    await waitFor(() => expect(result.current.srsStates['1-presens']?.repetitions).toBe(1));

    await settlePersistence(reflectsRecordedAnswer(1));
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
    await waitFor(() => expect(result.current.srsStates['1-presens']!.repetitions).toBe(8));

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
    const { result, unmount } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isReadOnly).toBe(false);

    act(() => {
      result.current.recordAnswer('1-presens', 5);
    });
    await waitFor(() => expect(result.current.srsStates['1-presens']!.repetitions).toBe(2));

    // The write is coalesced (issue #253); unmounting flushes it.
    unmount();
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
    expect(stored.version).toBe(STORAGE_VERSION);
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
    expect(result.current.srsStates['1-presens']!.easeFactor).toBe(1.8);
  });
});

// Issue #53: storage v3 stops persisting untouched items, so most items in a
// real store (and every item in an exported backup) have no key in the
// on-disk map. If getDueItems required a stored entry to consider an item
// due, importing one of v3's own sparse exports would make the rest of the
// deck vanish from practice with no error - the same "silent progress loss"
// class of bug CLAUDE.md calls out, just triggered by a normal backup/
// restore instead of a corrupt file.
describe('#53: getDueItems treats a missing key as new/due-now', () => {
  it('surfaces an item with no stored state as due, and still respects a future dueAt for an item that does have state', async () => {
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // A sparse v3-shaped backup: only one of the eight fixture items
    // (2 verbs x 4 forms) carries a stored entry, with a future dueAt. This
    // is exactly the shape toStoredItems/exportData now produce.
    const sparseBackup = JSON.stringify({
      version: 3,
      items: {
        '1-presens': {
          repetitions: 2,
          intervalDays: 6,
          easeFactor: 2.5,
          dueAt: FIXED_NOW + 5 * 24 * 60 * 60 * 1000, // not due
        },
      },
    });

    act(() => {
      result.current.importData(sparseBackup);
    });
    await waitFor(() => expect(result.current.srsStates['1-presens']).toBeDefined());

    // Only one key exists in srsStates now - setSrsStates replaces the map
    // wholesale, so every other conjugation item genuinely has no entry.
    expect(Object.keys(result.current.srsStates)).toEqual(['1-presens']);

    const due = await result.current.getDueItems();
    const dueIds = due.map((item) => item.itemId);

    // The one item with stored state is not due (its dueAt is 5 days out).
    expect(dueIds).not.toContain('1-presens');
    // Every item with no stored state at all is still offered - a missing
    // key means "never practised", which is due now, not "not due". (7
    // available items total: 2 verbs x 4 forms, minus prova's unavailable
    // imperativ - see "skips forms whose conjugation is (not available)"
    // above - minus the one item with stored (future) state.)
    expect(dueIds.sort()).toEqual(
      ['1-preteritum', '1-supinum', '1-imperativ', '2-presens', '2-preteritum', '2-supinum'].sort(),
    );
  });
});

describe('#53: explicit reject list ([], {"x":1}, settings export)', () => {
  it('rejects each of the three literal non-progress payloads without mutating in-memory state or localStorage', async () => {
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.recordAnswer('1-presens', 5);
    });
    await waitFor(() => expect(result.current.srsStates['1-presens']?.repetitions).toBe(1));

    const settingsExport = JSON.stringify({
      theme: 'dark',
      dailyGoal: 20,
      soundEnabled: true,
    });

    const rejectedPayloads = ['[]', '{"x":1}', settingsExport];

    await settlePersistence(reflectsRecordedAnswer(1));
    for (const payload of rejectedPayloads) {
      const stateSnapshot = JSON.parse(JSON.stringify(result.current.srsStates));
      const storageSnapshot = localStorage.getItem(STORAGE_KEY);

      let importResult: boolean | undefined;
      act(() => {
        importResult = result.current.importData(payload);
      });

      expect(importResult).toBe(false);
      expect(result.current.srsStates).toEqual(stateSnapshot);
      expect(localStorage.getItem(STORAGE_KEY)).toBe(storageSnapshot);
    }
  });
});

// #189 finding 13: migrateConjugationKeys re-keys a legacy positional id
// ("1-presens") onto the canonical verb id ("vara-presens") on every read.
// Two edge cases were previously argued only in a comment above the
// implementation and had no test pinning them.
describe('migrateConjugationKeys - #189 finding 13 edge cases', () => {
  // This suite swaps the getVerbs fixture. restoreMocks only restores
  // vi.spyOn spies, not the module-factory vi.fn, so without this cleanup
  // the swap would leak into every suite that runs after this one.
  afterEach(() => {
    vi.mocked(getVerbs).mockResolvedValue(FIXTURE_VERBS);
  });

  // Both variants seed the same two items in opposite key order, since
  // Object.entries order is the only thing that could make an
  // insertion-order-dependent implementation look correct by accident.
  it.each([
    ['positional key first', ['1-presens', 'vara-presens']],
    ['canonical key first', ['vara-presens', '1-presens']],
  ] as const)(
    'an already-canonical key wins a collision with its legacy positional twin (%s)',
    async (_label, keyOrder) => {
      vi.mocked(getVerbs).mockResolvedValue([{ id: 'vara', infinitive: 'vara', cefr: 'A1' }]);

      const states: Record<string, unknown> = {
        '1-presens': {
          itemId: '1-presens',
          repetitions: 9,
          intervalDays: 300,
          easeFactor: 2.6,
          dueAt: FIXED_NOW,
        },
        'vara-presens': {
          itemId: 'vara-presens',
          repetitions: 3,
          intervalDays: 16,
          easeFactor: 2.5,
          dueAt: FIXED_NOW,
        },
      };
      const orderedItems: Record<string, unknown> = {};
      for (const key of keyOrder) orderedItems[key] = states[key];
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, items: orderedItems }));

      const { result } = renderHook(() => useSrsProgress());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      // The canonical key's own progress survives, not the legacy twin's.
      expect(result.current.srsStates['vara-presens']?.repetitions).toBe(3);
      // The legacy positional key is discarded, not kept alongside the winner.
      expect(result.current.srsStates['1-presens']).toBeUndefined();
    },
  );

  it("keeps a positional key past the end of today's verb table verbatim in state, dropping nothing", async () => {
    // Default fixture mock (2 verbs): position 999 has no canonicalVerbIds
    // entry at all, so the key cannot be a stale-but-resolvable rewrite - it
    // is simply out of range.
    const outOfRangeState = {
      itemId: '999-presens',
      repetitions: 4,
      intervalDays: 10,
      easeFactor: 2.5,
      dueAt: FIXED_NOW,
    };
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 2, items: { '999-presens': outOfRangeState } }),
    );

    const { result, unmount } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.srsStates['999-presens']).toMatchObject({ repetitions: 4 });

    // Verbatim in the persisted store too - an out-of-range key is not
    // derivable, so the save path must never treat it as prunable. The
    // write is coalesced (issue #253); unmounting flushes it.
    unmount();
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
    expect(stored.items['999-presens']).toMatchObject({ repetitions: 4 });
  });
});

// Issue #251: exportData writes a whole-app envelope (src/lib/backup.ts) —
// the SRS schedule at the top level in the persisted {version, items} shape,
// every other swedish-verbs-* store under `stores`. These pin the hook-level
// contract on top of the pure backup.ts unit tests (src/lib/backup.test.ts):
// a structurally valid envelope restores both the schedule and the sibling
// stores in one call, and anything the backup module reports as invalid
// leaves the hook's in-memory state and localStorage exactly as they were.
describe('importData - whole-app envelope (issue #251)', () => {
  it('restores srsStates and writes the settings store when importing a whole-app envelope carrying a version-2 SRS payload', async () => {
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const envelope = JSON.stringify({
      app: 'ordboj',
      backupVersion: 2,
      exportedAt: new Date(FIXED_NOW).toISOString(),
      // A version-2 SRS payload inside the whole-app file: the import path
      // must run it through the same v2 -> v3 ladder as an SRS-only file.
      version: 2,
      items: {
        '1-presens': {
          itemId: '1-presens',
          repetitions: 5,
          intervalDays: 10,
          easeFactor: 2.2,
          dueAt: FIXED_NOW,
        },
      },
      stores: {
        'swedish-verbs-settings': { theme: 'dark' },
      },
    });

    let importResult: boolean | undefined;
    act(() => {
      importResult = result.current.importData(envelope);
    });

    expect(importResult).toBe(true);
    // v3 -> v4 (ORD-88) backfill applies to imports too: no lastGrade on
    // this fixture, but repetitions > 0 means it is real practice history,
    // not an untouched item, so firstSeenAt is still derived.
    expect(result.current.srsStates).toEqual({
      '1-presens': {
        itemId: '1-presens',
        repetitions: 5,
        intervalDays: 10,
        easeFactor: 2.2,
        dueAt: FIXED_NOW,
        firstSeenAt: FIXED_NOW - 10 * 24 * 60 * 60 * 1000,
      },
    });
    expect(localStorage.getItem('swedish-verbs-settings')).toBe(JSON.stringify({ theme: 'dark' }));
    // Import persists synchronously (persistNow), so a tab killed right
    // after the success toast still holds the imported schedule.
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
    expect(stored.version).toBe(STORAGE_VERSION);
    expect(stored.items['1-presens']).toMatchObject({ repetitions: 5 });
  });

  const invalidEnvelopes: Array<[string, unknown]> = [
    ['a foreign app token', { app: 'anki', backupVersion: 2, version: 2, items: {}, stores: {} }],
    [
      'a string backupVersion',
      { app: 'ordboj', backupVersion: '2', version: 2, items: {}, stores: {} },
    ],
    [
      'a zero backupVersion',
      { app: 'ordboj', backupVersion: 0, version: 2, items: {}, stores: {} },
    ],
    [
      'a non-integer backupVersion',
      { app: 'ordboj', backupVersion: 2.5, version: 2, items: {}, stores: {} },
    ],
    [
      'a backupVersion newer than this build understands',
      { app: 'ordboj', backupVersion: 99, version: 2, items: {}, stores: {} },
    ],
    ['stores as an array', { app: 'ordboj', backupVersion: 2, version: 2, items: {}, stores: [] }],
    ['stores missing entirely', { app: 'ordboj', backupVersion: 2, version: 2, items: {} }],
    [
      'a backupVersion-1 file with no swedish-verbs-srs-progress key',
      {
        app: 'ordboj',
        backupVersion: 1,
        exportedAt: '2026-01-01T00:00:00.000Z',
        'swedish-verbs-settings': { theme: 'dark' },
      },
    ],
  ];

  it.each(invalidEnvelopes)(
    'returns false and leaves srsStates and localStorage untouched for %s',
    async (_label, payload) => {
      const { result } = renderHook(() => useSrsProgress());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      act(() => {
        result.current.recordAnswer('1-presens', 5);
      });
      await waitFor(() => expect(result.current.srsStates['1-presens']?.repetitions).toBe(1));

      await settlePersistence(reflectsRecordedAnswer(1));
      const stateSnapshot = JSON.parse(JSON.stringify(result.current.srsStates));
      const storageSnapshot = localStorage.getItem(STORAGE_KEY);
      const settingsSnapshot = localStorage.getItem('swedish-verbs-settings');

      let importResult: boolean | undefined;
      act(() => {
        importResult = result.current.importData(JSON.stringify(payload));
      });

      expect(importResult).toBe(false);
      expect(result.current.srsStates).toEqual(stateSnapshot);
      expect(localStorage.getItem(STORAGE_KEY)).toBe(storageSnapshot);
      expect(localStorage.getItem('swedish-verbs-settings')).toBe(settingsSnapshot);
    },
  );

  it('returns false and leaves state untouched when an envelope item is filed under a mismatched map key', async () => {
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.recordAnswer('1-presens', 5);
    });
    await waitFor(() => expect(result.current.srsStates['1-presens']?.repetitions).toBe(1));

    await settlePersistence(reflectsRecordedAnswer(1));
    const stateSnapshot = JSON.parse(JSON.stringify(result.current.srsStates));
    const storageSnapshot = localStorage.getItem(STORAGE_KEY);

    const mismatchedEnvelope = JSON.stringify({
      app: 'ordboj',
      backupVersion: 2,
      version: 2,
      items: {
        '1-presens': {
          // itemId disagrees with the map key it is filed under (issue #251
          // acceptance: itemId must match key).
          itemId: '1-preteritum',
          repetitions: 3,
          intervalDays: 6,
          easeFactor: 2.0,
          dueAt: FIXED_NOW,
        },
      },
      stores: {},
    });

    let importResult: boolean | undefined;
    act(() => {
      importResult = result.current.importData(mismatchedEnvelope);
    });

    expect(importResult).toBe(false);
    expect(result.current.srsStates).toEqual(stateSnapshot);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(storageSnapshot);
  });
});

// Issue #251 acceptance: the load-path quarantine (quarantineInvalidItems in
// src/hooks/useSrsProgress.ts) must not let one unreadable entry poison its
// siblings, and must not silently delete bytes it cannot read - they are
// written back verbatim so a later build has a chance to read them. The
// item id '5-presens' in the first two tests deliberately names a verb
// absent from FIXTURE_VERBS (only ids '1' and '2' exist), so those tests are
// isolated to the quarantine mechanism itself; the last two use ids the
// schedulers *can* serve, which is where the destructive interactions live.
describe('load-path quarantine (issue #251)', () => {
  it('loads the valid item normally and keeps a structurally invalid entry (bad dueAt) out of srsStates, while preserving it verbatim in storage after an unrelated write', async () => {
    const validItem = {
      itemId: '1-presens',
      repetitions: 2,
      intervalDays: 6,
      easeFactor: 2.5,
      dueAt: FIXED_NOW - 1000, // already due
    };
    const malformedItem = {
      itemId: '5-presens',
      repetitions: 1,
      intervalDays: 1,
      easeFactor: 2.5,
      dueAt: null, // not a finite number: fails isStoredSrsState
    };

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 2,
        items: {
          '1-presens': validItem,
          '5-presens': malformedItem,
        },
      }),
    );

    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // The valid item loaded untouched and is schedulable. v3 -> v4 (ORD-88)
    // backfills firstSeenAt on read for a practised item (repetitions > 0):
    // dueAt - intervalDays * 24h, per backfillFirstSeenAt.
    expect(result.current.srsStates['1-presens']).toEqual({
      ...validItem,
      firstSeenAt: validItem.dueAt - validItem.intervalDays * 24 * 60 * 60 * 1000,
    });
    const due = await result.current.getDueItems();
    expect(due.map((i) => i.itemId)).toContain('1-presens');

    // The malformed item never reaches the scheduler.
    expect(result.current.srsStates).not.toHaveProperty('5-presens');

    // An unrelated answer still writes it back to disk, byte for byte.
    act(() => {
      result.current.recordAnswer('1-presens', 5);
    });
    await waitFor(() => expect(result.current.srsStates['1-presens']!.repetitions).toBe(3));
    await settlePersistence(reflectsRecordedAnswer(3));

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
    expect(stored.items['5-presens']).toEqual(malformedItem);
  });

  it('keeps an entry whose itemId disagrees with its map key out of srsStates, and still writes it back verbatim', async () => {
    const malformedItem = {
      // Structurally a valid state on its own, but filed under a different
      // key below - the mismatch is what makes it invalid.
      itemId: 'nonsense',
      repetitions: 1,
      intervalDays: 1,
      easeFactor: 2.5,
      dueAt: FIXED_NOW,
    };

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 2,
        items: {
          '5-presens': malformedItem,
        },
      }),
    );

    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.srsStates).not.toHaveProperty('5-presens');

    act(() => {
      result.current.recordAnswer('1-presens', 5);
    });
    await waitFor(() => expect(result.current.srsStates['1-presens']?.repetitions).toBe(1));
    await settlePersistence(reflectsRecordedAnswer(1));

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
    expect(stored.items['5-presens']).toEqual(malformedItem);
  });

  // Regression test for the eager-init overwrite bug (#251 round 1, first
  // fixed in 7e1c905): this one deliberately uses '1-presens', an id that IS
  // an eager-init id for FIXTURE_VERBS. Without the skips, the load effect
  // stamps a fresh initializeSrsState('1-presens') over the quarantined id,
  // getDueItems serves it as due, and the first recordAnswer writes a
  // non-pristine fresh state that wins the { ...quarantined, ...items }
  // spread on save — silently replacing bytes this build could not read
  // with a zeroed schedule. Under v3 the eager-init skip alone is not
  // enough: getDueItems treats a missing key as "new, due now", so it must
  // apply the same skip.
  it('does not let eager init or getDueItems resurrect a quarantined entry that shares an id with a live verb x form', async () => {
    const malformedItem = {
      // A version-3 store: no itemId (the key is the id); dueAt is not a
      // finite number, so the entry fails isStoredSrsState.
      repetitions: 1,
      intervalDays: 1,
      easeFactor: 2.5,
      dueAt: null,
    };

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 3,
        items: {
          '1-presens': malformedItem,
        },
      }),
    );

    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // (i) The quarantined id never reaches the scheduler - not even as a
    // fresh eager-init state.
    expect(result.current.srsStates).not.toHaveProperty('1-presens');

    // (ii) getDueItems does not serve it as a new item either, even though
    // a missing key normally means "new, due now" under v3.
    const due = await result.current.getDueItems();
    expect(due.map((i) => i.itemId)).not.toContain('1-presens');

    // (iii) The bytes on disk are exactly what was seeded, immediately
    // after load...
    let stored = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
    expect(stored.items['1-presens']).toEqual(malformedItem);

    // ...and still exactly that after an unrelated write.
    act(() => {
      result.current.recordAnswer('2-presens', 5);
    });
    await waitFor(() => expect(result.current.srsStates['2-presens']!.repetitions).toBe(1));
    await settlePersistence(
      (s) =>
        (s as { items?: Record<string, { repetitions?: number }> }).items?.['2-presens']
          ?.repetitions === 1,
    );

    stored = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
    expect(stored.items['1-presens']).toEqual(malformedItem);
  });

  // Regression test for the particle-sitting overwrite bug (#251 round 2,
  // first fixed in 5c941dd): getParticleSitting reads srsStates, which
  // never contains a quarantined entry - so without the skip a quarantined
  // particle cloze looks exactly like "verb never introduced", and
  // buildParticleSitting serves it as new material. The next recordAnswer
  // on that card would then write a fresh state under the same key, which
  // wins the { ...quarantined, ...items } spread on save and destroys the
  // bytes quarantine exists to keep. Uses a real, verified entry from
  // PARTICLE_VERB_DATA (not a fixture) because particleQueue.ts resolves
  // the base verb id through the real `verbs` array (verbIdByInfinitive in
  // src/lib/particleQueue.ts), which this suite does not mock.
  it('getParticleSitting does not serve a particle verb whose cloze is quarantined as new introduction material, and the write-back stays byte-for-byte', async () => {
    const particleId = 'pv:ga-ut'; // baseInfinitive 'gå', reflexive 'none', verified
    const baseInfinitive = 'gå';
    const baseVerbId = verbs.find((v) => v.infinitive === baseInfinitive)?.id;
    if (!baseVerbId) {
      throw new Error(`fixture error: "${baseInfinitive}" is not in VERB_DATA`);
    }

    const clozeId = particleItemId(particleId, 'cloze');
    // Malformed enough to be quarantined (dueAt is not a finite number, so
    // it fails isStoredSrsState), and carrying a field this build does not
    // know about - proof that quarantine preserves unknown bytes verbatim
    // rather than re-serializing only the fields it understands.
    const malformedCloze = {
      itemId: clozeId,
      repetitions: 1,
      intervalDays: 1,
      easeFactor: 2.5,
      dueAt: null,
      fromAFutureBuild: 'do not lose me',
    };

    // The base verb must clear the introduction gate (repetitions >= 2 on
    // both presens and preteritum; BASE_VERB_GATE_REPETITIONS in
    // src/lib/particleQueue.ts) - 5 is comfortably past it.
    const readyBaseState = (form: 'presens' | 'preteritum') => ({
      itemId: conjugationItemId(baseVerbId, form),
      repetitions: 5,
      intervalDays: 30,
      easeFactor: 2.5,
      dueAt: FIXED_NOW - 1000,
    });

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 2,
        items: {
          [conjugationItemId(baseVerbId, 'presens')]: readyBaseState('presens'),
          [conjugationItemId(baseVerbId, 'preteritum')]: readyBaseState('preteritum'),
          [clozeId]: malformedCloze,
        },
      }),
    );

    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // (a) The malformed cloze never reaches the scheduler.
    expect(result.current.srsStates).not.toHaveProperty(clozeId);

    // (b) The verb is not served as new material by the particle sitting -
    // neither as a placed card nor as a deferred first cloze.
    const sitting = result.current.getParticleSitting(20);
    expect(sitting.cards.some((card) => card.entry.id === particleId)).toBe(false);
    expect(sitting.deferredFirstClozes).not.toContain(particleId);

    // (c) An unrelated answer on the (fixture) conjugation deck still writes
    // the quarantined cloze back to disk exactly as seeded.
    act(() => {
      result.current.recordAnswer('1-presens', 5);
    });
    await waitFor(() => expect(result.current.srsStates['1-presens']!.repetitions).toBe(1));
    await settlePersistence(reflectsRecordedAnswer(1));

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
    expect(stored.items[clozeId]).toEqual(malformedCloze);
  });
});

describe('importData - refuses while the store is still loading (issue #251 review)', () => {
  // The load effect is async. An import accepted before it resolves would
  // write the sibling stores to disk and swap srsStates in memory, while
  // persistNow no-ops on its own isLoading guard - and then the load effect
  // completes and clobbers srsStates (and the quarantine ref) with
  // pre-import data: success toast, siblings changed, schedule not
  // imported. canonicalVerbIdsRef is also still [] at that point, so legacy
  // keys would skip re-keying. importData must refuse outright until
  // loading is done.
  it('returns false and writes nothing (neither sibling stores nor schedule) when called before loading resolves, then accepts the same file afterwards', async () => {
    const preImportStore = JSON.stringify({
      version: 3,
      items: {
        '1-presens': { repetitions: 2, intervalDays: 6, easeFactor: 2.5, dueAt: FIXED_NOW },
      },
    });
    localStorage.setItem(STORAGE_KEY, preImportStore);
    localStorage.setItem('swedish-verbs-settings', JSON.stringify({ theme: 'light' }));

    const envelope = JSON.stringify({
      app: 'ordboj',
      backupVersion: 2,
      version: 3,
      items: {
        '1-presens': { repetitions: 9, intervalDays: 30, easeFactor: 2.8, dueAt: FIXED_NOW },
      },
      stores: {
        'swedish-verbs-settings': { theme: 'dark' },
      },
    });

    const { result } = renderHook(() => useSrsProgress());
    // Deliberately no waitFor here: the import races the load effect.
    expect(result.current.isLoading).toBe(true);

    let importResult: boolean | undefined;
    act(() => {
      importResult = result.current.importData(envelope);
    });

    expect(importResult).toBe(false);
    // Nothing reached disk: not the sibling store, not the schedule.
    expect(localStorage.getItem('swedish-verbs-settings')).toBe(JSON.stringify({ theme: 'light' }));
    expect(localStorage.getItem(STORAGE_KEY)).toBe(preImportStore);

    // The load effect completes onto the pre-import store, unclobbered.
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.srsStates['1-presens']).toMatchObject({ repetitions: 2 });

    // Only the timing was wrong with the file: the same import succeeds
    // once loading is done.
    act(() => {
      importResult = result.current.importData(envelope);
    });
    expect(importResult).toBe(true);
    expect(result.current.srsStates['1-presens']).toMatchObject({ repetitions: 9 });
    expect(localStorage.getItem('swedish-verbs-settings')).toBe(JSON.stringify({ theme: 'dark' }));
  });
});

describe('importData - refuses while the store is read-only (issue #251, #241)', () => {
  // #241's read-only guard stops *scheduled writes* from clobbering a
  // newer-build store, but importData needs its own check: without it a
  // read-only session would validate the file, call restoreAppStores (a
  // real write to sibling stores), and swap srsStates in memory - all while
  // the schedule store's on-disk bytes were never going to change. This
  // pins that a read-only session refuses the whole import, sibling stores
  // included, rather than half-applying it.
  it('returns false and leaves both the settings store and the SRS store bytes untouched when the store is read-only', async () => {
    // Must stay ahead of STORAGE_VERSION, never a literal (staff-engineer
    // blocking finding #2, ORD-88): a hardcoded 4 stopped exercising the
    // forward-compat guard the moment v4 (this build) shipped, since a
    // same-version store is not "newer" and isReadOnly would silently start
    // asserting false, passing for the wrong reason.
    const readOnlyStore = JSON.stringify({ version: STORAGE_VERSION + 1, items: {} });
    localStorage.setItem(STORAGE_KEY, readOnlyStore);
    localStorage.setItem('swedish-verbs-settings', JSON.stringify({ theme: 'light' }));

    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isReadOnly).toBe(true);

    const envelope = JSON.stringify({
      app: 'ordboj',
      backupVersion: 2,
      version: 2,
      items: {
        '1-presens': {
          itemId: '1-presens',
          repetitions: 3,
          intervalDays: 6,
          easeFactor: 2.0,
          dueAt: FIXED_NOW,
        },
      },
      stores: {
        'swedish-verbs-settings': { theme: 'dark' },
      },
    });

    let importResult: boolean | undefined;
    act(() => {
      importResult = result.current.importData(envelope);
    });

    expect(importResult).toBe(false);
    expect(localStorage.getItem('swedish-verbs-settings')).toBe(JSON.stringify({ theme: 'light' }));
    expect(localStorage.getItem(STORAGE_KEY)).toBe(readOnlyStore);
  });
});

// Issue #251 acceptance: "export produces a versioned whole-app envelope ...
// import round-trips it". Every other test in this file either drives
// importData with a hand-built envelope literal, or exercises buildAppBackup
// directly (src/lib/backup.test.ts) — neither calls the hook's own
// exportData() and feeds its actual output back into its own importData().
// That handoff is the one place a shape mismatch between the writer
// (buildAppBackup) and the reader (readAppBackup + validateImportedProgress)
// would hide: the two sides are unit-tested in isolation, but never proven
// to agree on the wire format they exchange.
describe('exportData -> importData round-trip through the real store (issue #251)', () => {
  it('restores a prior in-memory schedule and the settings store to exactly what was exported, discarding changes made after the export', async () => {
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    localStorage.setItem('swedish-verbs-settings', JSON.stringify({ theme: 'dark' }));

    act(() => {
      result.current.recordAnswer('1-presens', 5);
    });
    await waitFor(() => expect(result.current.srsStates['1-presens']?.repetitions).toBe(1));

    const exported = result.current.exportData();

    // Diverge from the exported snapshot: a second answer changes the
    // schedule, and the settings store changes underneath it too.
    act(() => {
      result.current.recordAnswer('1-presens', 5);
    });
    await waitFor(() => expect(result.current.srsStates['1-presens']?.repetitions).toBe(2));
    localStorage.setItem('swedish-verbs-settings', JSON.stringify({ theme: 'light' }));

    let importResult: boolean | undefined;
    act(() => {
      importResult = result.current.importData(exported);
    });

    expect(importResult).toBe(true);
    // The schedule is back to what it was at export time, not the
    // post-export state.
    expect(result.current.srsStates['1-presens']?.repetitions).toBe(1);
    // ORD-88: firstSeenAt is stamped by the first recordAnswer above and
    // must survive the export -> import round trip unchanged, not be
    // re-derived by the v3 -> v4 backfill (it was never missing in the
    // first place) and not be dropped by exportData's toStoredItems.
    expect(result.current.srsStates['1-presens']?.firstSeenAt).toBe(FIXED_NOW);
    // The settings store, carried in the envelope's `stores`, is restored
    // too - this is the part a bare SRS-only export/import could not do.
    expect(localStorage.getItem('swedish-verbs-settings')).toBe(JSON.stringify({ theme: 'dark' }));
  });
});

// Issue #251 acceptance: a rejected import "leaves state untouched". The
// invalidEnvelopes cases above all reject at the structural-validation stage
// (readAppBackup / validateImportedProgress). This covers the other failure
// branch in importData: a structurally valid envelope whose sibling-store
// write fails (quota exceeded) mid-restore. The schedule must never be
// swapped in when that happens, and the failing store write must already
// have rolled itself back (restoreAppStores' own contract, pinned at the
// unit level in src/lib/backup.test.ts) - this test pins that the *hook*
// honours both halves of that contract instead of, say, applying the
// schedule regardless of whether the stores restored.
describe('importData - envelope store-write failure rolls back cleanly (issue #251)', () => {
  it('returns false and leaves srsStates, the SRS store and the settings store untouched when a sibling store write throws (quota exceeded)', async () => {
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    localStorage.setItem('swedish-verbs-settings', JSON.stringify({ theme: 'light' }));

    act(() => {
      result.current.recordAnswer('1-presens', 5);
    });
    await waitFor(() => expect(result.current.srsStates['1-presens']?.repetitions).toBe(1));

    await settlePersistence(reflectsRecordedAnswer(1));
    const stateSnapshot = JSON.parse(JSON.stringify(result.current.srsStates));
    const srsStorageSnapshot = localStorage.getItem(STORAGE_KEY);

    const realSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (key === 'swedish-verbs-settings') {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      }
      return realSetItem.call(this, key, value);
    });

    const envelope = JSON.stringify({
      app: 'ordboj',
      backupVersion: 2,
      version: 2,
      items: {
        '1-presens': {
          itemId: '1-presens',
          repetitions: 9,
          intervalDays: 30,
          easeFactor: 2.8,
          dueAt: FIXED_NOW,
        },
      },
      stores: {
        'swedish-verbs-settings': { theme: 'dark' },
      },
    });

    let importResult: boolean | undefined;
    act(() => {
      importResult = result.current.importData(envelope);
    });

    expect(importResult).toBe(false);
    // The schedule was never swapped in.
    expect(result.current.srsStates).toEqual(stateSnapshot);
    // The failed store write rolled back to its pre-import bytes rather
    // than being left half-written.
    expect(localStorage.getItem('swedish-verbs-settings')).toBe(JSON.stringify({ theme: 'light' }));
    // A rejected import never even attempts to persist the schedule.
    expect(localStorage.getItem(STORAGE_KEY)).toBe(srsStorageSnapshot);
  });
});

// Issue #403: the per-answer diagnostic log (src/lib/answerLog.ts,
// src/hooks/useAnswerLog.ts) is disposable telemetry, not progress, but
// resetProgress and importData both delete its stored key -- "reset all
// progress" and "replace the schedule" both make the log's history disagree
// with the schedule it was describing (decision doc section 6). Deleting the
// stored key alone is not enough: the SRS hook and the answer-log hook are
// mounted independently, so a co-mounted useAnswerLog instance would still
// hold the pre-reset/pre-import entries in memory and write them straight
// back on its next logAnswer, unless it hears the clear event too.
function storedLogEntryIds(): string[] {
  const raw = localStorage.getItem(ANSWER_LOG_STORAGE_KEY);
  if (raw === null) throw new Error('expected the answer log key to be written');
  return (JSON.parse(raw) as { entries: AnswerLogEntry[] }).entries.map((e) => e.i);
}

describe('resetProgress clears the answer log too (issue #403)', () => {
  it('removes swedish-verbs-answer-log and fires the clear event so a co-mounted useAnswerLog empties its in-memory buffer', async () => {
    localStorage.setItem(
      ANSWER_LOG_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        entries: [{ t: 1, i: 'pv:pre-reset', m: 'typed', k: true, f: 0 }],
      }),
    );

    // Mounted before the SRS hook, exactly like two independent components
    // in the real app: this hook's load effect reads the seeded entry into
    // its own in-memory buffer.
    const logHook = renderHook(() => useAnswerLog());

    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.resetProgress();
    });

    expect(localStorage.getItem(ANSWER_LOG_STORAGE_KEY)).toBeNull();

    // If the co-mounted hook's buffer had NOT been cleared, this write
    // would carry 'pv:pre-reset' along with the new entry.
    act(() => {
      logHook.result.current.logAnswer({ i: 'pv:post-reset', m: 'typed', k: true, f: 0 });
    });
    logHook.unmount(); // dispose() flushes the pending write synchronously

    expect(storedLogEntryIds()).toEqual(['pv:post-reset']);
  });
});

describe('importData clears the answer log too (issue #403)', () => {
  it('removes swedish-verbs-answer-log and fires the clear event so a co-mounted useAnswerLog empties its in-memory buffer', async () => {
    localStorage.setItem(
      ANSWER_LOG_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        entries: [{ t: 1, i: 'pv:pre-import', m: 'typed', k: true, f: 0 }],
      }),
    );

    const logHook = renderHook(() => useAnswerLog());

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

    expect(localStorage.getItem(ANSWER_LOG_STORAGE_KEY)).toBeNull();

    // Same proof as resetProgress above: a write from the co-mounted hook
    // after the import carries only the post-import entry.
    act(() => {
      logHook.result.current.logAnswer({ i: 'pv:post-import', m: 'typed', k: true, f: 0 });
    });
    logHook.unmount();

    expect(storedLogEntryIds()).toEqual(['pv:post-import']);
  });
});

describe('exportData does not carry the answer log (issue #403)', () => {
  it('the exported envelope has no answer log entry anywhere in it, and still reports the current storage version', async () => {
    localStorage.setItem(
      ANSWER_LOG_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        entries: [{ t: 1, i: 'pv:should-not-export', m: 'typed', k: true, f: 0 }],
      }),
    );

    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const exported = result.current.exportData();
    const parsed = JSON.parse(exported);

    expect(parsed.version).toBe(STORAGE_VERSION);
    expect(parsed.stores).not.toHaveProperty(ANSWER_LOG_STORAGE_KEY);
    // Belt and braces: the log entry's own id string never appears anywhere
    // in the exported bytes.
    expect(exported).not.toContain('pv:should-not-export');
  });
});

describe('a throwing answer-log write does not stop the progress store persisting (issue #403, criterion 6)', () => {
  it('keeps recordAnswer persisting to swedish-verbs-srs-progress when the co-mounted answer log write throws quota exceeded', async () => {
    // Only the answer-log key is made to throw. The progress store writes
    // through the same setItem, so a real setItem is required for every
    // other key or this test would prove nothing about the two stores being
    // independent.
    const real = Storage.prototype.setItem;
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (key === ANSWER_LOG_STORAGE_KEY) {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      }
      real.call(this, key, value);
    });

    try {
      // Mounted together, exactly like two independent components in the
      // real app (same pattern as "resetProgress clears the answer log
      // too" above).
      const logHook = renderHook(() => useAnswerLog());

      const { result } = renderHook(() => useSrsProgress());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(() => {
        act(() => {
          logHook.result.current.logAnswer({
            i: 'pv:quota-during-answer',
            m: 'typed',
            k: true,
            f: 0,
          });
          result.current.recordAnswer('1-presens', 5);
        });
        // Force the log's pending write to actually hit the throwing
        // setItem now, inside this act/expect, rather than leaving it
        // armed on the real 500ms coalesced-writer timer (this suite only
        // fakes Date, so vi.advanceTimersByTime would not fire it).
        logHook.unmount();
      }).not.toThrow();

      // The progress store's own write is still on its real 500ms timer;
      // wait for it to land rather than asserting on a stale snapshot.
      await settlePersistence(reflectsRecordedAnswer(1));

      const storedProgress = localStorage.getItem(STORAGE_KEY);
      expect(storedProgress).not.toBeNull();
      const parsedProgress = JSON.parse(storedProgress as string) as {
        items?: Record<string, { repetitions?: number }>;
      };
      expect(parsedProgress.items?.['1-presens']?.repetitions).toBe(1);

      // The log write never reached disk: real.call was never invoked for
      // this key, so it stays exactly as unset as it started.
      expect(localStorage.getItem(ANSWER_LOG_STORAGE_KEY)).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });
});
