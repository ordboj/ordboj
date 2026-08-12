import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useSrsProgress } from '@/hooks/useSrsProgress';
import { particleItemId } from '@/lib/itemIds';
import { getVerifiedParticleVerbs } from '@/lib/particleVerbs';
import type { SrsState } from '@/lib/srs';

const STORAGE_KEY = 'swedish-verbs-srs-progress';
const NOW = new Date('2026-03-10T12:00:00.000Z').getTime();
const DAY = 24 * 60 * 60 * 1000;

// #350 / docs/learning/2026-08-09-particle-cefr-majority-decision.md, "The
// residual risk, named": useSrsProgress(cefrLevels).getParticleSitting must
// forward cefrLevels to buildParticleSitting so it scopes introductions
// only, never due reviews. src/lib/particleQueue.test.ts pins the rule
// itself with synthetic, fully-controlled entries; this suite pins the
// wiring — that the hook actually passes the setting through — against the
// real verified particle verb corpus, which the pages import.
//
// A B1 entry (any) is used as the "outside cefrLevels" fixture and an A1
// entry as the "inside cefrLevels" fixture. The real corpus always has both
// bands (see docs/learning/2026-08-09-particle-cefr-majority-decision.md:
// A1 17, A2 34, B1 34, B2 15, C1 1 as of that note), so this does not depend
// on any specific entry surviving future authoring.
const allVerified = getVerifiedParticleVerbs();
const b1Entry = allVerified.find((entry) => entry.cefr === 'B1');
const a1Entry = allVerified.find((entry) => entry.cefr === 'A1');

if (!b1Entry || !a1Entry) {
  throw new Error(
    'fixture error: this suite needs at least one verified A1 and one verified B1 particle verb in the real corpus',
  );
}

function state(itemId: string, overrides: Partial<SrsState> = {}): SrsState {
  return {
    itemId,
    repetitions: 3,
    intervalDays: 6,
    easeFactor: 2.5,
    dueAt: NOW,
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe('#350: useSrsProgress(cefrLevels).getParticleSitting', () => {
  it('a due review outside cefrLevels still appears in the sitting', async () => {
    const clozeKey = particleItemId(b1Entry.id, 'cloze');
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 3,
        items: {
          [clozeKey]: state(clozeKey, { dueAt: NOW - DAY }),
        },
      }),
    );

    const { result } = renderHook(() => useSrsProgress(['A1']));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let sitting: ReturnType<typeof result.current.getParticleSitting> | undefined;
    act(() => {
      sitting = result.current.getParticleSitting(12);
    });

    const dueCard = sitting!.cards.find((card) => card.itemId === clozeKey);
    expect(dueCard).toBeDefined();
    expect(dueCard!.kind).toBe('cloze');
  });

  it('an introduction outside cefrLevels never appears in the sitting', async () => {
    const { result } = renderHook(() => useSrsProgress(['A1']));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let sitting: ReturnType<typeof result.current.getParticleSitting> | undefined;
    act(() => {
      // A large goal so the introduction allowance is not the reason
      // nothing outside A1 shows up.
      sitting = result.current.getParticleSitting(60);
    });

    const introducedIds = sitting!.cards
      .filter((card) => card.kind === 'introduction')
      .map((card) => card.entry.id);
    expect(introducedIds.length).toBeGreaterThan(0);
    expect(introducedIds).not.toContain(b1Entry.id);
    for (const id of introducedIds) {
      const introduced = allVerified.find((entry) => entry.id === id);
      expect(introduced?.cefr).toBe('A1');
    }
  });
});
