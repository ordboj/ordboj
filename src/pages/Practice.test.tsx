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
      dailyGoal: mocks.dailyGoal,
      cefrLevels: ['A1'],
    },
    updateSettings: vi.fn(),
  }),
}));

// Five "vara" forms, distinct itemIds, so a queue longer than any dailyGoal
// cap used in these tests can be built by slicing this pool. Answers per
// docs/data — presens "är", preteritum "var" — repeated across ids so every
// sliced item has a known-correct typed answer.
const VARA_FORMS: Array<{ form: string; answer: string }> = [
  { form: 'presens', answer: 'är' },
  { form: 'preteritum', answer: 'var' },
  { form: 'presens', answer: 'är' },
  { form: 'preteritum', answer: 'var' },
  { form: 'presens', answer: 'är' },
];

function buildDueItems(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    verbId: '1',
    infinitive: 'vara',
    form: VARA_FORMS[i].form,
    itemId: `1-${VARA_FORMS[i].form}-${i}`,
  }));
}

beforeEach(() => {
  mocks.recordAnswer.mockClear();
  mocks.srsLoading = false;
  mocks.settingsLoading = false;
  mocks.dailyGoal = 20;
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

// Issue #131: dailyGoal was computed but never applied — a session dumped
// the entire due queue (156 cards observed in the wild) instead of the
// dailyGoal-sized sitting the setting promises. These tests pin the fix:
// the on-screen session (header counter, progress bar, completion summary,
// and which items get answered) is bounded by dailyGoal, not by the full
// due count.
describe('Practice page - session capped at dailyGoal (#131)', () => {
  it('caps the session at dailyGoal when more items are due than the goal', async () => {
    const user = userEvent.setup();
    mocks.dailyGoal = 2;
    mocks.dueItems = buildDueItems(5); // 5 due, cap should show only 2

    renderWithProviders(<Practice />, { route: '/practice' });

    // Header counter reflects the capped session size (2), never the full
    // due count (5).
    expect(await screen.findByText('1 / 2')).toBeInTheDocument();
    expect(screen.queryByText('1 / 5')).not.toBeInTheDocument();

    const firstInput = await screen.findByPlaceholderText('Type your answer...');
    await user.type(firstInput, VARA_FORMS[0].answer);
    await user.click(screen.getByRole('button', { name: /next card/i }));

    expect(await screen.findByText('2 / 2')).toBeInTheDocument();
    const secondInput = await screen.findByPlaceholderText('Type your answer...');
    await user.type(secondInput, VARA_FORMS[1].answer);
    await user.click(screen.getByRole('button', { name: /next card/i }));

    // Only the two capped items were ever answered — the remaining three
    // due items were never touched by the session.
    expect(mocks.recordAnswer).toHaveBeenCalledTimes(2);
    expect(mocks.recordAnswer).toHaveBeenNthCalledWith(1, '1-presens-0', 5);
    expect(mocks.recordAnswer).toHaveBeenNthCalledWith(2, '1-preteritum-1', 5);

    // Completion summary distinguishes "capped session done, more due"
    // from "backlog fully cleared".
    expect(await screen.findByText(/Great Work/i)).toBeInTheDocument();
    expect(
      screen.getByText(/completed today's session \(2 cards\)\. More are due/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/completed all due cards/i)).not.toBeInTheDocument();
  });

  it('floors the session cap at 1 item when dailyGoal is zero', async () => {
    const user = userEvent.setup();
    mocks.dailyGoal = 0;
    mocks.dueItems = buildDueItems(3);

    renderWithProviders(<Practice />, { route: '/practice' });

    // Math.max(1, dailyGoal): a goal of 0 must not produce an empty/broken
    // session — it still shows exactly one card, not zero and not all 3.
    expect(await screen.findByText('1 / 1')).toBeInTheDocument();

    const input = await screen.findByPlaceholderText('Type your answer...');
    await user.type(input, VARA_FORMS[0].answer);
    await user.click(screen.getByRole('button', { name: /next card/i }));

    expect(mocks.recordAnswer).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/Great Work/i)).toBeInTheDocument();
    expect(
      screen.getByText(/completed today's session \(1 cards\)\. More are due/i),
    ).toBeInTheDocument();
  });

  it('floors the session cap at 1 item when dailyGoal is negative', async () => {
    mocks.dailyGoal = -5;
    mocks.dueItems = buildDueItems(3);

    renderWithProviders(<Practice />, { route: '/practice' });

    expect(await screen.findByText('1 / 1')).toBeInTheDocument();
  });

  it('derives the progress bar fill from the capped session, not the full due count', async () => {
    // NOTE: src/components/ui/progress.tsx never forwards `value` to
    // Radix's ProgressPrimitive.Root (it's destructured out and only used
    // for the indicator's inline transform), so Radix always treats the
    // bar as indeterminate and never sets aria-valuenow. That's a
    // pre-existing, out-of-scope accessibility bug in a shared shadcn
    // primitive, unrelated to #131 — reported separately. This test reads
    // the visual fill (the inline transform driven directly by the
    // `progressPercent` prop) instead of the broken ARIA attribute.
    const user = userEvent.setup();
    mocks.dailyGoal = 2;
    mocks.dueItems = buildDueItems(5);

    renderWithProviders(<Practice />, { route: '/practice' });

    await screen.findByText('1 / 2');
    const bar = screen.getByRole('progressbar');
    const indicator = bar.firstElementChild as HTMLElement;
    // 1 of 2 capped items => 50% fill (translateX(-50%)). Against the full
    // due count of 5 this would read 20% (translateX(-80%)) instead — the
    // wrong denominator would be silent and hard to notice visually, so
    // pin the exact transform.
    expect(indicator.style.transform).toBe('translateX(-50%)');

    const input = await screen.findByPlaceholderText('Type your answer...');
    await user.type(input, VARA_FORMS[0].answer);
    await user.click(screen.getByRole('button', { name: /next card/i }));

    expect(await screen.findByText('2 / 2')).toBeInTheDocument();
    const indicatorAfter = screen.getByRole('progressbar').firstElementChild as HTMLElement;
    expect(indicatorAfter.style.transform).toBe('translateX(-0%)');
  });
});
