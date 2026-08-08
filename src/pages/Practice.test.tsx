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
    navigate: vi.fn(),
    dueItems: [] as Array<{ verbId: string; infinitive: string; form: string; itemId: string }>,
    srsLoading: false,
    settingsLoading: false,
  };
});

// useNavigate is spied so the "Done for now" door button's destination is an
// observable assertion, not an inferred side effect. MemoryRouter and every
// other export are passed through untouched via importOriginal, so
// renderWithProviders still gets a real router around the page.
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mocks.navigate,
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
  mocks.navigate.mockClear();
  mocks.srsLoading = false;
  mocks.settingsLoading = false;
  mocks.dueItems = [
    { verbId: '1', infinitive: 'vara', form: 'presens', itemId: '1-presens' },
    { verbId: '1', infinitive: 'vara', form: 'preteritum', itemId: '1-preteritum' },
  ];
});

// Builds N due items, cycling through the four forms of a verb whose full
// paradigm is filled in (verbData.ts row for "vara" has no "(not
// available)" forms), so PracticeCard never hits its empty-imperativ edge
// case here. recordAnswer is mocked, so correctness of the typed answer is
// irrelevant to session-shape assertions below: every card is answered with
// a deliberately wrong "x" to reach "Next Card" as fast as possible.
function buildDueItems(count: number) {
  const forms = ['presens', 'preteritum', 'supinum', 'imperativ'] as const;
  return Array.from({ length: count }, (_, i) => ({
    verbId: '1',
    infinitive: 'vara',
    form: forms[i % forms.length],
    itemId: `item-${i}`,
  }));
}

// Answers exactly one visible card (typing mode): types a wrong answer,
// checks it, then advances past the "Next Card" feedback screen.
async function answerOneCard(user: ReturnType<typeof userEvent.setup>) {
  const input = await screen.findByPlaceholderText('Type your answer...');
  await user.type(input, 'x');
  await user.click(screen.getByRole('button', { name: /check answer/i }));
  await user.click(await screen.findByRole('button', { name: /next card/i }));
}

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

