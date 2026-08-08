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
// recordAnswerWithRequeue's mock implementation mirrors the real hook's
// documented contract (src/hooks/useSrsProgress.ts: REQUEUE_GAP = 3 items
// ahead, clamped to the end of the queue, only on grade 0) so this suite
// can exercise Practice.tsx's own state machine - "does it thread the
// returned queue and index through correctly" - without reaching into the
// real hook, which qa does not own the internals of.
const mocks = vi.hoisted(() => {
  return {
    recordAnswerWithRequeue: vi.fn(
      (
        item: { verbId: string; infinitive: string; form: string; itemId: string },
        grade: number,
        queue: Array<{ verbId: string; infinitive: string; form: string; itemId: string }>,
        currentIndex: number,
      ) => {
        if (grade !== 0) return queue;
        const insertAt = Math.min(currentIndex + 1 + 3, queue.length);
        const requeued = [...queue];
        requeued.splice(insertAt, 0, item);
        return requeued;
      },
    ),
    // A stable function identity across renders, matching the real hook's
    // useCallback-wrapped getDueItems: Practice.tsx's load effect lists
    // getDueItems in its dependency array, so a fresh identity per render
    // (e.g. an inline arrow defined here) would re-fire that effect after
    // every requeue-driven state update and clobber the in-session queue
    // back to this fixture's static list, masking the very behavior this
    // suite exists to check.
    getDueItems: vi.fn(async () => mocks.dueItems),
    dueItems: [] as Array<{ verbId: string; infinitive: string; form: string; itemId: string }>,
    srsLoading: false,
    settingsLoading: false,
  };
});

vi.mock('@/hooks/useSrsProgress', () => ({
  useSrsProgress: () => ({
    isLoading: mocks.srsLoading,
    getDueItems: mocks.getDueItems,
    recordAnswerWithRequeue: mocks.recordAnswerWithRequeue,
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
  mocks.recordAnswerWithRequeue.mockClear();
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

    expect(mocks.recordAnswerWithRequeue).toHaveBeenCalledTimes(2);
    expect(mocks.recordAnswerWithRequeue.mock.calls[0][0]).toMatchObject({ itemId: '1-presens' });
    expect(mocks.recordAnswerWithRequeue.mock.calls[0][1]).toBe(5);
    expect(mocks.recordAnswerWithRequeue.mock.calls[1][0]).toMatchObject({
      itemId: '1-preteritum',
    });
    expect(mocks.recordAnswerWithRequeue.mock.calls[1][1]).toBe(5);
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

describe('Practice page - in-session relearning queue (issue #133)', () => {
  // Regression coverage for #133: "failed cards vanish until tomorrow".
  // A wrong answer must be re-shown before this same sitting ends, not
  // only reappear the next day via dueAt+1day. Practice.tsx must thread
  // the queue recordAnswerWithRequeue hands back through setDueItems and
  // use its length (not the original dueItems.length) to decide whether
  // the session is complete.
  it('re-shows a failed card later in the same session instead of ending after the original queue length', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Practice />, { route: '/practice' });

    // Card 1 of 2: answer "vara" presens wrong.
    expect(await screen.findByText('1 / 2')).toBeInTheDocument();
    const firstInput = await screen.findByPlaceholderText('Type your answer...');
    await user.type(firstInput, 'totallywrong');
    await user.click(screen.getByRole('button', { name: /check answer/i }));
    expect(await screen.findByText('Not quite')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /next card/i }));

    // The queue grew: the failed item was re-inserted, so the counter now
    // reads against 3 items, not the original 2 - the session did not end
    // at "2 / 2" and the failed card was not simply dropped until tomorrow.
    expect(await screen.findByText('2 / 3')).toBeInTheDocument();

    // Card 2: "vara" preteritum -> "var", answered correctly.
    const secondInput = await screen.findByPlaceholderText('Type your answer...');
    await user.type(secondInput, 'var');
    expect(await screen.findByText('Correct!')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /next card/i }));

    // Card 3: the requeued "vara" presens card, re-asked within this same
    // sitting. Answer it correctly this time.
    expect(await screen.findByText('3 / 3')).toBeInTheDocument();
    const thirdInput = await screen.findByPlaceholderText('Type your answer...');
    await user.type(thirdInput, 'är');
    expect(await screen.findByText('Correct!')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /next card/i }));

    expect(await screen.findByText(/Great Work/i)).toBeInTheDocument();

    expect(mocks.recordAnswerWithRequeue).toHaveBeenCalledTimes(3);
    // The first call is the lapse: itemId "1-presens", grade 0.
    expect(mocks.recordAnswerWithRequeue.mock.calls[0][0]).toMatchObject({ itemId: '1-presens' });
    expect(mocks.recordAnswerWithRequeue.mock.calls[0][1]).toBe(0);
    // The third call is the same item, re-asked and now answered correctly.
    expect(mocks.recordAnswerWithRequeue.mock.calls[2][0]).toMatchObject({ itemId: '1-presens' });
    expect(mocks.recordAnswerWithRequeue.mock.calls[2][1]).toBe(5);
  });
});
