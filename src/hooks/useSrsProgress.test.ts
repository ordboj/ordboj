import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useSrsProgress, getRequeueInsertIndex, type PracticeItem } from '@/hooks/useSrsProgress';
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

describe('getRequeueInsertIndex - pure requeue-position function', () => {
  it('places the item REQUEUE_GAP (3) items past its current position', () => {
    expect(getRequeueInsertIndex(0, 10)).toBe(4);
    expect(getRequeueInsertIndex(2, 10)).toBe(6);
  });

  it('clamps to the end of the queue when the gap would run past it', () => {
    expect(getRequeueInsertIndex(5, 6)).toBe(6);
    expect(getRequeueInsertIndex(0, 2)).toBe(2);
    expect(getRequeueInsertIndex(0, 0)).toBe(0);
  });
});

describe('recordAnswerWithRequeue - in-session relearning queue (docs/learning/lapse-handling.md)', () => {
  it('re-inserts a wrongly-answered item 3 items ahead of its current position', async () => {
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const queue: PracticeItem[] = [
      { verbId: '1', infinitive: 'testa', form: 'presens', itemId: '1-presens' },
      { verbId: '1', infinitive: 'testa', form: 'preteritum', itemId: '1-preteritum' },
      { verbId: '1', infinitive: 'testa', form: 'supinum', itemId: '1-supinum' },
      { verbId: '1', infinitive: 'testa', form: 'imperativ', itemId: '1-imperativ' },
      { verbId: '2', infinitive: 'prova', form: 'presens', itemId: '2-presens' },
      { verbId: '2', infinitive: 'prova', form: 'preteritum', itemId: '2-preteritum' },
    ];

    let newQueue: PracticeItem[] = [];
    act(() => {
      newQueue = result.current.recordAnswerWithRequeue(queue[0], 0, queue, 0);
    });

    // insertAt = min(0 + 1 + 3, 6) = 4
    expect(newQueue.map((i) => i.itemId)).toEqual([
      '1-presens',
      '1-preteritum',
      '1-supinum',
      '1-imperativ',
      '1-presens',
      '2-presens',
      '2-preteritum',
    ]);
  });

  it('clamps the insertion point to the end of a short queue instead of indexing past it', async () => {
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const queue: PracticeItem[] = [
      { verbId: '1', infinitive: 'testa', form: 'presens', itemId: '1-presens' },
      { verbId: '1', infinitive: 'testa', form: 'preteritum', itemId: '1-preteritum' },
    ];

    let newQueue: PracticeItem[] = [];
    act(() => {
      newQueue = result.current.recordAnswerWithRequeue(queue[0], 0, queue, 0);
    });

    expect(newQueue.map((i) => i.itemId)).toEqual(['1-presens', '1-preteritum', '1-presens']);
  });

  it('still applies the SM-2 lapse penalty to srsStates - requeueing does not change scheduling', async () => {
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const item: PracticeItem = {
      verbId: '1',
      infinitive: 'testa',
      form: 'presens',
      itemId: '1-presens',
    };
    act(() => {
      result.current.recordAnswerWithRequeue(item, 0, [item], 0);
    });
    await waitFor(() => expect(result.current.srsStates['1-presens'].intervalDays).toBe(1));
    expect(result.current.srsStates['1-presens'].repetitions).toBe(0);
  });

  it('does not requeue a correct answer (grade 5): the queue comes back unchanged', async () => {
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const queue: PracticeItem[] = [
      { verbId: '1', infinitive: 'testa', form: 'presens', itemId: '1-presens' },
      { verbId: '1', infinitive: 'testa', form: 'preteritum', itemId: '1-preteritum' },
    ];

    let newQueue: PracticeItem[] = [];
    act(() => {
      newQueue = result.current.recordAnswerWithRequeue(queue[0], 5, queue, 0);
    });

    expect(newQueue.map((i) => i.itemId)).toEqual(['1-presens', '1-preteritum']);
  });

  it('does not requeue a hinted-correct answer (grade 3) either', async () => {
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const queue: PracticeItem[] = [
      { verbId: '1', infinitive: 'testa', form: 'presens', itemId: '1-presens' },
      { verbId: '1', infinitive: 'testa', form: 'preteritum', itemId: '1-preteritum' },
    ];

    let newQueue: PracticeItem[] = [];
    act(() => {
      newQueue = result.current.recordAnswerWithRequeue(queue[0], 3, queue, 0);
    });

    expect(newQueue.map((i) => i.itemId)).toEqual(['1-presens', '1-preteritum']);
  });

  it('caps at 2 requeues per item per sitting: a third consecutive wrong answer no longer grows the queue', async () => {
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const item: PracticeItem = {
      verbId: '1',
      infinitive: 'testa',
      form: 'presens',
      itemId: '1-presens',
    };
    let queue: PracticeItem[] = [
      item,
      { verbId: '1', infinitive: 'testa', form: 'preteritum', itemId: '1-preteritum' },
    ];

    act(() => {
      queue = result.current.recordAnswerWithRequeue(item, 0, queue, 0); // 1st requeue: allowed
    });
    expect(queue).toHaveLength(3);

    act(() => {
      queue = result.current.recordAnswerWithRequeue(item, 0, queue, 0); // 2nd requeue: allowed
    });
    expect(queue).toHaveLength(4);

    const lengthBeforeThird = queue.length;
    act(() => {
      queue = result.current.recordAnswerWithRequeue(item, 0, queue, 0); // 3rd: cap reached, no requeue
    });
    expect(queue).toHaveLength(lengthBeforeThird);
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