// Issue #111 acceptance criterion 2: Practice enforces a 15-item sitting
// cap presented as an optional stopping point (a "door"), one tap to
// continue and one tap to stop, neither styled as failure or success.
// Criteria 1, 3 and 4 are explicitly out of scope for this PR (blocked on
// srs-engine's day-boundary fix) and are not exercised here.
describe('Practice page - 15-item sitting cap door (issue #111 criterion 2)', () => {
  it('does not show a stopping-point door before the 15th card of a sitting', async () => {
    mocks.dueItems = buildDueItems(20);
    const user = userEvent.setup();
    renderWithProviders(<Practice />, { route: '/practice' });

    expect(await screen.findByText('1 / 15')).toBeInTheDocument();

    for (let i = 0; i < 14; i++) {
      await answerOneCard(user);
    }

    // Still inside the first sitting: card 15 of 15, no door yet.
    expect(await screen.findByText('15 / 15')).toBeInTheDocument();
    expect(screen.queryByText('Stopping point')).not.toBeInTheDocument();
  }, 20000);

  it('stops at a neutral door after the 15th answered card, phrased as capacity not debt', async () => {
    mocks.dueItems = buildDueItems(20);
    const user = userEvent.setup();
    renderWithProviders(<Practice />, { route: '/practice' });

    for (let i = 0; i < 15; i++) {
      await answerOneCard(user);
    }

    expect(await screen.findByText('Stopping point')).toBeInTheDocument();
    expect(
      screen.getByText(/You've done 15 this sitting\. Keep going or stop here/i),
    ).toBeInTheDocument();
    // Neither choice is styled as failure/success language: no "correct",
    // "wrong", "great work" or similar framing appears on the door screen.
    expect(screen.queryByText(/correct/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/great work/i)).not.toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Keep going' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Done for now' })).toBeInTheDocument();

    // The card itself is not rendered underneath the door: no dead-end
    // partial state, and no way to answer past the cap without a tap.
    expect(screen.queryByPlaceholderText('Type your answer...')).not.toBeInTheDocument();
  }, 20000);

  it("'Keep going' resumes the queue and starts a fresh sitting counter, not a continuation of the old backlog count", async () => {
    mocks.dueItems = buildDueItems(20);
    const user = userEvent.setup();
    renderWithProviders(<Practice />, { route: '/practice' });

    for (let i = 0; i < 15; i++) {
      await answerOneCard(user);
    }
    await user.click(await screen.findByRole('button', { name: /keep going/i }));

    // Second sitting has only 5 items left, and the counter reflects that
    // sitting's own size (5), not the original 20-item backlog.
    expect(await screen.findByText('1 / 5')).toBeInTheDocument();
    expect(screen.queryByText('Stopping point')).not.toBeInTheDocument();
  }, 20000);

  it("'Done for now' at the door navigates home instead of trapping the learner mid-sitting", async () => {
    mocks.dueItems = buildDueItems(20);
    const user = userEvent.setup();
    renderWithProviders(<Practice />, { route: '/practice' });

    for (let i = 0; i < 15; i++) {
      await answerOneCard(user);
    }
    await user.click(await screen.findByRole('button', { name: 'Done for now' }));

    expect(mocks.navigate).toHaveBeenCalledWith('/');
  }, 20000);

  it('does not open a dead-end door when a sitting boundary lands exactly on the end of the due queue', async () => {
    // Regression: the sitting-boundary check must run only when items
    // remain. If the completion check (`nextIndex >= dueItems.length`) were
    // ever ordered after the boundary check (`nextIndex % SITTING_SIZE ===
    // 0`), a queue that is an exact multiple of 15 would land its second
    // sitting on a door with nowhere to actually go — a dead end. A
    // 30-item queue (exactly two sittings, no
    // remainder) exercises both boundaries: a real door after the first 15,
    // then completion (not a trailing empty door) after the second 15.
    mocks.dueItems = buildDueItems(30);
    const user = userEvent.setup();
    renderWithProviders(<Practice />, { route: '/practice' });

    for (let i = 0; i < 15; i++) {
      await answerOneCard(user);
    }
    expect(await screen.findByRole('button', { name: 'Keep going' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /keep going/i }));

    for (let i = 0; i < 15; i++) {
      await answerOneCard(user);
    }

    expect(await screen.findByText(/Great Work/i)).toBeInTheDocument();
    expect(screen.queryByText('Stopping point')).not.toBeInTheDocument();
  }, 30000);

  it('reaching the end of a partial second sitting completes the session rather than opening a second door', async () => {
    mocks.dueItems = buildDueItems(20);
    const user = userEvent.setup();
    renderWithProviders(<Practice />, { route: '/practice' });

    for (let i = 0; i < 15; i++) {
      await answerOneCard(user);
    }
    await user.click(await screen.findByRole('button', { name: /keep going/i }));
    for (let i = 0; i < 5; i++) {
      await answerOneCard(user);
    }

    expect(await screen.findByText(/Great Work/i)).toBeInTheDocument();
    expect(screen.queryByText('Stopping point')).not.toBeInTheDocument();
  }, 20000);

  it('the position counter tracks progress within the current sitting, not the raw due backlog', async () => {
    // Regression for the progress-bar leak the door fix also closed: before
    // this PR, `(currentIndex + 1) / dueItems.length` would show "6 / 20"
    // here, exposing the full backlog size inside a bounded 15-item
    // sitting instead of sitting-relative capacity.
    mocks.dueItems = buildDueItems(20);
    const user = userEvent.setup();
    renderWithProviders(<Practice />, { route: '/practice' });

    for (let i = 0; i < 5; i++) {
      await answerOneCard(user);
    }

    expect(await screen.findByText('6 / 15')).toBeInTheDocument();
    expect(screen.queryByText('6 / 20')).not.toBeInTheDocument();
  });
});
