import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useSrsProgress } from '@/hooks/useSrsProgress';
import { getVerbs } from '@/lib/verbs';
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

    expect(Object.keys(result.current.srsStates)).toHaveLength(verbs.length * 4);
    expect(result.current.srsStates['1-presens']).toBeDefined();
    expect(result.current.srsStates[`${verbs.length}-imperativ`]).toBeDefined();
  });

  it('persists real-data initialization to the documented localStorage key', async () => {
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await waitFor(() => expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull());

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
    expect(stored.version).toBe(2);
    expect(Object.keys(stored.items)).toHaveLength(VERB_DATA.length * 4);
  }, 10000);

  // End-to-end regression for issue #124's UI acceptance criterion: "the
  // learner must never be asked to produce a form marked as nonexistent for
  // that verb". Modal verbs (kunna, få, vilja, ...) are flagged
  // `noImperativ: true` in real VERB_DATA; confirm the full due-item
  // pipeline (getVerbs -> conjugateVerb -> getDueItems' falsy-form skip)
  // never surfaces an imperativ practice item for one of them.
  it('never returns a due "imperativ" item for a verb flagged noImperativ in real VERB_DATA', async () => {
    const modalVerbs = VERB_DATA.filter((v) => v.noImperativ);
    // Fixture assumption this regression relies on: real data actually has
    // at least one modal verb flagged, otherwise the assertion below would
    // pass vacuously.
    expect(modalVerbs.length).toBeGreaterThan(0);

    const verbs = await getVerbs();
    const modalVerbIds = new Set(
      verbs.filter((v) => modalVerbs.some((m) => m.infinitive === v.infinitive)).map((v) => v.id),
    );
    expect(modalVerbIds.size).toBe(modalVerbs.length);

    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const due = await result.current.getDueItems();
    const violations = due.filter(
      (item) => modalVerbIds.has(item.verbId) && item.form === 'imperativ',
    );
    expect(violations).toEqual([]);
  });
});
