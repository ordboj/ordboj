import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import confetti from 'canvas-confetti';
import { renderWithProviders } from '@/test/renderWithProviders';
import Practice from '@/pages/Practice';

// canvas-confetti is mocked globally in src/test/setup.ts.
const confettiMock = confetti as unknown as ReturnType<typeof vi.fn>;

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
    srsLoading: false,
    settingsLoading: false,
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
    srsStates: {},
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
      dailyGoal: 20,
      cefrLevels: ['A1'],
    },
    updateSettings: vi.fn(),
  }),
}));

beforeEach(() => {
  mocks.recordAnswer.mockClear();
  // `restoreMocks: true` (vitest.config.ts) is a documented no-op on a
  // plain vi.fn() (as opposed to a vi.spyOn spy), so canvas-confetti's
  // call history from src/test/setup.ts's vi.mock() must be cleared here.
  confettiMock.mockClear();
  mocks.srsLoading = false;
  mocks.settingsLoading = false;
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

    // Issue #100 / learning decision P8: two correct answers with no lapse
    // must not fire confetti per-card; the single goal-completion fire on
    // landing on the completion screen is the only one expected.
    expect(confettiMock).toHaveBeenCalledTimes(1);
  });

  it('shows the completion screen immediately when there are no due cards, without firing confetti', async () => {
    mocks.dueItems = [];
    renderWithProviders(<Practice />, { route: '/practice' });

    expect(await screen.findByText(/Great Work/i)).toBeInTheDocument();
    // Arriving to an empty queue is not "finishing a session" — no
    // celebration for a queue that was never worked.
    expect(confettiMock).not.toHaveBeenCalled();
  });

  it('shows a loading state before settings and progress have loaded', async () => {
    mocks.settingsLoading = true;
    renderWithProviders(<Practice />, { route: '/practice' });

    expect(screen.getByText(/Loading practice cards/i)).toBeInTheDocument();
    expect(screen.queryByText('1 / 2')).not.toBeInTheDocument();
  });
});

// Issue #100 / PR #202, learning decision P8: a correct answer only
// celebrates with confetti if it's a lapse recovery (the same itemId was
// graded wrong earlier in this sitting). Practice.tsx tracks this via
// failedItemIds, keyed on itemId, and passes celebrateOnCorrect down.
describe('Practice page - lapse-recovery confetti (issue #100 / P8)', () => {
  it('does not celebrate the first (wrong) attempt or an unrelated correct answer, but celebrates a later correct answer on the same item', async () => {
    // A real getDueItems() call can never return the same itemId twice
    // (useSrsProgress.getDueItems iterates verb x form once each), so an
    // *adjacent* repeat of the same itemId is not a reachable shape and
    // (separately) would collide with PracticeCard's `key={itemId}`
    // reconciliation. This queue instead separates the repeat with a
    // different item in between — item A is missed, item B (unrelated) is
    // answered correctly and must NOT celebrate, then A comes due again
    // later in the sitting and a correct answer on it must celebrate.
    mocks.dueItems = [
      { verbId: '1', infinitive: 'vara', form: 'presens', itemId: '1-presens' },
      { verbId: '1', infinitive: 'vara', form: 'preteritum', itemId: '1-preteritum' },
      { verbId: '1', infinitive: 'vara', form: 'presens', itemId: '1-presens' },
    ];
    const user = userEvent.setup();
    renderWithProviders(<Practice />, { route: '/practice' });

    // Card 1/3: item A ("1-presens"), answered wrong.
    expect(await screen.findByText('1 / 3')).toBeInTheDocument();
    const firstInput = await screen.findByPlaceholderText('Type your answer...');
    await user.type(firstInput, 'totallywrong');
    await user.click(screen.getByRole('button', { name: /check answer/i }));
    expect(await screen.findByText('Not quite')).toBeInTheDocument();
    expect(confettiMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /next card/i }));

    // Card 2/3: item B ("1-preteritum"), unrelated, answered correctly ->
    // must not celebrate (it was never missed).
    expect(await screen.findByText('2 / 3')).toBeInTheDocument();
    const secondInput = await screen.findByPlaceholderText('Type your answer...');
    await user.type(secondInput, 'var');
    expect(await screen.findByText('Correct!')).toBeInTheDocument();
    expect(confettiMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /next card/i }));

    // Card 3/3: item A again, answered correctly this time -> lapse
    // recovery -> confetti fires from the card itself, before the session
    // even finishes.
    expect(await screen.findByText('3 / 3')).toBeInTheDocument();
    const thirdInput = await screen.findByPlaceholderText('Type your answer...');
    await user.type(thirdInput, 'är');
    expect(await screen.findByText('Correct!')).toBeInTheDocument();
    expect(confettiMock).toHaveBeenCalledTimes(1);

    // Finishing the session on top of the lapse recovery adds exactly one
    // more (goal-completion) fire, not a second per-card one.
    await user.click(screen.getByRole('button', { name: /next card/i }));
    expect(await screen.findByText(/Great Work/i)).toBeInTheDocument();
    expect(confettiMock).toHaveBeenCalledTimes(2);

    expect(mocks.recordAnswer).toHaveBeenNthCalledWith(1, '1-presens', 0);
    expect(mocks.recordAnswer).toHaveBeenNthCalledWith(2, '1-preteritum', 5);
    expect(mocks.recordAnswer).toHaveBeenNthCalledWith(3, '1-presens', 5);
  });
});

describe('Practice page - icon-button accessibility and touch targets (issue #100)', () => {
  it('labels the mute toggle by current mute state and gives it a 44px touch target', async () => {
    // The shared mock settings fixture in this file has muteAudio: true, so
    // the accessible name is "Unmute audio" (state-dependent label).
    renderWithProviders(<Practice />, { route: '/practice' });

    await screen.findByText('1 / 2');
    const muteToggle = screen.getByRole('button', { name: 'Unmute audio' });
    expect(muteToggle.className).toMatch(/\bh-11\b/);
    expect(muteToggle.className).toMatch(/\bw-11\b/);
  });

  it('gives the back button a 44px-tall touch target', async () => {
    renderWithProviders(<Practice />, { route: '/practice' });

    await screen.findByText('1 / 2');
    const backButton = screen.getByRole('button', { name: /back/i });
    expect(backButton.className).toMatch(/\bh-11\b/);
  });
});
