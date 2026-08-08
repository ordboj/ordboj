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
  // mockReset (not mockClear): also drops any per-test mockImplementation
  // set below, so a requeue-behavior test can't leak its stub into the
  // next test. Default (no implementation) matches plain vi.fn(): calling
  // it returns undefined, which is what recordAnswer(...)?.needsRequeue
  // ?? false is written to tolerate.
  mocks.recordAnswer.mockReset();
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

// "vara" conjugations used throughout: presens "är", preteritum "var",
// supinum "varit", imperativ "var" (same fixture as PracticeCard.test.tsx).
describe('Practice page - relearning requeue (issue #133)', () => {
  it('regression: a failed card is requeued and answered again within the same session, instead of only appearing the next day', async () => {
    // Models the real recordAnswer contract (srs-engine): only a grade-0
    // lapse asks the page to requeue.
    mocks.recordAnswer.mockImplementation((_itemId: string, grade: number) => ({
      needsRequeue: grade === 0,
    }));
    mocks.dueItems = [
      { verbId: '1', infinitive: 'vara', form: 'presens', itemId: '1-presens' },
      { verbId: '1', infinitive: 'vara', form: 'preteritum', itemId: '1-preteritum' },
      { verbId: '1', infinitive: 'vara', form: 'supinum', itemId: '1-supinum' },
    ];

    const user = userEvent.setup();
    renderWithProviders(<Practice />, { route: '/practice' });

    // Card 1/3: fail it on purpose.
    expect(await screen.findByText('1 / 3')).toBeInTheDocument();
    let input = await screen.findByPlaceholderText('Type your answer...');
    await user.type(input, 'totallywrong');
    await user.click(screen.getByRole('button', { name: /check answer/i }));
    expect(await screen.findByText('Not quite')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /next card/i }));

    // The session grew: the failed card was reinserted, not dropped. With
    // 3 original items and RELEARNING_MIN_GAP=3, it lands at the very end,
    // so the queue is now 4 items long and we're on card 2 of 4.
    expect(await screen.findByText('2 / 4')).toBeInTheDocument();

    // Card 2/4 ("preteritum") and Card 3/4 ("supinum"): answer correctly.
    input = await screen.findByPlaceholderText('Type your answer...');
    await user.type(input, 'var');
    await screen.findByText('Correct!');
    await user.click(screen.getByRole('button', { name: /next card/i }));

    expect(await screen.findByText('3 / 4')).toBeInTheDocument();
    input = await screen.findByPlaceholderText('Type your answer...');
    await user.type(input, 'varit');
    await screen.findByText('Correct!');
    await user.click(screen.getByRole('button', { name: /next card/i }));

    // Card 4/4: this is the requeued "presens" card, back for a second
    // attempt in THIS session — not tomorrow. Prove it's the same question
    // by answering it correctly this time.
    expect(await screen.findByText('4 / 4')).toBeInTheDocument();
    input = await screen.findByPlaceholderText('Type your answer...');
    await user.type(input, 'är');
    await screen.findByText('Correct!');
    await user.click(screen.getByRole('button', { name: /next card/i }));

    expect(await screen.findByText(/Great Work/i)).toBeInTheDocument();

    expect(mocks.recordAnswer).toHaveBeenCalledTimes(4);
    expect(mocks.recordAnswer.mock.calls.map((call) => call[0])).toEqual([
      '1-presens',
      '1-preteritum',
      '1-supinum',
      '1-presens',
    ]);
    expect(mocks.recordAnswer.mock.calls.map((call) => call[1])).toEqual([0, 5, 5, 5]);
  });

  it('reinserts a lapsed card RELEARNING_MIN_GAP (3) items ahead, not at the very end, when enough cards remain', async () => {
    mocks.recordAnswer.mockImplementation((_itemId: string, grade: number) => ({
      needsRequeue: grade === 0,
    }));
    // 5 items: enough that the gap-3 reinsertion lands in the middle of the
    // queue, not at the tail (that tail-clamped case is covered above).
    mocks.dueItems = [
      { verbId: '1', infinitive: 'vara', form: 'presens', itemId: '1-presens' },
      { verbId: '1', infinitive: 'vara', form: 'preteritum', itemId: '1-preteritum' },
      { verbId: '1', infinitive: 'vara', form: 'supinum', itemId: '1-supinum' },
      { verbId: '1', infinitive: 'vara', form: 'imperativ', itemId: '1-imperativ' },
      { verbId: '1', infinitive: 'vara', form: 'presens', itemId: '1-presens-b' },
    ];

    const user = userEvent.setup();
    renderWithProviders(<Practice />, { route: '/practice' });

    // Card 1/5: fail the first "presens" card.
    expect(await screen.findByText('1 / 5')).toBeInTheDocument();
    let input = await screen.findByPlaceholderText('Type your answer...');
    await user.type(input, 'totallywrong');
    await user.click(screen.getByRole('button', { name: /check answer/i }));
    await screen.findByText('Not quite');
    await user.click(screen.getByRole('button', { name: /next card/i }));

    // Queue grew to 6. Two correct answers in between ("preteritum",
    // "supinum")...
    expect(await screen.findByText('2 / 6')).toBeInTheDocument();
    input = await screen.findByPlaceholderText('Type your answer...');
    await user.type(input, 'var');
    await screen.findByText('Correct!');
    await user.click(screen.getByRole('button', { name: /next card/i }));

    expect(await screen.findByText('3 / 6')).toBeInTheDocument();
    input = await screen.findByPlaceholderText('Type your answer...');
    await user.type(input, 'varit');
    await screen.findByText('Correct!');
    await user.click(screen.getByRole('button', { name: /next card/i }));

    // ...and card 4/6 must be the requeued "presens" card (correct answer
    // "är"), landing exactly 3 items after the original failure — not the
    // real card 4 ("imperativ") that would appear there without the
    // requeue insertion.
    expect(await screen.findByText('4 / 6')).toBeInTheDocument();
    expect(screen.getByText(/Missing:/)).toHaveTextContent('Present');
    input = await screen.findByPlaceholderText('Type your answer...');
    await user.type(input, 'är');
    await screen.findByText('Correct!');

    expect(mocks.recordAnswer.mock.calls.map((call) => call[0])).toEqual([
      '1-presens',
      '1-preteritum',
      '1-supinum',
      '1-presens',
    ]);
  });

  it('does not requeue a hinted correct answer (grade 3): only a genuine lapse gets a same-session retry', async () => {
    mocks.recordAnswer.mockImplementation((_itemId: string, grade: number) => ({
      needsRequeue: grade === 0,
    }));
    mocks.dueItems = [
      { verbId: '1', infinitive: 'vara', form: 'presens', itemId: '1-presens' },
      { verbId: '1', infinitive: 'vara', form: 'preteritum', itemId: '1-preteritum' },
    ];

    const user = userEvent.setup();
    renderWithProviders(<Practice />, { route: '/practice' });

    expect(await screen.findByText('1 / 2')).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: /hint/i }));
    const input = await screen.findByPlaceholderText('Type your answer...');
    await user.type(input, 'är');
    await screen.findByText('Correct!');
    await user.click(screen.getByRole('button', { name: /next card/i }));

    // Queue must stay at its original length: a hinted correct answer
    // (grade 3) is not a lapse and must not trigger a requeue.
    expect(await screen.findByText('2 / 2')).toBeInTheDocument();
    expect(mocks.recordAnswer).toHaveBeenNthCalledWith(1, '1-presens', 3);
  });
});
