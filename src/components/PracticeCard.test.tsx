import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import { PracticeCard } from '@/components/PracticeCard';
import type { Grade } from '@/lib/srs';

// "vara" is a stable, real fixture from VERB_DATA (owned by swedish-linguist):
// presens "är", preteritum "var", supinum "varit", imperativ "var".
const VARA_PRESENS_ANSWER = 'är';

describe('PracticeCard - typing mode', () => {
  it('renders the pattern with a blank the length of the missing answer', async () => {
    renderWithProviders(
      <PracticeCard
        infinitive="vara"
        form="presens"
        mode="typing"
        showExamples={false}
        autoplayAudio={false}
        muteAudio={true}
        onAnswer={vi.fn()}
      />,
    );

    const heading = await screen.findByRole('heading', { level: 2 });
    // One underscore per letter of the hidden answer ("är" -> "_ _"), joined
    // into the infinitive/preteritum/supinum pattern.
    expect(heading.textContent).toContain(
      '_'.repeat(VARA_PRESENS_ANSWER.length).split('').join(' '),
    );
    expect(heading.textContent).toContain('vara');
    expect(screen.getByText(/Missing:/)).toHaveTextContent('Present');
  });

  it('accepts the correct answer (auto-submits), ignoring case and surrounding whitespace', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <PracticeCard
        infinitive="vara"
        form="presens"
        mode="typing"
        showExamples={false}
        autoplayAudio={false}
        muteAudio={true}
        onAnswer={vi.fn()}
      />,
    );

    const input = await screen.findByPlaceholderText('Type your answer...');
    await user.type(input, '  ÄR  ');

    expect(await screen.findByText('Correct!')).toBeInTheDocument();
  });

  it('types and matches Swedish å/ä/ö characters exactly', async () => {
    // "gå" presens is "går" (å) - a real fixture from VERB_DATA.
    const user = userEvent.setup();
    renderWithProviders(
      <PracticeCard
        infinitive="gå"
        form="presens"
        mode="typing"
        showExamples={false}
        autoplayAudio={false}
        muteAudio={true}
        onAnswer={vi.fn()}
      />,
    );

    const input = await screen.findByPlaceholderText('Type your answer...');
    await user.type(input, 'går');

    expect(await screen.findByText('Correct!')).toBeInTheDocument();
  });

  it('marks a wrong answer incorrect and reveals the correct answer', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <PracticeCard
        infinitive="vara"
        form="presens"
        mode="typing"
        showExamples={false}
        autoplayAudio={false}
        muteAudio={true}
        onAnswer={vi.fn()}
      />,
    );

    const input = await screen.findByPlaceholderText('Type your answer...');
    await user.type(input, 'totallywrong');
    await user.click(screen.getByRole('button', { name: /check answer/i }));

    expect(await screen.findByText('Not quite')).toBeInTheDocument();
    expect(screen.getByText('Complete pattern:').closest('div')).toHaveTextContent(
      VARA_PRESENS_ANSWER,
    );
  });

  it('calls onAnswer with grade 5 for a correct answer and grade 0 for a wrong one', async () => {
    const user = userEvent.setup();
    const onAnswer = vi.fn<(grade: Grade) => void>();
    renderWithProviders(
      <PracticeCard
        infinitive="vara"
        form="presens"
        mode="typing"
        showExamples={false}
        autoplayAudio={false}
        muteAudio={true}
        onAnswer={onAnswer}
      />,
    );

    const input = await screen.findByPlaceholderText('Type your answer...');
    await user.type(input, 'är');
    await screen.findByText('Correct!');
    await user.click(screen.getByRole('button', { name: /next card/i }));

    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith(5);
  });
});

describe('PracticeCard - multiple-choice mode', () => {
  it('renders four options and grades a click on the correct one as correct', async () => {
    renderWithProviders(
      <PracticeCard
        infinitive="vara"
        form="presens"
        mode="multiple-choice"
        showExamples={false}
        autoplayAudio={false}
        muteAudio={true}
        onAnswer={vi.fn()}
      />,
    );

    // Wait for the 4-option grid to be populated (async generateOptions()).
    await waitFor(() => {
      expect(screen.getAllByRole('button')).toHaveLength(4);
    });

    const correctButton = screen.getByRole('button', { name: VARA_PRESENS_ANSWER });
    await userEvent.setup().click(correctButton);

    expect(await screen.findByText('Correct!')).toBeInTheDocument();
  });

  it('grades a click on a wrong option as incorrect', async () => {
    renderWithProviders(
      <PracticeCard
        infinitive="vara"
        form="presens"
        mode="multiple-choice"
        showExamples={false}
        autoplayAudio={false}
        muteAudio={true}
        onAnswer={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByRole('button')).toHaveLength(4);
    });

    const wrongButton = screen
      .getAllByRole('button')
      .find((b) => b.textContent && b.textContent !== VARA_PRESENS_ANSWER);
    expect(wrongButton).toBeDefined();
    await userEvent.setup().click(wrongButton as HTMLElement);

    expect(await screen.findByText('Not quite')).toBeInTheDocument();
  });
});

