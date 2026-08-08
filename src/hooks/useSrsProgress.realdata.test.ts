import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useSrsProgress } from '@/hooks/useSrsProgress';
import { getVerbs } from '@/lib/verbs';

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
  // issue #53: v3 does not materialize every verb x form combination on
  // first launch. An absent key means "new, due now" (see getDueItems).
  it('starts with an empty (sparse) state map on cold start instead of materializing every verb x form combination', async () => {
    const verbs = await getVerbs();
    expect(verbs.length).toBeGreaterThan(0);

    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.srsStates).toEqual({});
  });

  it('persists a tiny sparse payload on cold start, not one materialized item per verb x form', async () => {
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await waitFor(() => expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull());

    const raw = localStorage.getItem(STORAGE_KEY) as string;
    const stored = JSON.parse(raw);
    expect(stored.version).toBe(3);
    expect(stored.items).toEqual({});
    // The old (v2) behavior wrote VERB_DATA.length * 4 materialized items
    // (~130B each) on first launch. v3 writes none: this is the mechanism
    // behind the acceptance criterion's measured store-size drop.
    expect(raw.length).toBeLessThan(100);
  }, 10000);

  it('treats every real verb x form combination as due even though nothing is stored', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const verbs = await getVerbs();
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const due = await result.current.getDueItems();
    // Every verb contributes at least presens/preteritum/supinum; imperativ
    // may be legitimately unavailable for some rows.
    expect(due.length).toBeGreaterThanOrEqual(verbs.length * 3);
  }, 10000);

  it('keeps the persisted store far smaller than the old fully-materialized shape once every verb has one form practiced (measured store size)', async () => {
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const verbs = await getVerbs();
    act(() => {
      for (const verb of verbs) {
        result.current.recordAnswer(`${verb.infinitive}-presens`, 5);
      }
    });
    await waitFor(() => expect(Object.keys(result.current.srsStates).length).toBe(verbs.length));

    const raw = localStorage.getItem(STORAGE_KEY) as string;
    const stored = JSON.parse(raw);
    expect(stored.version).toBe(3);
    expect(Object.keys(stored.items)).toHaveLength(verbs.length);
    // v2 would have already written 4x this many items before a single
    // answer was recorded (~26KB for 50 verbs fully practiced per the PR's
    // measurement); one practiced form per verb here must stay well under
    // even the ticket's ~15KB target for the *fully* practiced v3 store.
    expect(raw.length).toBeLessThan(15000);
  }, 10000);
});
