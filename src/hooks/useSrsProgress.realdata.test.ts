import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useSrsProgress } from '@/hooks/useSrsProgress';
import { getVerbs, conjugateVerb, availableForms } from '@/lib/verbs';
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

// Regression (issue #39): SRS items used to be created for every verb x all
// 4 non-infinitive forms unconditionally, including forms VERB_DATA has no
// value for (e.g. imperativ on modal verbs like "kunna" -- real VERB_DATA
// row, imperativ: ""). The item count must now track availableForms(), not
// a hardcoded 4-forms-per-verb assumption, and computing the expected total
// from availableForms() (rather than hardcoding a number) keeps this test
// honest if VERB_DATA's missing-form set ever changes.
async function expectedRealDataItemCount(): Promise<number> {
  let total = 0;
  for (const verb of VERB_DATA) {
    const conjugated = await conjugateVerb(verb.infinitive);
    total += availableForms(conjugated).filter((f) => f !== 'infinitive').length;
  }
  return total;
}

describe('useSrsProgress against real VERB_DATA', () => {
  it('initializes exactly one SRS item per verb x form that actually exists (no items for missing forms)', async () => {
    const verbs = await getVerbs();
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const expectedCount = await expectedRealDataItemCount();
    // Sanity: real VERB_DATA does have at least one verb missing a form
    // (otherwise this test could not distinguish the fixed behavior from
    // the old "always 4 forms" behavior).
    expect(expectedCount).toBeLessThan(verbs.length * 4);

    expect(Object.keys(result.current.srsStates)).toHaveLength(expectedCount);
    expect(result.current.srsStates['1-presens']).toBeDefined();
  });

  it('never creates an SRS item for a real modal verb\'s non-existent imperativ (e.g. "kunna")', async () => {
    const verbs = await getVerbs();
    const kunna = verbs.find((v) => v.infinitive === 'kunna');
    expect(kunna).toBeDefined(); // pins the fixture assumption this test relies on
    const conjugatedKunna = await conjugateVerb('kunna');
    expect(conjugatedKunna.imperativ).toBe(''); // kunna genuinely has no imperativ in VERB_DATA

    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.srsStates[`${kunna!.id}-imperativ`]).toBeUndefined();
    // But its other, real forms are still tracked.
    expect(result.current.srsStates[`${kunna!.id}-presens`]).toBeDefined();
  });

  it('persists real-data initialization to the documented localStorage key', async () => {
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await waitFor(() => expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull());

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
    expect(stored.version).toBe(2);
    expect(Object.keys(stored.items)).toHaveLength(await expectedRealDataItemCount());
  }, 10000);
});