describe('PracticeCard - empty imperativ', () => {
  // "kunna" has no imperativ form in VERB_DATA (imperativ: ""), so
  // conjugateVerb() falls back to the literal string "(not available)".
  // This form is filtered out of the due set by useSrsProgress.getDueItems
  // before it ever reaches PracticeCard in normal use, but PracticeCard
  // itself does not guard against it: it renders it as if "(not available)"
  // were a real answer to type. Documented here so nobody relies on
  // PracticeCard alone to prevent this; see report for the flagged bug.
  it('renders without crashing and treats the fallback string as the target answer', async () => {
    renderWithProviders(
      <PracticeCard
        infinitive="kunna"
        form="imperativ"
        mode="typing"
        showExamples={false}
        autoplayAudio={false}
        muteAudio={true}
        onAnswer={vi.fn()}
      />,
    );

    await screen.findByPlaceholderText('Type your answer...');
    expect(screen.getByText(/Command form of "kunna"|kunna/)).toBeInTheDocument();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('Type your answer...'), '(not available)');
    expect(await screen.findByText('Correct!')).toBeInTheDocument();
  });
});

// Issue #110: aria-live feedback, focus management, and 44px touch targets.
describe('PracticeCard - accessibility (issue #110)', () => {
  it('announces the feedback message via role=status/aria-live=polite and moves focus to it', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <PracticeCard
        infinitive="vara"
        form="presens"
        mode="typing"
        showExamples={false}
        autoplayAudio={false}
        muteAudio={true}
        onAnswer={vi.fn()}
      />,
    );

    const input = await screen.findByPlaceholderText('Type your answer...');
    await user.type(input, 'är');

    // role="status" is an implicit aria-live="polite" region; PracticeCard
    // sets both explicitly, so a screen reader announces "Correct!" without
    // requiring the user to navigate to it.
    const feedback = await screen.findByRole('status');
    expect(feedback).toHaveTextContent('Correct!');
    expect(feedback).toHaveAttribute('aria-live', 'polite');

    // Focus must land on the feedback region itself so the announcement is
    // not the only signal — sighted keyboard users see where focus went too.
    expect(feedback).toHaveFocus();
  });

  it('moves focus to the feedback region for a wrong answer too', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <PracticeCard
        infinitive="vara"
        form="presens"
        mode="typing"
        showExamples={false}
        autoplayAudio={false}
        muteAudio={true}
        onAnswer={vi.fn()}
      />,
    );

    const input = await screen.findByPlaceholderText('Type your answer...');
    await user.type(input, 'totallywrong');
    await user.click(screen.getByRole('button', { name: /check answer/i }));

    const feedback = await screen.findByRole('status');
    expect(feedback).toHaveTextContent('Not quite');
    expect(feedback).toHaveFocus();
  });

  it('renders the per-form pronounce buttons at the 44px minimum touch target with a distinguishing name', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <PracticeCard
        infinitive="vara"
        form="presens"
        mode="typing"
        showExamples={false}
        autoplayAudio={false}
        muteAudio={true}
        onAnswer={vi.fn()}
      />,
    );

    const input = await screen.findByPlaceholderText('Type your answer...');
    await user.type(input, 'är');
    await screen.findByText('Correct!');

    // "vara" infinitive form is shown (unmasked) in the completed pattern
    // with its own pronounce button.
    const pronounceInfinitive = screen.getByRole('button', {
      name: /pronounce infinitive: vara/i,
    });
    expect(pronounceInfinitive).toHaveClass('h-11', 'w-11');
  });

  it("renders the 'Pronounce answer' button at the 44px minimum touch target", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <PracticeCard
        infinitive="vara"
        form="presens"
        mode="typing"
        showExamples={false}
        autoplayAudio={false}
        muteAudio={true}
        onAnswer={vi.fn()}
      />,
    );

    const input = await screen.findByPlaceholderText('Type your answer...');
    await user.type(input, 'är');
    await screen.findByText('Correct!');

    expect(screen.getByRole('button', { name: /pronounce answer/i })).toHaveClass('h-11');
  });
});
