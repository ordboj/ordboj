import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import Practice from '@/pages/Practice';
import type { ConjugatedVerb, Verb } from '@/lib/verbs';

// Issue #128 regression, at the level a user actually experiences it:
// answering a card used to cause the due-item queue to be silently
// recomputed (re-filtered and re-shuffled) mid-session, which shrank the
// counter's denominator and could skip or repeat cards. This suite uses the
// REAL useSrsProgress and useSettings hooks (unlike Practice.test.tsx, which
// mocks useSrsProgress and therefore cannot see this class of bug - a fresh
// mock function literal returned on every render has none of the identity
// characteristics of the real memoized hook). Only the swedish-linguist-owned
// '@/lib/verbs' boundary is mocked, with a small deterministic fixture, the
// same pattern used in useSrsProgress.test.ts.
const STORAGE_KEY = 'swedish-verbs-srs-progress';

const FIXTURE_VERBS: Verb[] = [
  { id: '1', infinitive: 'alfa', cefr: 'A1' },
  { id: '2', infinitive: 'beta', cefr: 'A1' },
  { id: '3', infinitive: 'gamma', cefr: 'A1' },
];

// Every fixture verb has exactly one available form (presens), so the due
// queue for a fresh session is exactly these three items - no more, no
// fewer - regardless of shuffle order.
const ANSWERS: Record<string, string> = { alfa: 'alfar', beta: 'betar', gamma: 'gammar' };
const ITEM_ID_BY_INFINITIVE: Record<string, string> = {
  alfa: '1-presens',
  beta: '2-presens',
  gamma: '3-presens',
};

const FIXTURE_CONJUGATIONS: Record<string, ConjugatedVerb> = {
  alfa: {
    id: '1',
    infinitive: 'alfa',
    cefr: 'A1',
    presens: 'alfar',
    preteritum: '(not available)',
    supinum: '(not available)',
    imperativ: '(not available)',
  },
  beta: {
    id: '2',
    infinitive: 'beta',
    cefr: 'A1',
    presens: 'betar',
    preteritum: '(not available)',
    supinum: '(not available)',
    imperativ: '(not available)',
  },
  gamma: {
    id: '3',
    infinitive: 'gamma',
    cefr: 'A1',
    presens: 'gammar',
    preteritum: '(not available)',
    supinum: '(not available)',
    imperativ: '(not available)',
  },
};

vi.mock('@/lib/verbs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/verbs')>();
  return {
    ...actual,
    getVerbs: vi.fn(async () => FIXTURE_VERBS),
    // PracticeCard's multiple-choice option generator (frontend-expert,
    // not this PR) draws distractors from a fixed pool of real infinitives
    // ('vara', 'ha', 'gå', ...) regardless of practiceMode - the effect
    // that builds them runs unconditionally. Falling back to the real
    // conjugateVerb (via `actual`) for any infinitive outside this test's
    // fixture gives it real, distinct conjugations to draw from; a fixed
    // "(not available)" fallback here collapses every distractor to the
    // same value and starves that generator's `while (opts.length < 4)`
    // loop of a way to ever terminate.
    conjugateVerb: vi.fn(async (infinitive: string) => {
      return FIXTURE_CONJUGATIONS[infinitive] ?? actual.conjugateVerb(infinitive);
    }),
  };
});

beforeEach(() => {
  localStorage.clear();
  // Unlike useSrsProgress.test.ts, this suite drives real user-event
  // keystrokes through a live component tree, and user-event's internal
  // typing delays are computed against the real clock; faking Date here
  // (even with real setTimeout left alone) stalls that delay accounting and
  // runs the test out of memory. Real time is fine for this suite's
  // purposes: isDue() only needs dueAt (set to "now" at init) <= "now" at
  // query time, which is true from one real millisecond to the next.
  //
  // Math.random is deliberately left real (not stubbed). PracticeCard's
  // multiple-choice option generator draws a random distractor verb on
  // every render regardless of practiceMode and only stops once it has
  // collected 4 unique conjugations; a constant Math.random pins it to the
  // same distractor forever, so its `while` loop never terminates. This
  // suite reads the queue order from the DOM instead of predicting it, so
  // it doesn't need the shuffle to be deterministic.
});

describe('Practice page - session queue snapshot (#128 regression)', () => {
  it('grades exactly the item displayed on each card, never skips or repeats one, and keeps the counter denominator fixed for the whole session', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Practice />, { route: '/practice' });

    const total = 3;
    for (let step = 1; step <= total; step++) {
      // The counter's denominator must stay pinned at the session's actual
      // due count for every card - pre-fix this shrinks after each answer
      // because the queue gets silently recomputed.
      expect(await screen.findByText(`${step} / ${total}`)).toBeInTheDocument();

      const heading = await screen.findByRole('heading', { level: 2 });
      const infinitive = Object.keys(ANSWERS).find((inf) => heading.textContent?.includes(inf));
      expect(
        infinitive,
        `expected one of ${Object.keys(ANSWERS)} in "${heading.textContent}"`,
      ).toBeDefined();
      const expectedItemId = ITEM_ID_BY_INFINITIVE[infinitive as string];

      const input = await screen.findByPlaceholderText('Type your answer...');
      await user.type(input, ANSWERS[infinitive as string]);
      expect(await screen.findByText('Correct!')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /next card/i }));

      // The grade must land on the item that was actually on screen for
      // this step, recorded immediately - not against whatever the queue
      // happens to contain after a mid-session reshuffle.
      const storedNow = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
      expect(storedNow.items[expectedItemId].repetitions).toBe(1);
    }

    expect(await screen.findByText(/Great Work/i)).toBeInTheDocument();

    // All three (and only these three) due items were graded exactly once:
    // nothing skipped by a queue that shrank mid-session, nothing graded
    // twice by a queue that re-included an already-answered item.
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
    for (const itemId of Object.values(ITEM_ID_BY_INFINITIVE)) {
      expect(stored.items[itemId].repetitions).toBe(1);
    }
  });
});
