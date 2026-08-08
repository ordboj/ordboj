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

    // Issue #100: two correct answers land on the completion screen, which
    // fires the single goal-completion confetti (not a per-card one).
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
    // Exact match: PracticeCard's backspace key also has an accessible name
    // containing "Back" ("Backspace"), so a loose /back/i regex here would
    // match both buttons.
    const backButton = screen.getByRole('button', { name: 'Back' });
    expect(backButton.className).toMatch(/\bh-11\b/);
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
