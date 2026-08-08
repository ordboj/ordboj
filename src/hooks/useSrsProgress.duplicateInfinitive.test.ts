import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useSrsProgress } from '@/hooks/useSrsProgress';
import type { ConjugatedVerb, Verb } from '@/lib/verbs';

const STORAGE_KEY = 'swedish-verbs-srs-progress';
const FIXED_NOW = new Date('2026-01-01T00:00:00.000Z').getTime();

// Two distinct VERB_DATA rows sharing an infinitive. This file exists
// solely to exercise the runtime duplicate-infinitive guard in
// useSrsProgress.ts's legacy-id migration (buildLegacyIdMap), so it gets
// its own static '@/lib/verbs' mock rather than sharing
// useSrsProgress.test.ts's (which is deliberately duplicate-free).
const DUPLICATE_VERBS: Verb[] = [
  { id: 'dup', infinitive: 'dup', cefr: 'A1' },
  { id: 'dup', infinitive: 'dup', cefr: 'A1' },
];

vi.mock('@/lib/verbs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/verbs')>();
  return {
    ...actual,
    getVerbs: vi.fn(async () => DUPLICATE_VERBS),
    conjugateVerb: vi.fn(async (infinitive: string): Promise<ConjugatedVerb> => ({
      id: infinitive,
      infinitive,
      presens: `${infinitive}ar`,
      preteritum: `${infinitive}ade`,
      supinum: `${infinitive}at`,
      imperativ: infinitive,
    })),
  };
});

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

// Acceptance criterion (issue #53): infinitive uniqueness is re-verified at
// runtime (buildLegacyIdMap), not just checked once by hand against today's
// table, because a future CSV import could introduce a duplicate. A
// collision must fail loudly (console.error) and leave the colliding row's
// legacy item unmapped (inert) rather than silently merging two verbs'
// progress into one key.
describe('legacy migration guards against a duplicate infinitive in the verb table', () => {
  it("does not merge a second verb's progress into the first verb's infinitive-keyed item when two rows share an infinitive", async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const legacyBlob = {
      '1-presens': {
        itemId: '1-presens',
        repetitions: 3,
        intervalDays: 10,
        easeFactor: 2.5,
        dueAt: FIXED_NOW,
      },
      '2-presens': {
        itemId: '2-presens',
        repetitions: 7,
        intervalDays: 200,
        easeFactor: 2.8,
        dueAt: FIXED_NOW,
      },
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(legacyBlob));

    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Row 0 ("1") is the first to claim "dup" and is re-keyed normally.
    expect(result.current.srsStates['dup-presens']).toMatchObject({
      repetitions: 3,
      intervalDays: 10,
    });
    expect(result.current.srsStates['1-presens']).toBeUndefined();

    // Row 1 ("2") collides on the same infinitive and is left unmapped:
    // inert under its old positional key, never merged into "dup-presens".
    expect(result.current.srsStates['2-presens']).toMatchObject({
      repetitions: 7,
      intervalDays: 200,
    });
    expect(result.current.srsStates['dup-presens'].repetitions).not.toBe(7);

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Duplicate infinitive'));

    errorSpy.mockRestore();
  });
});
