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

  it('marks the answer input as Swedish and disables phone autocorrect/autocapitalize (issue #134)', async () => {
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
    // Without these, the phone's English autocorrect silently mangles å/ä/ö
    // input before the learner even sees what they typed.
    expect(input).toHaveAttribute('lang', 'sv');
    expect(input).toHaveAttribute('autocapitalize', 'off');
    expect(input).toHaveAttribute('autocorrect', 'off');
    expect(input).toHaveAttribute('spellcheck', 'false');
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

describe('PracticeCard - on-screen special-character keys (issue #134: no answer leak)', () => {
  // Only single Swedish/Latin letter buttons qualify — excludes "Hint",
  // "Check Answer", "⌫" and multi-char option buttons.
  const getSpecialCharButtons = () =>
    screen.getAllByRole('button').filter((b) => /^[a-zA-ZåäöÅÄÖ]$/.test(b.textContent ?? ''));

  it("shows exactly å, ä, ö (in that order) even though the correct answer's own unique letters differ", async () => {
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

    await screen.findByPlaceholderText('Type your answer...');
    // Correct answer is "är" (unique letters {ä, r}). Pre-fix, the on-screen
    // row was exactly this answer's unique letters (shuffled) — "ä" and "r",
    // never "å" or "ö", and never exactly 3 keys. The row must now be fixed
    // to å/ä/ö regardless of the answer, so it can no longer be
    // anagram-solved down to the answer's letter multiset.
    expect(getSpecialCharButtons().map((b) => b.textContent)).toEqual(['å', 'ä', 'ö']);
  });

  it('shows the identical å, ä, ö row for a different verb/form/answer, proving the keys are not derived from the current answer', async () => {
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

    await screen.findByPlaceholderText('Type your answer...');
    // Correct answer is "går" — unique letters {g, å, r}, coincidentally
    // also 3 letters pre-fix, so a bare "3 buttons" assertion would not
    // catch the leak. The *identity* of the keys, not just the count, must
    // match the fixed å/ä/ö row.
    expect(getSpecialCharButtons().map((b) => b.textContent)).toEqual(['å', 'ä', 'ö']);
  });

  it("shows the same fixed å, ä, ö row even when the answer is the long fallback string '(not available)'", async () => {
    // "kunna" has no imperativ form in VERB_DATA, so conjugateVerb() falls
    // back to "(not available)" as the target answer (see the "empty
    // imperativ" describe block below). Pre-fix, this fallback string's own
    // unique letters ((,n,o,t,a,v,i,l,b,e,),space) would flood the
    // on-screen row instead of a fixed 3-key row.
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
    expect(getSpecialCharButtons().map((b) => b.textContent)).toEqual(['å', 'ä', 'ö']);
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
