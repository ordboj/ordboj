import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import Practice from '@/pages/Practice';

// Practice.tsx composes useSrsProgress (srs-engine) and useSettings
// (srs-engine) with PracticeCard (ui-craft). Those two hooks are mocked here
// as boundaries this suite does not own, driven by hoisted mutable state so
// each test can steer them without re-declaring vi.mock. The real
// conjugateVerb() lookup (swedish-linguist) is left untouched, so the actual
// answer-checking wiring between the page and the card is exercised
// end-to-end, not just the page's own state machine.
const mocks = vi.hoisted(() => {
  return {
    recordAnswer: vi.fn(),
    dueItems: [] as Array<{ verbId: string; infinitive: string; form: string; itemId: string }>,
    // Keyed by itemId ("<verbId>-<form>"), same shape as srs.ts's SrsState.
    // Practice.tsx's free-practice pool reads this directly (it does not go
    // through getDueItems), so tests that exercise "Keep practising" seed
    // this instead of/in addition to dueItems.
    srsStates: {} as Record<
      string,
      {
        itemId: string;
        repetitions: number;
        intervalDays: number;
        easeFactor: number;
        dueAt: number;
        lastGrade?: number;
      }
    >,
    srsLoading: false,
    settingsLoading: false,
  };
});

// Settings kept stable across renders (matches the real useSettings hook,
// which keeps its object reference until updateSettings actually runs):
// buildFreePracticePool depends on settings.cefrLevels, and a mock that
// handed back a brand-new array every render would give it a new identity
// every render too, re-firing the effect that keys on it in a loop.
const STABLE_SETTINGS = {
  practiceMode: 'typing' as const,
  showExamples: false,
  autoplayAudio: false,
  muteAudio: true,
  dailyGoal: 20,
  cefrLevels: ['A1'],
};

vi.mock('@/hooks/useSrsProgress', () => ({
  useSrsProgress: () => ({
    isLoading: mocks.srsLoading,
    // Deliberately NOT wrapped in a stable vi.fn(): the real hook's
    // getDueItems is `useCallback(..., [srsStates, cefrLevels])`, so it gets
    // a brand-new identity every time srsStates changes (i.e. after every
    // recordAnswer). PR #122 fixed Practice.tsx to tolerate that instability
    // via a ref (see the #103 regression suite below); freezing this mock
    // would hide any regression of that fix instead of testing it.
    getDueItems: async () => mocks.dueItems,
    recordAnswer: mocks.recordAnswer,
    exportData: () => '{}',
    importData: () => true,
    resetProgress: () => undefined,
    srsStates: mocks.srsStates,
    initializeAllItems: () => undefined,
  }),
}));

vi.mock('@/hooks/useSettings', () => ({
  useSettings: () => ({
    isLoading: mocks.settingsLoading,
    settings: STABLE_SETTINGS,
    updateSettings: vi.fn(),
  }),
}));

beforeEach(() => {
  mocks.recordAnswer.mockClear();
  mocks.srsLoading = false;
  mocks.settingsLoading = false;
  mocks.dueItems = [
    { verbId: '1', infinitive: 'vara', form: 'presens', itemId: '1-presens' },
    { verbId: '1', infinitive: 'vara', form: 'preteritum', itemId: '1-preteritum' },
  ];
  mocks.srsStates = {};
  // Honest default: answering an item removes it from the due set, the way
  // the real SRS hook's dueAt update does. Individual tests override this
  // when they need to simulate a specific re-due/lapse scenario.
  mocks.recordAnswer.mockImplementation((itemId: string) => {
    mocks.dueItems = mocks.dueItems.filter((item) => item.itemId !== itemId);
  });
});

// Builds a minimal future (not-due) SrsState for a given itemId, so tests
// can populate mocks.srsStates without repeating every field.
function futureState(itemId: string, dueAt: number) {
  return { itemId, repetitions: 1, intervalDays: 6, easeFactor: 2.5, dueAt };
}

const DAY_MS = 24 * 60 * 60 * 1000;

