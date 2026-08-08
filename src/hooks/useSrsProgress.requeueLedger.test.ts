import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useSrsProgress } from '@/hooks/useSrsProgress';
import { MAX_REQUEUES_PER_DAY } from '@/lib/srs';
import type { ConjugatedVerb, Verb } from '@/lib/verbs';

// Issue #222: "Persist per-day relearning requeue cap across sittings".
// This file pins the store-side (srs-engine) half of the acceptance
// criteria directly against useSrsProgress.ts's public requeuesToday /
// recordRequeue contract and the version-2 -> version-3 envelope, at the
// level of what a caller (Practice.tsx) actually reads and writes -- not by
// inspecting the module's private helpers.
const STORAGE_KEY = 'swedish-verbs-srs-progress';

const FIXTURE_VERBS: Verb[] = [{ id: '1', infinitive: 'testa', cefr: 'A1' }];
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
    getAllConjugatedVerbs: vi.fn(async () => Object.values(FIXTURE_CONJUGATIONS)),
  };
});

const DAY1 = new Date(2026, 0, 15, 10, 0, 0, 0).getTime(); // Jan 15, 2026, 10:00 local
const DAY2 = new Date(2026, 0, 16, 10, 0, 0, 0).getTime(); // Jan 16, 2026, 10:00 local (next local day)

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(DAY1);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('requeuesToday / recordRequeue (issue #222)', () => {
  it('starts at zero for an item that has never been re-queued today', async () => {
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.requeuesToday['1-presens']).toBeUndefined();
  });

  it('increments the count for the given item on each call, and never touches another item', async () => {
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.recordRequeue('1-presens');
    });
    await waitFor(() => expect(result.current.requeuesToday['1-presens']).toBe(1));

    act(() => {
      result.current.recordRequeue('1-presens');
    });
    await waitFor(() => expect(result.current.requeuesToday['1-presens']).toBe(2));

    // A sibling item's count is independent.
    expect(result.current.requeuesToday['1-preteritum']).toBeUndefined();
  });
});

// Acceptance criterion: "reload mid-sitting does not reset the cap." A
// reload re-mounts the whole hook, so the only way this criterion can hold
// is if the count actually round-trips through localStorage rather than
// living in React state that a fresh mount starts empty.
describe('the requeue cap survives a reload mid-sitting (#222 acceptance criterion)', () => {
  it('reports the same spent-cap count after unmount/remount, on the same local day', async () => {
    const first = renderHook(() => useSrsProgress());
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));

    act(() => {
      first.result.current.recordRequeue('1-presens');
      first.result.current.recordRequeue('1-presens');
    });
    await waitFor(() => expect(first.result.current.requeuesToday['1-presens']).toBe(2));
    expect(first.result.current.requeuesToday['1-presens']).toBe(MAX_REQUEUES_PER_DAY);

    first.unmount();

    // Simulate the reload: a brand-new hook instance, same localStorage.
    const second = renderHook(() => useSrsProgress());
    await waitFor(() => expect(second.result.current.isLoading).toBe(false));

    // Before the fix (Practice.tsx's own component-state counter), a fresh
    // mount always started this at zero regardless of what disk held. The
    // persisted cap must survive the remount intact.
    expect(second.result.current.requeuesToday['1-presens']).toBe(2);
  });

  it('a third same-day requeue attempt for an item already at the persisted cap is still visible as spent after reload', async () => {
    const first = renderHook(() => useSrsProgress());
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));

    act(() => {
      for (let i = 0; i < MAX_REQUEUES_PER_DAY; i++) {
        first.result.current.recordRequeue('1-presens');
      }
    });
    await waitFor(() =>
      expect(first.result.current.requeuesToday['1-presens']).toBe(MAX_REQUEUES_PER_DAY),
    );
    first.unmount();

    const second = renderHook(() => useSrsProgress());
    await waitFor(() => expect(second.result.current.isLoading).toBe(false));

    // The reloaded count already meets the cap, so a caller feeding it into
    // isEligibleForRequeue would correctly refuse a further same-day retry.
    expect(second.result.current.requeuesToday['1-presens']).toBeGreaterThanOrEqual(
      MAX_REQUEUES_PER_DAY,
    );
  });
});

describe('requeue ledger write shape (issue #222)', () => {
  it('omits the requeues field entirely when nothing has been re-queued today, keeping v2-identical bytes', async () => {
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.recordAnswer('1-presens', 5);
    });
    await waitFor(() => expect(result.current.srsStates['1-presens']!.repetitions).toBe(1));

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
    expect(stored.version).toBe(3);
    expect('requeues' in stored).toBe(false);
  });

  it('writes the requeues ledger once at least one requeue has been recorded', async () => {
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.recordRequeue('1-presens');
    });
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
      expect(stored.requeues).toEqual({ day: '2026-01-15', counts: { '1-presens': 1 } });
    });
  });
});

