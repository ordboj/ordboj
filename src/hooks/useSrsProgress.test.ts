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

// issue #26: answeredToday is the counter Practice.tsx bounds the session
// against. Stored at its own key ('swedish-verbs-daily-count') as
// { version, date, count }, separate from the irreplaceable SRS envelope.
describe('answeredToday', () => {
  const DAILY_COUNT_KEY = 'swedish-verbs-daily-count';

  it('starts at 0 when the key is absent', async () => {
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.answeredToday).toBe(0);
  });

  it('increments by exactly one per recordAnswer call, right or wrong (grade 0 still counts)', async () => {
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.recordAnswer('1-presens', 5));
    await waitFor(() => expect(result.current.answeredToday).toBe(1));

    act(() => result.current.recordAnswer('1-preteritum', 0));
    await waitFor(() => expect(result.current.answeredToday).toBe(2));
  });

  it('twelve answers in a row raise answeredToday 1..12 and persist a final stored count of 12', async () => {
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const grades: Array<0 | 5> = [5, 5, 5, 0, 5, 5, 5, 0, 5, 5, 5, 5];
    for (let i = 0; i < grades.length; i++) {
      const itemId = ALL_ITEM_IDS[i % ALL_ITEM_IDS.length];
      act(() => result.current.recordAnswer(itemId, grades[i]));
      await waitFor(() => expect(result.current.answeredToday).toBe(i + 1));
    }

    const stored = JSON.parse(localStorage.getItem(DAILY_COUNT_KEY) as string);
    expect(stored).toEqual({ version: 1, date: '2026-01-01', count: 12 });
  });

  it('persists {version, date, count} to its own key and re-reads it verbatim on remount', async () => {
    const first = renderHook(() => useSrsProgress());
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));

    act(() => first.result.current.recordAnswer('1-presens', 5));
    await waitFor(() => expect(first.result.current.answeredToday).toBe(1));

    const stored = JSON.parse(localStorage.getItem(DAILY_COUNT_KEY) as string);
    expect(stored).toEqual({ version: 1, date: '2026-01-01', count: 1 });

    first.unmount();

    const second = renderHook(() => useSrsProgress());
    await waitFor(() => expect(second.result.current.isLoading).toBe(false));
    expect(second.result.current.answeredToday).toBe(1);
  });

  it('resets to 0 when the local date has rolled over since the stored count', async () => {
    localStorage.setItem(
      DAILY_COUNT_KEY,
      JSON.stringify({ version: 1, date: '2025-12-31', count: 11 }),
    );

    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.answeredToday).toBe(0);

    // The next answer starts a fresh day's count rather than resuming
    // yesterday's 11.
    act(() => result.current.recordAnswer('1-presens', 5));
    await waitFor(() => expect(result.current.answeredToday).toBe(1));
    const stored = JSON.parse(localStorage.getItem(DAILY_COUNT_KEY) as string);
    expect(stored).toEqual({ version: 1, date: '2026-01-01', count: 1 });
  });

  it('resumes an in-progress day: a stored count for today is read back as-is on mount', async () => {
    localStorage.setItem(
      DAILY_COUNT_KEY,
      JSON.stringify({ version: 1, date: '2026-01-01', count: 7 }),
    );

    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.answeredToday).toBe(7);
  });

  it('does not throw and collapses to 0 on malformed JSON at the daily-count key', async () => {
    localStorage.setItem(DAILY_COUNT_KEY, '{not valid json!!');

    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.answeredToday).toBe(0);
  });

  it.each([
    ['a null payload', 'null'],
    ['an array payload', '[1,2,3]'],
    ['a missing count field', JSON.stringify({ version: 1, date: '2026-01-01' })],
    ['a non-numeric count', JSON.stringify({ version: 1, date: '2026-01-01', count: 'lots' })],
    ['a negative count', JSON.stringify({ version: 1, date: '2026-01-01', count: -3 })],
    ['a non-finite count', JSON.stringify({ version: 1, date: '2026-01-01', count: Infinity })],
    ['a malformed date', JSON.stringify({ version: 1, date: '01/01/2026', count: 5 })],
    ['a missing date field', JSON.stringify({ version: 1, count: 5 })],
  ])('collapses to answeredToday 0 on %s', async (_label, raw) => {
    localStorage.setItem(DAILY_COUNT_KEY, raw);

    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.answeredToday).toBe(0);
  });

  it('does not discard a newer-version payload whose date/count are still structurally valid', async () => {
    localStorage.setItem(
      DAILY_COUNT_KEY,
      JSON.stringify({ version: 2, date: '2026-01-01', count: 5, someFutureField: 'x' }),
    );

    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.answeredToday).toBe(5);
  });

  it('does not crash when localStorage.setItem throws (quota exceeded); the in-memory count still advances', async () => {
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    });

    expect(() => {
      act(() => result.current.recordAnswer('1-presens', 5));
    }).not.toThrow();

    await waitFor(() => expect(result.current.answeredToday).toBe(1));
  });

  it('resetProgress zeroes the daily count as well as the schedule', async () => {
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.recordAnswer('1-presens', 5));
    await waitFor(() => expect(result.current.answeredToday).toBe(1));

    act(() => result.current.resetProgress());
    await waitFor(() => expect(result.current.answeredToday).toBe(0));

    const stored = JSON.parse(localStorage.getItem(DAILY_COUNT_KEY) as string);
    expect(stored.count).toBe(0);
  });

  it('re-derives to 0 when the clock crosses local midnight during an open session, without a fresh recordAnswer', async () => {
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.recordAnswer('1-presens', 5));
    await waitFor(() => expect(result.current.answeredToday).toBe(1));

    // Cross local midnight without any further interaction, then trigger a
    // fresh answer - answeredToday is re-derived against "now" on every
    // render (not cached from the earlier one), so it starts a new day's
    // count instead of carrying yesterday's 1 forward.
    vi.setSystemTime(FIXED_NOW + 24 * 60 * 60 * 1000 + 1000);
    act(() => {
      result.current.recordAnswer('1-preteritum', 5);
    });
    await waitFor(() => expect(result.current.answeredToday).toBe(1));

    const stored = JSON.parse(localStorage.getItem(DAILY_COUNT_KEY) as string);
    expect(stored.date).toBe('2026-01-02');
    expect(stored.count).toBe(1);
  });
});