describe('Practice page - one full session', () => {
  it('walks through both due cards and lands on the completion screen, recording each answer', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Practice />, { route: '/practice' });

    // Card 1 of 2: "vara" presens -> "är"
    expect(await screen.findByText('1 / 2')).toBeInTheDocument();
    const firstInput = await screen.findByPlaceholderText('Type your answer...');
    await user.type(firstInput, 'är');
    expect(await screen.findByText('Correct!')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /next card/i }));

    // Card 2 of 2: "vara" preteritum -> "var"
    expect(await screen.findByText('2 / 2')).toBeInTheDocument();
    const secondInput = await screen.findByPlaceholderText('Type your answer...');
    await user.type(secondInput, 'var');
    expect(await screen.findByText('Correct!')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /next card/i }));

    // Session complete screen.
    expect(await screen.findByText(/Great Work/i)).toBeInTheDocument();
    expect(screen.getByText(/completed all due cards/i)).toBeInTheDocument();

    expect(mocks.recordAnswer).toHaveBeenCalledTimes(2);
    expect(mocks.recordAnswer).toHaveBeenNthCalledWith(1, '1-presens', 5);
    expect(mocks.recordAnswer).toHaveBeenNthCalledWith(2, '1-preteritum', 5);
  });

  it('shows the completion screen immediately when there are no due cards', async () => {
    mocks.dueItems = [];
    renderWithProviders(<Practice />, { route: '/practice' });

    expect(await screen.findByText(/Great Work/i)).toBeInTheDocument();
  });

  it('shows a loading state before settings and progress have loaded', async () => {
    mocks.settingsLoading = true;
    renderWithProviders(<Practice />, { route: '/practice' });

    expect(screen.getByText(/Loading practice cards/i)).toBeInTheDocument();
    expect(screen.queryByText('1 / 2')).not.toBeInTheDocument();
  });
});

// Issue #129: the shadcn Progress primitive's default track (bg-secondary)
// is nearly as saturated as its bg-primary fill, so at 0-1% the bar read as
// full instead of empty. bg-muted was tried next but only clears ~1.01:1
// contrast against this page's background - still invisible. Pin the token
// that actually clears WCAG 1.4.11's 3:1 (bg-muted-foreground, ~3.8:1 here)
// so a regression back to either prior value fails loudly.
describe('Practice page - issue #129: progress bar track contrast', () => {
  it("renders the header progress bar's track with a token that has real contrast against the page background", async () => {
    renderWithProviders(<Practice />, { route: '/practice' });

    const track = await screen.findByRole('progressbar');
    expect(track).toHaveClass('bg-muted-foreground');
    expect(track).not.toHaveClass('bg-muted');
    expect(track).not.toHaveClass('bg-secondary');
  });
});

