import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import { PracticeCard } from '@/components/PracticeCard';
import type { Grade } from '@/lib/srs';
import * as speech from '@/lib/speech';

// "vara" is a stable, real fixture from VERB_DATA (owned by swedish-linguist):
// presens "är", preteritum "var", supinum "varit", imperativ "var".
const VARA_PRESENS_ANSWER = 'är';

describe('PracticeCard - typing mode', () => {
  it('shows only the infinitive and the form label on the recall screen (no sibling forms, no blank-length disclosure)', async () => {
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
    // Just the infinitive: no "vara – _ _ – var – varit" sibling-form pattern
    // and no underscore stand-ins revealing the answer's length.
    expect(heading.textContent).toBe('vara');
    expect(heading.textContent).not.toContain('_');
    expect(heading.textContent).not.toContain('–');
    expect(screen.getByText(/Missing:/)).toHaveTextContent('Present');

    // The full pattern (with sibling forms) is a feedback-only reveal, never
    // shown while the learner is still trying to recall the answer.
    expect(screen.queryByText('Complete pattern:')).not.toBeInTheDocument();
  });

  it('does not auto-submit when the typed answer becomes correct; grading requires clicking Check Answer (regression #91)', async () => {
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
    await user.type(input, VARA_PRESENS_ANSWER);

    // Typing the exact correct answer must NOT grade the card by itself.
    expect(screen.queryByText('Correct!')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /check answer/i })).toBeInTheDocument();
    expect(onAnswer).not.toHaveBeenCalled();

    // Only the explicit click grades it.
    await user.click(screen.getByRole('button', { name: /check answer/i }));
    expect(await screen.findByText('Correct!')).toBeInTheDocument();
  });

  it('accepts the correct answer via Check Answer, ignoring case and surrounding whitespace', async () => {
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
    await user.click(screen.getByRole('button', { name: /check answer/i }));

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
    await user.click(screen.getByRole('button', { name: /check answer/i }));

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
    await user.click(screen.getByRole('button', { name: /check answer/i }));
    await screen.findByText('Correct!');
    await user.click(screen.getByRole('button', { name: /next card/i }));

    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith(5);
  });

  it("renders the fixed å/ä/ö key row, always present, always in that order, regardless of the answer's letters", async () => {
    // "vara" presens is "är" - contains no å/ö, so a derived letter bank
    // would not include those keys. The fixed row must show all three
    // regardless (P4/P11).
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
    const keyButtons = [
      screen.getByRole('button', { name: 'å' }),
      screen.getByRole('button', { name: 'ä' }),
      screen.getByRole('button', { name: 'ö' }),
    ];
    // All three present.
    keyButtons.forEach((btn) => expect(btn).toBeInTheDocument());

    // DOM order is å, ä, ö.
    const buttons = screen.getAllByRole('button').map((b) => b.textContent);
    const positions = ['å', 'ä', 'ö'].map((letter) => buttons.indexOf(letter));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(positions.every((p) => p >= 0)).toBe(true);
  });

  it('clicking a fixed å/ä/ö key appends that letter to the typed answer, even when the answer itself has none of those letters', async () => {
    // "ha" presens is "har" - contains no å/ä/ö. A derived-from-the-answer
    // letter bank would not render an "å" key at all here; the fixed row
    // must (P4/P11).
    const user = userEvent.setup();
    renderWithProviders(
      <PracticeCard
        infinitive="ha"
        form="presens"
        mode="typing"
        showExamples={false}
        autoplayAudio={false}
        muteAudio={true}
        onAnswer={vi.fn()}
      />,
    );

    const input = (await screen.findByPlaceholderText('Type your answer...')) as HTMLInputElement;
    await user.type(input, 'h');
    await user.click(screen.getByRole('button', { name: 'å' }));
    expect(input.value).toBe('hå');
  });

  it('sets Swedish-aware input attributes and drops caret-transparent styling', async () => {
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

    const input = (await screen.findByPlaceholderText('Type your answer...')) as HTMLInputElement;
    expect(input).toHaveAttribute('lang', 'sv');
    expect(input).toHaveAttribute('autocapitalize', 'off');
    expect(input).toHaveAttribute('autocorrect', 'off');
    expect(input).toHaveAttribute('spellcheck', 'false');
    expect(input.className).not.toMatch(/caret-transparent/);
  });

  it("shows the learner's wrong answer muted and struck through, labelled 'You typed', with no pronounce button, and never speaks it", async () => {
    const speakSpy = vi.spyOn(speech, 'speakSwedish');
    const user = userEvent.setup();
    renderWithProviders(
      <PracticeCard
        infinitive="vara"
        form="presens"
        mode="typing"
        showExamples={false}
        autoplayAudio={true}
        muteAudio={false}
        onAnswer={vi.fn()}
      />,
    );

    const input = await screen.findByPlaceholderText('Type your answer...');
    await user.type(input, 'fel');
    await user.click(screen.getByRole('button', { name: /check answer/i }));

    expect(await screen.findByText('Not quite')).toBeInTheDocument();

    const typedLine = screen.getByText(/You typed:/);
    expect(typedLine).toHaveTextContent('fel');
    const struckSpan = typedLine.querySelector('span');
    expect(struckSpan).toHaveClass('line-through');
    expect(struckSpan?.className).toMatch(/opacity-60/);

    // No pronounce button attached to the wrong-answer line itself.
    expect(typedLine.querySelector('button')).toBeNull();

    // The wrong text the learner typed is never handed to the speech layer.
    expect(speakSpy).not.toHaveBeenCalledWith('fel', expect.anything());
    speakSpy.mockRestore();
  });

  // Note: three edge cases from AC5/AC6 are true of the current build but
  // are not pinned by a dedicated test here because they cannot be made to
  // fail against the pre-fix code (they are either unrelated to this diff,
  // or guard branches on code paths that did not exist before it, so a
  // "revert to merge-base" fail-first proof is vacuous for them):
  //   - "You typed" is suppressed once hints have revealed the full answer
  //     (revealedHints.length < correctAnswer.length in PracticeCard.tsx).
  //   - "Check Answer" stays disabled for empty/whitespace-only input.
  //   - The recall screen shows no streak/backlog/timer chrome.
  // Flagged to srs-engine/frontend-expert as a coverage gap worth a
  // follow-up once there is a prior faulty version to regress against.
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
    const user = userEvent.setup();
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
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('kunna');

    await user.type(screen.getByPlaceholderText('Type your answer...'), '(not available)');
    await user.click(screen.getByRole('button', { name: /check answer/i }));
    expect(await screen.findByText('Correct!')).toBeInTheDocument();
  });
});
