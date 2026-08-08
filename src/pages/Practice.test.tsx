import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
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
// Minimal SrsState stub (see @/lib/srs) - buildSession() in Practice.tsx
// only reads `repetitions`, but the mock's shape should still look like the
// real thing rather than an arbitrary partial.
interface SrsStateStub {
  itemId: string;
  repetitions: number;
  intervalDays: number;
  easeFactor: number;
  dueAt: number;
}

const mocks = vi.hoisted(() => {
  return {
    recordAnswer: vi.fn(),
    dueItems: [] as Array<{ verbId: string; infinitive: string; form: string; itemId: string }>,
    srsStates: {} as Record<string, SrsStateStub>,
    srsLoading: false,
    settingsLoading: false,
    dailyGoal: 20,
  };
});

vi.mock('@/hooks/useSrsProgress', () => ({
  useSrsProgress: () => ({
    isLoading: mocks.srsLoading,
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
    settings: {
      practiceMode: 'typing',
      showExamples: false,
      autoplayAudio: false,
      muteAudio: true,
      dailyGoal: mocks.dailyGoal,
      cefrLevels: ['A1'],
    },
    updateSettings: vi.fn(),
  }),
}));

// Every constructed item is "vara" presens ("är") regardless of its id
// prefix - review-vs-new status is driven purely by `mocks.srsStates`, not
// by the verb content, so every typed answer in every test below is "är".
function buildItems(idPrefix: string, count: number) {
  return Array.from({ length: count }, (_, i) => ({
    verbId: '1',
    infinitive: 'vara',
    form: 'presens',
    itemId: `${idPrefix}-${i}`,
  }));
}

function reviewState(itemId: string): SrsStateStub {
  return { itemId, repetitions: 1, intervalDays: 1, easeFactor: 2.5, dueAt: 0 };
}

async function answerAndAdvance(user: ReturnType<typeof userEvent.setup>) {
  const input = await screen.findByPlaceholderText('Type your answer...');
  await user.type(input, 'är');
  await screen.findByText('Correct!');
  await user.click(screen.getByRole('button', { name: /next card/i }));
}

beforeEach(() => {
  mocks.recordAnswer.mockClear();
  mocks.srsLoading = false;
  mocks.settingsLoading = false;
  mocks.dailyGoal = 20;
  mocks.srsStates = {};
  mocks.dueItems = [
    { verbId: '1', infinitive: 'vara', form: 'presens', itemId: '1-presens' },
    { verbId: '1', infinitive: 'vara', form: 'preteritum', itemId: '1-preteritum' },
  ];
});

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

// PR #181 / issue #131: the session used to dump the entire due queue (156+
// cards on a fresh install) instead of respecting `dailyGoal`. These tests
// pin the fix to the numbers in docs/learning/session-shape-and-daily-goal.md
// and docs/learning/new-vs-review-mix.md.
describe('Practice page - daily goal session cap (#131)', () => {
  it('regression #131: caps the session at dailyGoal instead of queuing all due reviews, suppresses new items while the review backlog exceeds the goal, and free practice records nothing', async () => {
    const user = userEvent.setup();
    mocks.dailyGoal = 5;

    // 30 due reviews + 10 never-answered items = 40 due, far more than the
    // 156-card blowout the ticket describes was even needed to prove the bug.
    const reviews = buildItems('rev', 30);
    const newItems = buildItems('new', 10);
    mocks.dueItems = [...reviews, ...newItems];
    mocks.srsStates = Object.fromEntries(reviews.map((it) => [it.itemId, reviewState(it.itemId)]));

    renderWithProviders(<Practice />, { route: '/practice' });

    // newAllowedToday = clamp(0, round(5*0.3)=2, floor((5 - min(30,5))/3)=0) = 0:
    // reviews alone already meet the goal, so new items are fully suppressed
    // (new-vs-review-mix.md) and the session is exactly 5 reviews, not 40.
    expect(await screen.findByText(/^1 \/ 5\b/)).toBeInTheDocument();
    expect(screen.getByText(/\+35 waiting/)).toBeInTheDocument();

    for (let i = 0; i < 5; i++) {
      await answerAndAdvance(user);
    }

    // Every recorded answer is one of the first 5 reviews, in order - the
    // capped session, not the raw due queue.
    expect(mocks.recordAnswer).toHaveBeenCalledTimes(5);
    for (let i = 0; i < 5; i++) {
      expect(mocks.recordAnswer).toHaveBeenNthCalledWith(i + 1, `rev-${i}`, 5);
    }

    // Goal reached with 35 items still waiting: continue/stop prompt, not
    // the completion screen.
    expect(await screen.findByText(/Goal reached/i)).toBeInTheDocument();
    expect(screen.getByText(/\+35 more waiting/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /keep practising/i }));

    // Free practice batch is capped at 5 (FREE_PRACTICE_BATCH_SIZE) and
    // carries no backlog badge.
    expect(await screen.findByText('1 / 5')).toBeInTheDocument();
    expect(screen.queryByText(/waiting/i)).not.toBeInTheDocument();

    for (let i = 0; i < 5; i++) {
      await answerAndAdvance(user);
    }

    // Free practice must never call recordAnswer (session-shape-and-daily-
    // goal.md: "records nothing - no recordAnswer, no dueAt change, no ease
    // change"). The count from the graded session above must be unchanged.
    expect(mocks.recordAnswer).toHaveBeenCalledTimes(5);

    expect(await screen.findByText(/Great Work/i)).toBeInTheDocument();
    expect(screen.getByText(/completed today's goal/i)).toBeInTheDocument();
    expect(screen.getByText(/\+35 waiting whenever you're ready/)).toBeInTheDocument();
  }, 15000);

  it('gates new items by remaining review capacity per the new-vs-review mix formula, reviews served before new items', async () => {
    const user = userEvent.setup();
    mocks.dailyGoal = 20;

    const reviews = buildItems('rev', 5);
    const newItems = buildItems('new', 100);
    mocks.dueItems = [...reviews, ...newItems];
    mocks.srsStates = Object.fromEntries(reviews.map((it) => [it.itemId, reviewState(it.itemId)]));

    renderWithProviders(<Practice />, { route: '/practice' });

    // reviewsDueToday=5, newPerDayMax=round(20*0.3)=6,
    // newAllowedToday=clamp(0,6,floor((20-5)/3)=5)=5 -> session = 5+5 = 10,
    // never the raw 105 due items and never padded up to dailyGoal=20.
    expect(await screen.findByText(/^1 \/ 10\b/)).toBeInTheDocument();
    expect(screen.getByText(/\+95 waiting/)).toBeInTheDocument();

    // Reviews are served first: the very first card recorded must be a
    // review item, not one of the 100 new items.
    await answerAndAdvance(user);
    expect(mocks.recordAnswer).toHaveBeenNthCalledWith(1, 'rev-0', 5);
  });
});