// Issue #27: on an empty due queue, the completion screen must offer two
// distinct, independently-gated actions -- "Keep practising" (free
// practice, never touches SRS state) and "Extra reviews (N)" (touches SRS
// state exactly like a normal due session). These tests pin that contract
// directly against src/pages/Practice.tsx (buildFreePracticePool,
// startFreePractice, startExtraReview, handleAnswer's sessionKind branch).
describe('Practice page - free practice vs extra reviews (issue #27)', () => {
  it("offers only 'Keep practising', enabled, when future items exist but nothing is due", async () => {
    mocks.dueItems = [];
    mocks.srsStates = {
      '1-presens': futureState('1-presens', Date.now() + DAY_MS),
    };
    renderWithProviders(<Practice />, { route: '/practice' });

    const keepPractising = await screen.findByRole('button', { name: /keep practising/i });
    expect(keepPractising).toBeEnabled();
    expect(screen.queryByRole('button', { name: /extra reviews/i })).not.toBeInTheDocument();
  });

  it("disables 'Keep practising' and shows no 'Extra reviews' once the only due item has been answered", async () => {
    // Before the stale-closure fix, the post-session counts were computed
    // from the pre-update getDueItems/srsStates closures captured inside
    // handleAnswer, so they didn't reflect the answer that had just been
    // recorded. Combined with a frozen (non-reactive) test mock, this
    // assertion used to pin "Extra reviews (1)" appearing even though the
    // one and only due item had just been answered and dropped out of the
    // due set -- a card offering "extra review" of nothing. With the
    // honest mock (recordAnswer actually removes the answered item, see
    // beforeEach) and the counts recomputed in an effect keyed on
    // srsStates, both buttons correctly reflect that nothing is left.
    mocks.dueItems = [{ verbId: '1', infinitive: 'vara', form: 'presens', itemId: '1-presens' }];
    mocks.srsStates = {};
    renderWithProviders(<Practice />, { route: '/practice' });

    // Answer the one due card so the session ends and the completion
    // screen (with its post-session actions) is reached.
    const user = userEvent.setup();
    const input = await screen.findByPlaceholderText('Type your answer...');
    await user.type(input, 'är');
    await user.click(await screen.findByRole('button', { name: /next card/i }));

    const keepPractising = await screen.findByRole('button', { name: /keep practising/i });
    expect(keepPractising).toBeDisabled();
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /extra reviews/i })).not.toBeInTheDocument();
    });
  });

  it('draws the free-practice pool in nearest-future-dueAt order and never calls recordAnswer, even across repeated rounds', async () => {
    mocks.dueItems = [];
    const now = Date.now();
    // Deliberately out of chronological order in the object so a bug that
    // reads insertion order instead of sorting by dueAt would still pass by
    // accident if these were declared ascending.
    mocks.srsStates = {
      '2-presens': futureState('2-presens', now + 3 * DAY_MS), // ha -> "har"
      '1-presens': futureState('1-presens', now + 1 * DAY_MS), // vara -> "är"
      '4-presens': futureState('4-presens', now + 2 * DAY_MS), // unna -> "unnar"
    };
    renderWithProviders(<Practice />, { route: '/practice' });

    const user = userEvent.setup();
    const keepPractising = await screen.findByRole('button', { name: /keep practising/i });
    expect(keepPractising).toBeEnabled();
    await user.click(keepPractising);

    // First card must be the nearest-due one (vara, +1 day): typing its
    // answer auto-submits and shows "Correct!". If the pool were sorted
    // wrong (or unsorted), "är" would not match whatever verb actually
    // landed first and this assertion would fail.
    expect(await screen.findByText('1 / 3')).toBeInTheDocument();
    expect(screen.getByText(/isn't saved to your progress/i)).toBeInTheDocument();
    let input = await screen.findByPlaceholderText('Type your answer...');
    await user.type(input, 'är');
    expect(await screen.findByText('Correct!')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /next card/i }));

    // Second nearest (unna, +2 days).
    expect(await screen.findByText('2 / 3')).toBeInTheDocument();
    input = await screen.findByPlaceholderText('Type your answer...');
    await user.type(input, 'unnar');
    expect(await screen.findByText('Correct!')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /next card/i }));

    // Third / furthest (ha, +3 days).
    expect(await screen.findByText('3 / 3')).toBeInTheDocument();
    input = await screen.findByPlaceholderText('Type your answer...');
    await user.type(input, 'har');
    expect(await screen.findByText('Correct!')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /next card/i }));

    // Free round finished: back on the completion screen, and the whole
    // round -- right and (had there been one) wrong answers alike --
    // recorded nothing to SRS state.
    expect(await screen.findByText(/Great Work/i)).toBeInTheDocument();
    expect(mocks.recordAnswer).not.toHaveBeenCalled();

    // Repeatable: clicking "Keep practising" again redraws a round from the
    // same untouched pool without error, and still records nothing.
    const keepPractisingAgain = await screen.findByRole('button', { name: /keep practising/i });
    expect(keepPractisingAgain).toBeEnabled();
    await user.click(keepPractisingAgain);
    expect(await screen.findByText('1 / 3')).toBeInTheDocument();
    expect(mocks.recordAnswer).not.toHaveBeenCalled();
  });

  it('never records a wrong answer during free practice either', async () => {
    mocks.dueItems = [];
    mocks.srsStates = {
      '1-presens': futureState('1-presens', Date.now() + DAY_MS),
    };
    renderWithProviders(<Practice />, { route: '/practice' });

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /keep practising/i }));

    const input = await screen.findByPlaceholderText('Type your answer...');
    await user.type(input, 'definitely not swedish');
    await user.click(await screen.findByRole('button', { name: /check answer/i }));
    expect(await screen.findByText('Not quite')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /next card/i }));

    expect(await screen.findByText(/Great Work/i)).toBeInTheDocument();
    expect(mocks.recordAnswer).not.toHaveBeenCalled();
  });

  it('caps a free-practice round at 5 items even when more future items are available', async () => {
    mocks.dueItems = [];
    const now = Date.now();
    mocks.srsStates = {
      '1-presens': futureState('1-presens', now + 1 * DAY_MS), // vara
      '2-presens': futureState('2-presens', now + 2 * DAY_MS), // ha
      '3-presens': futureState('3-presens', now + 3 * DAY_MS), // kunna
      '4-presens': futureState('4-presens', now + 4 * DAY_MS), // unna
      '5-presens': futureState('5-presens', now + 5 * DAY_MS), // få
      '6-presens': futureState('6-presens', now + 6 * DAY_MS), // bli
    };
    renderWithProviders(<Practice />, { route: '/practice' });

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /keep practising/i }));

    expect(await screen.findByText('1 / 5')).toBeInTheDocument();
  });

  it('excludes items whose dueAt has already passed from the free-practice pool', async () => {
    mocks.dueItems = [];
    const now = Date.now();
    mocks.srsStates = {
      // Already due -- must never appear in "Keep practising".
      '1-presens': futureState('1-presens', now - DAY_MS),
      // Genuinely future -- the only eligible candidate.
      '2-presens': futureState('2-presens', now + DAY_MS),
    };
    renderWithProviders(<Practice />, { route: '/practice' });

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /keep practising/i }));

    expect(await screen.findByText('1 / 1')).toBeInTheDocument();
    const input = await screen.findByPlaceholderText('Type your answer...');
    await user.type(input, 'har');
    expect(await screen.findByText('Correct!')).toBeInTheDocument();
  });

  it("'Extra reviews' is a separate path that records answers to SRS state normally", async () => {
    // Only "vara" is due at session start. Answering it removes it from
    // the due set (honest recordAnswer, same as a real grade would) and,
    // in the same call, "ha" simulates a second item coming genuinely due
    // later the same sitting (e.g. an interval-1 lapse elsewhere) --
    // independent of what was just answered here -- per
    // session-shape-and-daily-goal's "Extra reviews (N)" contract.
    mocks.dueItems = [{ verbId: '1', infinitive: 'vara', form: 'presens', itemId: '1-presens' }];
    mocks.recordAnswer.mockImplementation((itemId: string) => {
      mocks.dueItems = [
        ...mocks.dueItems.filter((item) => item.itemId !== itemId),
        { verbId: '2', infinitive: 'ha', form: 'presens', itemId: '2-presens' },
      ];
    });
    mocks.srsStates = {};
    renderWithProviders(<Practice />, { route: '/practice' });

    const user = userEvent.setup();

    // Finish the initial due session (records once).
    let input = await screen.findByPlaceholderText('Type your answer...');
    await user.type(input, 'är');
    await user.click(await screen.findByRole('button', { name: /next card/i }));
    expect(await screen.findByText(/Great Work/i)).toBeInTheDocument();
    expect(mocks.recordAnswer).toHaveBeenCalledTimes(1);

    // Enter the extra-reviews path and answer again -- unlike free
    // practice, this must call recordAnswer.
    await user.click(await screen.findByRole('button', { name: /extra reviews \(1\)/i }));
    expect(await screen.findByText('1 / 1')).toBeInTheDocument();
    expect(screen.queryByText(/isn't saved to your progress/i)).not.toBeInTheDocument();

    input = await screen.findByPlaceholderText('Type your answer...');
    await user.type(input, 'har');
    await user.click(await screen.findByRole('button', { name: /next card/i }));

    expect(mocks.recordAnswer).toHaveBeenCalledTimes(2);
    expect(mocks.recordAnswer).toHaveBeenNthCalledWith(2, '2-presens', 5);
  });
});