describe('v2 -> v3 requeue ledger migration (issue #222)', () => {
  it('loads a version-2 store (no requeues field) with an empty ledger, same as a fresh day', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 2,
        items: {
          '1-presens': {
            itemId: '1-presens',
            repetitions: 3,
            intervalDays: 6,
            easeFactor: 2.2,
            dueAt: DAY1,
          },
        },
      }),
    );

    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.requeuesToday).toEqual({});
    // The migration is purely additive: the v2 item survives untouched.
    expect(result.current.srsStates['1-presens']!.repetitions).toBe(3);
  });

  it('persists the migrated v2 store back out as a version-3 envelope on the next write', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 2,
        items: {
          '1-presens': {
            itemId: '1-presens',
            repetitions: 3,
            intervalDays: 6,
            easeFactor: 2.2,
            dueAt: DAY1,
          },
        },
      }),
    );

    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.recordAnswer('1-presens', 5);
    });
    await waitFor(() => expect(result.current.srsStates['1-presens']!.repetitions).toBe(4));

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
    expect(stored.version).toBe(3);
  });

  it('reads a version-3 store with an existing same-day ledger back out verbatim', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 3,
        items: {},
        requeues: { day: '2026-01-15', counts: { '1-presens': 1 } },
      }),
    );

    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.requeuesToday).toEqual({ '1-presens': 1 });
  });
});

describe('requeue ledger defensive reads (issue #222)', () => {
  it('falls back to an empty ledger when the stored requeues field is not an object', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 3, items: {}, requeues: 'not-a-ledger' }),
    );

    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.requeuesToday).toEqual({});
  });

  it('falls back to an empty ledger when day is missing', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 3, items: {}, requeues: { counts: { '1-presens': 1 } } }),
    );

    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.requeuesToday).toEqual({});
  });

  it('drops only the individual malformed counts, keeping the well-formed ones (never fabricates a count)', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 3,
        items: {},
        requeues: {
          day: '2026-01-15',
          counts: {
            '1-presens': 1, // valid
            '1-preteritum': -1, // invalid: negative
            '1-supinum': 1.5, // invalid: not an integer
            '1-imperativ': 'two', // invalid: not a number
          },
        },
      }),
    );

    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.requeuesToday).toEqual({ '1-presens': 1 });
  });

  it('resets a ledger stamped with an earlier local day to empty rather than carrying it forward', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 3,
        items: {},
        requeues: { day: '2026-01-14', counts: { '1-presens': 2 } },
      }),
    );

    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Loaded on Jan 15 (DAY1); yesterday's spent cap does not carry in.
    expect(result.current.requeuesToday).toEqual({});
  });
});

describe('requeue ledger is not carried by export/import (issue #222)', () => {
  it('exportData never includes a requeues field', async () => {
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.recordRequeue('1-presens');
    });
    await waitFor(() => expect(result.current.requeuesToday['1-presens']).toBe(1));

    const exported = JSON.parse(result.current.exportData());
    expect('requeues' in exported).toBe(false);
  });

  it('importData ignores a requeues field in the backup file and resets the in-memory ledger', async () => {
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.recordRequeue('1-presens');
    });
    await waitFor(() => expect(result.current.requeuesToday['1-presens']).toBe(1));

    const backup = JSON.stringify({
      version: 3,
      items: {
        '1-presens': {
          itemId: '1-presens',
          repetitions: 5,
          intervalDays: 20,
          easeFactor: 2.5,
          dueAt: DAY1,
        },
      },
      // A backup restored on some other day; replaying this would cap
      // retries against a day the learner never studied.
      requeues: { day: '2026-01-01', counts: { '1-presens': 2 } },
    });

    act(() => {
      result.current.importData(backup);
    });
    await waitFor(() => expect(result.current.srsStates['1-presens']!.repetitions).toBe(5));

    expect(result.current.requeuesToday).toEqual({});
  });
});

// Speculative coverage: requeuesToday is documented (useSrsProgress.ts) as
// "re-checked against the current local day on every read, so a session
// left open past midnight reports an empty map instead of yesterday's spent
// caps." That value is produced by useMemo(fn, [requeues]) -- React only
// re-invokes fn when the `requeues` *reference* changes, not merely because
// the component re-rendered or wall-clock time moved. This test drives a
// re-render across a simulated midnight via an unrelated state change
// (recordAnswer, which never touches `requeues`) to check whether the
// "every read" claim actually holds against that memoization, or whether a
// long-open tab can keep reporting a stale, already-capped count into a day
// the cap was never spent on.
describe('requeuesToday across a day flip with no requeue-triggering re-render (issue #222)', () => {
  it('reports an empty map once the local day has advanced, even when the only re-render is unrelated to the ledger', async () => {
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      for (let i = 0; i < MAX_REQUEUES_PER_DAY; i++) {
        result.current.recordRequeue('1-presens');
      }
    });
    await waitFor(() =>
      expect(result.current.requeuesToday['1-presens']).toBe(MAX_REQUEUES_PER_DAY),
    );

    // Midnight passes without a reload and without any further
    // recordRequeue call -- exactly the "tab left open past midnight" case
    // the hook's own comment calls out.
    vi.setSystemTime(DAY2);

    // Force a re-render through a path that never touches `requeues`.
    act(() => {
      result.current.recordAnswer('1-preteritum', 5);
    });
    await waitFor(() => expect(result.current.srsStates['1-preteritum']!.repetitions).toBe(1));

    expect(result.current.requeuesToday['1-presens']).toBeUndefined();
  });
});
