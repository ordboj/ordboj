import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/renderWithProviders';
import { PracticeCard } from '@/components/PracticeCard';
import type { ConjugatedVerb, Verb } from '@/lib/verbs';

// This suite mocks the swedish-linguist-owned '@/lib/verbs' boundary (same
// pattern as src/hooks/useSrsProgress.test.ts) so the multiple-choice
// generation logic added for issue #106 (PR #127) can be pinned against a
// small, fully controlled verb pool instead of the real ~50-verb table,
// which never actually starves the distractor pool for any tested form.
const conjugatedFixture = (
  over: Partial<ConjugatedVerb> & { infinitive: string },
): ConjugatedVerb => ({
  id: over.infinitive,
  infinitive: over.infinitive,
  presens: '(not available)',
  preteritum: '(not available)',
  supinum: '(not available)',
  imperativ: '(not available)',
  ...over,
});

let mockVerbs: Verb[] = [];
let mockConjugations: Record<string, ConjugatedVerb> = {};

vi.mock('@/lib/verbs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/verbs')>();
  return {
    ...actual,
    getVerbs: vi.fn(async () => mockVerbs),
    conjugateVerb: vi.fn(async (infinitive: string) => mockConjugations[infinitive]),
  };
});

describe('PracticeCard multiple-choice option generation (issue #106 / PR #127)', () => {
  it('never renders "(not available)" as an option, even when almost the whole candidate pool has no data for the tested form', async () => {
    // Only "d1" has a real presens value; four other candidates have no
    // data at all for the tested form. Pre-fix, "(not available)" (a
    // string, therefore truthy and not filtered) would have been eligible
    // to fill the remaining option slots.
    mockVerbs = [
      { id: '0', infinitive: 'target', cefr: 'A1' },
      { id: '1', infinitive: 'd1', cefr: 'A1' },
      { id: '2', infinitive: 'gap1', cefr: 'A1' },
      { id: '3', infinitive: 'gap2', cefr: 'A1' },
      { id: '4', infinitive: 'gap3', cefr: 'A1' },
    ];
    mockConjugations = {
      target: conjugatedFixture({ infinitive: 'target', presens: 'X' }),
      d1: conjugatedFixture({ infinitive: 'd1', presens: 'A' }),
      gap1: conjugatedFixture({ infinitive: 'gap1' }), // presens stays "(not available)"
      gap2: conjugatedFixture({ infinitive: 'gap2' }),
      gap3: conjugatedFixture({ infinitive: 'gap3' }),
    };

    renderWithProviders(
      <PracticeCard
        infinitive="target"
        form="presens"
        mode="multiple-choice"
        showExamples={false}
        autoplayAudio={false}
        muteAudio={true}
        onAnswer={vi.fn()}
      />,
    );

    // Only one valid distractor exists ("A"), so the final option set can
    // only ever be ["X", "A"]. This also proves the fix is bounded: it
    // resolves within the default waitFor timeout instead of spinning
    // forever looking for a 3rd/4th distractor that can never appear.
    await waitFor(() => {
      expect(screen.getAllByRole('button')).toHaveLength(2);
    });

    const optionTexts = screen.getAllByRole('button').map((b) => b.textContent);
    expect(optionTexts.sort()).toEqual(['A', 'X']);
    expect(optionTexts).not.toContain('(not available)');
  });

  it('resolves with just the correct answer, and no crash or hang, when zero other verbs have data for the tested form', async () => {
    // Every candidate is a data gap: zero valid distractors exist anywhere
    // in the pool. A bounded implementation settles for a single option;
    // an unbounded `while (opts.length < 4)` loop draws forever from a
    // candidate set that can never produce a 4th distinct, valid value.
    mockVerbs = [
      { id: '0', infinitive: 'target', cefr: 'A1' },
      { id: '1', infinitive: 'gap1', cefr: 'A1' },
      { id: '2', infinitive: 'gap2', cefr: 'A1' },
      { id: '3', infinitive: 'gap3', cefr: 'A1' },
    ];
    mockConjugations = {
      target: conjugatedFixture({ infinitive: 'target', presens: 'X' }),
      gap1: conjugatedFixture({ infinitive: 'gap1' }),
      gap2: conjugatedFixture({ infinitive: 'gap2' }),
      gap3: conjugatedFixture({ infinitive: 'gap3' }),
    };

    renderWithProviders(
      <PracticeCard
        infinitive="target"
        form="presens"
        mode="multiple-choice"
        showExamples={false}
        autoplayAudio={false}
        muteAudio={true}
        onAnswer={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByRole('button')).toHaveLength(1);
    });
    expect(screen.getByRole('button').textContent).toBe('X');
  });

  it('shuffles options using the unbiased Fisher-Yates algorithm (matches useSrsProgress.ts:105-108), not a biased sort comparator', async () => {
    // getVerbs() returns target first, then v0, v1, v2 in that fixed order.
    // With Math.random pinned to 0 throughout, Fisher-Yates deterministically
    // rotates every array it shuffles left by one element. A biased
    // `sort(() => Math.random() - 0.5)` shuffle does not consume Math.random
    // this way and would not reproduce this exact order.
    mockVerbs = [
      { id: '0', infinitive: 'target', cefr: 'A1' },
      { id: '1', infinitive: 'v0', cefr: 'A1' },
      { id: '2', infinitive: 'v1', cefr: 'A1' },
      { id: '3', infinitive: 'v2', cefr: 'A1' },
    ];
    mockConjugations = {
      target: conjugatedFixture({ infinitive: 'target', presens: 'X' }),
      v0: conjugatedFixture({ infinitive: 'v0', presens: 'A' }),
      v1: conjugatedFixture({ infinitive: 'v1', presens: 'B' }),
      v2: conjugatedFixture({ infinitive: 'v2', presens: 'C' }),
    };

    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);

    renderWithProviders(
      <PracticeCard
        infinitive="target"
        form="presens"
        mode="multiple-choice"
        showExamples={false}
        autoplayAudio={false}
        muteAudio={true}
        onAnswer={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByRole('button')).toHaveLength(4);
    });

    // Trace: candidates [A,B,C] shuffle (Math.random===0 always) -> [B,C,A].
    // Distractors picked in that order -> [B,C,A]. Pre-shuffle final array
    // [X,B,C,A] shuffled again (Math.random===0) -> [B,C,A,X].
    const optionTexts = screen.getAllByRole('button').map((b) => b.textContent);
    expect(optionTexts).toEqual(['B', 'C', 'A', 'X']);

    randomSpy.mockRestore();
  });

  it("uses stable, value-derived keys for the shuffled letter buttons, not array-index keys (regression for issue #106, same fix applied to PracticeCard's other index-keyed list)", async () => {
    // The letter-tile list (typing mode) shares the exact fisherYatesShuffle
    // helper and the exact "key={index} -> key={value}" fix as the
    // multiple-choice options list, and — unlike the options list — is not
    // masked by an intervening empty-array render on prop change, so it is
    // the list where key stability is directly observable: capture a DOM
    // node, force its value to disappear entirely, and check whether React
    // unmounted it (stable key) or silently repainted it in place (index key).
    mockVerbs = [{ id: '0', infinitive: 't1', cefr: 'A1' }];
    mockConjugations = {
      t1: conjugatedFixture({ infinitive: 't1', presens: '12' }),
      t2: conjugatedFixture({ infinitive: 't2', presens: '34' }),
    };

    const { rerender } = renderWithProviders(
      <PracticeCard
        infinitive="t1"
        form="presens"
        mode="typing"
        showExamples={false}
        autoplayAudio={false}
        muteAudio={true}
        onAnswer={vi.fn()}
      />,
    );

    const oldLetterButton = await screen.findByRole('button', { name: '1' });
    expect(oldLetterButton.isConnected).toBe(true);

    mockVerbs = [{ id: '1', infinitive: 't2', cefr: 'A1' }];
    rerender(
      <PracticeCard
        infinitive="t2"
        form="presens"
        mode="typing"
        showExamples={false}
        autoplayAudio={false}
        muteAudio={true}
        onAnswer={vi.fn()}
      />,
    );

    // New letters ("3", "4") appear with none of the old letters ("1", "2")
    // left in the document.
    await screen.findByRole('button', { name: '3' });
    expect(screen.queryByRole('button', { name: '1' })).not.toBeInTheDocument();

    // The old DOM node for "1" must have been unmounted, not silently
    // reused-and-repainted by React under a stale positional key.
    expect(oldLetterButton.isConnected).toBe(false);
  });
});