// Regression for #103: the deck must be fixed once at session start. The
// mocked useSrsProgress hook below returns a brand-new `getDueItems`
// closure on every render (exactly like the real hook, whose getDueItems is
// recreated whenever srsStates changes) and `recordAnswer` mutates the
// underlying due list the way a real answer does: the answered item stops
// being due, so a fresh call to getDueItems() would no longer include it.
// Before the fix, Practice.tsx's load effect depended on `getDueItems`
// itself, so every post-answer re-render (a fresh getDueItems identity)
// re-ran the effect and overwrote `dueItems` with the shrunken list while
// `currentIndex` kept advancing into it -- skipping a card. This test walks
// a full 3-card session and asserts every item is shown exactly once, in a
// stable order, with the denominator never changing size mid-session.
describe('Practice page - regression #103 (mid-session deck reshuffle)', () => {
  it('keeps the deck fixed for the whole session: every item seen exactly once, none skipped or repeated', async () => {
    mocks.dueItems = [
      { verbId: '1', infinitive: 'vara', form: 'presens', itemId: '1-presens' },
      { verbId: '1', infinitive: 'vara', form: 'preteritum', itemId: '1-preteritum' },
      { verbId: '1', infinitive: 'vara', form: 'supinum', itemId: '1-supinum' },
    ];

    const answeredOrder: string[] = [];
    mocks.recordAnswer.mockImplementation((itemId: string) => {
      answeredOrder.push(itemId);
      // Simulate the real SRS hook: once an item is answered its next
      // review moves into the future, so it drops out of getDueItems().
      mocks.dueItems = mocks.dueItems.filter((item) => item.itemId !== itemId);
    });

    const user = userEvent.setup();
    renderWithProviders(<Practice />, { route: '/practice' });

    const expectedAnswers = [
      { itemId: '1-presens', answer: 'är' },
      { itemId: '1-preteritum', answer: 'var' },
      { itemId: '1-supinum', answer: 'varit' },
    ];

    for (let i = 0; i < expectedAnswers.length; i++) {
      // The denominator must stay 3 for the whole session, on every card --
      // this is exactly what the reshuffle bug breaks.
      expect(await screen.findByText(`${i + 1} / 3`)).toBeInTheDocument();

      const input = await screen.findByPlaceholderText('Type your answer...');
      await user.type(input, expectedAnswers[i].answer);
      expect(await screen.findByText('Correct!')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /next card/i }));
    }

    expect(await screen.findByText(/Great Work/i)).toBeInTheDocument();
    expect(answeredOrder).toEqual(expectedAnswers.map((e) => e.itemId));
    // No repeats, none skipped, all three seen exactly once.
    expect(new Set(answeredOrder).size).toBe(3);
  });
});
