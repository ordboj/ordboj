import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
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
//
// The useSrsProgress mock keeps its own React state for `answeredToday` and
// bumps it every time `recordAnswer` fires, mirroring the real hook's
// contract (issue #26: answeredToday goes up by one per recorded answer, and
// Practice.tsx's session-bound logic reacts to that value). A fully static
// mock would hide the header/ending behavior this suite exists to pin.
const mocks = vi.hoisted(() => {
  return {
    recordAnswer: vi.fn(),
    dueItems: [] as Array<{ verbId: string; infinitive: string; form: string; itemId: string }>,
    srsLoading: false,
    settingsLoading: false,
    dailyGoal: 12,
  };
});

vi.mock('@/hooks/useSrsProgress', () => ({
  useSrsProgress: () => {
    const [answeredToday, setAnsweredToday] = useState(0);
    return {
      isLoading: mocks.srsLoading,
      getDueItems: async () => mocks.dueItems,
      recordAnswer: (itemId: string, grade: number) => {
        mocks.recordAnswer(itemId, grade);
        setAnsweredToday((c) => c + 1);
      },
      answeredToday,
      exportData: () => '{}',
      importData: () => true,
      resetProgress: () => undefined,
      srsStates: {},
      initializeAllItems: () => undefined,
    };
  },
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

beforeEach(() => {
  mocks.recordAnswer.mockClear();
  mocks.srsLoading = false;
  mocks.settingsLoading = false;
  mocks.dailyGoal = 12;
  mocks.dueItems = [
    { verbId: '1', infinitive: 'vara', form: 'presens', itemId: '1-presens' },
    { verbId: '1', infinitive: 'vara', form: 'preteritum', itemId: '1-preteritum' },
  ];
});

describe('Practice page - one full session', () => {
  it('walks through both due cards and lands on the completion screen, recording each answer', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Practice />, { route: '/practice' });

    // Card 1 of 2: "vara" presens -> "är". Header reads answeredToday /
    // dailyGoal (issue #26), not "card index / queue length".
    expect(await screen.findByText('0 / 12')).toBeInTheDocument();
    const firstInput = await screen.findByPlaceholderText('Type your answer...');
    await user.type(firstInput, 'är');
    expect(await screen.findByText('Correct!')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /next card/i }));

    // Card 2 of 2: "vara" preteritum -> "var"
    expect(await screen.findByText('1 / 12')).toBeInTheDocument();
    const secondInput = await screen.findByPlaceholderText('Type your answer...');
    await user.type(secondInput, 'var');
    expect(await screen.findByText('Correct!')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /next card/i }));

    // Session complete screen: the queue is exhausted (dailyGoal 12 not yet
    // reached at 2 answers).
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
    expect(screen.queryByText('0 / 12')).not.toBeInTheDocument();
  });

  it('issue #26: ends the session once answeredToday reaches dailyGoal, even with due cards still left in the queue', async () => {
    mocks.dailyGoal = 1;
    mocks.dueItems = [
      { verbId: '1', infinitive: 'vara', form: 'presens', itemId: '1-presens' },
      { verbId: '1', infinitive: 'vara', form: 'preteritum', itemId: '1-preteritum' },
    ];
    const user = userEvent.setup();
    renderWithProviders(<Practice />, { route: '/practice' });

    expect(await screen.findByText('0 / 1')).toBeInTheDocument();
    const input = await screen.findByPlaceholderText('Type your answer...');
    await user.type(input, 'är');
    expect(await screen.findByText('Correct!')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /next card/i }));

    // dailyGoal (1) is met after the first answer: the session ends even
    // though "1-preteritum" is still sitting in the due queue, unanswered.
    expect(await screen.findByText(/Great Work/i)).toBeInTheDocument();
    expect(mocks.recordAnswer).toHaveBeenCalledTimes(1);
  });

  it('issue #26: skips fetching a queue at all when answeredToday already meets dailyGoal on mount', async () => {
    mocks.dailyGoal = 0;
    renderWithProviders(<Practice />, { route: '/practice' });

    expect(await screen.findByText(/Great Work/i)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Type your answer...')).not.toBeInTheDocument();
  });
});
