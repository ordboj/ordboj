import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useSrsProgress, STORAGE_VERSION } from '@/hooks/useSrsProgress';
import { getVerbs, getAllConjugatedVerbs } from '@/lib/verbs';
import { SCHEDULED_FORMS } from '@/lib/srsProviders';
import { VERB_DATA } from '@/data/verbData';

// Unlike useSrsProgress.test.ts (which mocks '@/lib/verbs' for a small,
// deterministic fixture), this file runs the hook against the real,
// production VERB_DATA to confirm the wiring holds end-to-end.
//
// NOTE: every entry in the current VERB_DATA has cefr "A1" (confirmed via
// `grep -c` while writing this suite: 50/50 rows). That means the
// cefrLevels filter cannot be meaningfully exercised against real data -
// filtering by any other level always returns an empty set. This is a data
// gap for swedish-linguist, not a defect in useSrsProgress itself.
const STORAGE_KEY = 'swedish-verbs-srs-progress';

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useSrsProgress against real VERB_DATA', () => {
  it('initializes 4 SRS items (presens/preteritum/supinum/imperativ) per real verb', async () => {
    const verbs = await getVerbs();
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Issue #53: ids are the infinitive itself, not a 1-based position.
    expect(Object.keys(result.current.srsStates)).toHaveLength(verbs.length * 4);
    expect(result.current.srsStates[`${verbs[0]!.id}-presens`]).toBeDefined();
    expect(result.current.srsStates[`${verbs[verbs.length - 1]!.id}-imperativ`]).toBeDefined();
  });

  // Issue #53: version 3 stops persisting items that carry no learning
  // history and are re-derivable on the next load (isPristineSrsState).
  // Every item here is freshly initialized and untouched, so the on-disk
  // map must be empty even though the in-memory map (asserted above) holds
  // all of them - this is the entire point of the storage-size reduction
  // the ticket measures (~26 KB -> ~15 KB for 51 fully-practiced verbs).
  it('persists real-data initialization to the documented localStorage key, sparsely (no untouched items on disk)', async () => {
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await waitFor(() => expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull());

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
    expect(stored.version).toBe(STORAGE_VERSION);
    expect(Object.keys(stored.items)).toHaveLength(0);

    // The in-memory deck is unaffected: every item is still there and still
    // due, it just is not written to disk while untouched. Compare against
    // the same "form actually exists" filter production uses (some verbs,
    // e.g. modals, have no attested imperativ), not a flat VERB_DATA.length
    // * 4 - that count was never how many items are practisable, sparse
    // storage or not.
    expect(Object.keys(result.current.srsStates)).toHaveLength(VERB_DATA.length * 4);
    const conjugated = await getAllConjugatedVerbs();
    const expectedAvailableCount = conjugated.reduce(
      (sum, verb) =>
        sum +
        SCHEDULED_FORMS.filter((form) => verb[form] && verb[form] !== '(not available)').length,
      0,
    );
    const due = await result.current.getDueItems();
    expect(due.length).toBe(expectedAvailableCount);
  }, 10000);

  // Regression test for issue #53: a store written by a pre-#53 build (bare
  // positional keys, no version envelope) migrates to the v3 envelope with
  // every verb's progress intact, matched up to its new infinitive-keyed id
  // - not just "some items survived", but verb-for-verb against the real
  // VERB_DATA order.
  it('migrates a legacy positional-key store to infinitive-keyed ids, verb-for-verb, with progress intact', async () => {
    const verbs = await getVerbs();
    const first3 = verbs.slice(0, 3);
    const now = Date.now(); // frozen by the fake timer installed in beforeEach
    const legacyBlob: Record<string, unknown> = {};
    first3.forEach((verb, position) => {
      legacyBlob[`${position + 1}-presens`] = {
        itemId: `${position + 1}-presens`,
        repetitions: position + 2, // distinct per verb, so a mix-up is visible
        intervalDays: (position + 1) * 4,
        easeFactor: 2.5,
        dueAt: now,
      };
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(legacyBlob));

    const { result, unmount } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    first3.forEach((verb, position) => {
      const migrated = result.current.srsStates[`${verb.id}-presens`];
      expect(migrated).toBeDefined();
      expect(migrated!.repetitions).toBe(position + 2);
      expect(migrated!.intervalDays).toBe((position + 1) * 4);
      // The old positional key must not survive alongside the new one.
      expect(result.current.srsStates[`${position + 1}-presens`]).toBeUndefined();
    });

    // The migrated store reaches disk at the latest when the coalesced
    // writer (issue #253) flushes on unmount.
    unmount();
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
    expect(stored.version).toBe(STORAGE_VERSION);
    first3.forEach((verb, position) => {
      expect(stored.items[`${verb.id}-presens`]).toMatchObject({ repetitions: position + 2 });
      expect(stored.items[`${position + 1}-presens`]).toBeUndefined();
    });
  }, 10000);
});
