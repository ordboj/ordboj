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

// "vara" preteritum target: pattern is infinitive "vara" (shown) – presens
// "är" (shown) – preteritum "_ _ _" (blank, missing) – supinum "varit"
// (shown). A four-part paradigm cue, unlike presens/imperativ targets which
// only ever produce two- or three-part patterns, so it's the fixture that
// can actually distinguish "full pattern" from "infinitive + blank only".
const VARA_PRETERITUM_ANSWER = 'var';

describe('PracticeCard - pattern cue fades with maturity (issue #32)', () => {
  it('shows the full paradigm pattern when repetitions is below the maturity threshold (0)', async () => {
    renderWithProviders(
      <PracticeCard
        infinitive="vara"
        form="preteritum"
        mode="typing"
        showExamples={false}
        autoplayAudio={false}
        muteAudio={true}
        repetitions={0}
        onAnswer={vi.fn()}
      />,
    );

    const heading = await screen.findByRole('heading', { level: 2 });
    expect(heading.textContent).toContain('vara');
    expect(heading.textContent).toContain('är');
    expect(heading.textContent).toContain('varit');
  });

  it('still shows the full paradigm pattern one review below the threshold (repetitions=2)', async () => {
    renderWithProviders(
      <PracticeCard
        infinitive="vara"
        form="preteritum"
        mode="typing"
        showExamples={false}
        autoplayAudio={false}
        muteAudio={true}
        repetitions={2}
        onAnswer={vi.fn()}
      />,
    );

    const heading = await screen.findByRole('heading', { level: 2 });
    expect(heading.textContent).toContain('är');
    expect(heading.textContent).toContain('varit');
  });

  it('drops the other paradigm forms once repetitions reaches the threshold (repetitions=3)', async () => {
    renderWithProviders(
      <PracticeCard
        infinitive="vara"
        form="preteritum"
        mode="typing"
        showExamples={false}
        autoplayAudio={false}
        muteAudio={true}
        repetitions={3}
        onAnswer={vi.fn()}
      />,
    );

    const heading = await screen.findByRole('heading', { level: 2 });
    // Infinitive and the blank survive as the only cue...
    expect(heading.textContent).toContain('vara');
    expect(heading.textContent).toContain(
      '_'.repeat(VARA_PRETERITUM_ANSWER.length).split('').join(' '),
    );
    // ...but presens and supinum, which would give the answer away via the
    // pattern, must not leak into the mature cue.
    expect(heading.textContent).not.toContain('är');
    expect(heading.textContent).not.toContain('varit');
    // The form label below the pattern is still the only source of what's
    // being asked for.
    expect(screen.getByText(/Missing:/)).toHaveTextContent('Past');
  });

  it('keeps dropping paradigm forms well past the threshold (repetitions=10)', async () => {
    renderWithProviders(
      <PracticeCard
        infinitive="vara"
        form="preteritum"
        mode="typing"
        showExamples={false}
        autoplayAudio={false}
        muteAudio={true}
        repetitions={10}
        onAnswer={vi.fn()}
      />,
    );

    const heading = await screen.findByRole('heading', { level: 2 });
    expect(heading.textContent).not.toContain('är');
    expect(heading.textContent).not.toContain('varit');
  });

  it('defaults to the immature (full pattern) cue when repetitions is not supplied', async () => {
    renderWithProviders(
      <PracticeCard
        infinitive="vara"
        form="preteritum"
        mode="typing"
        showExamples={false}
        autoplayAudio={false}
        muteAudio={true}
        onAnswer={vi.fn()}
      />,
    );

    const heading = await screen.findByRole('heading', { level: 2 });
    expect(heading.textContent).toContain('är');
    expect(heading.textContent).toContain('varit');
  });

  it('does not shrink the already-minimal imperativ pattern, mature or not', async () => {
    // imperativ's pattern is always just infinitive + blank (see
    // generateVerbPattern), so maturity filtering must be a no-op here in
    // both directions -- this pins that the two code paths don't interact
    // in a surprising way.
    const { unmount } = renderWithProviders(
      <PracticeCard
        infinitive="vara"
        form="imperativ"
        mode="typing"
        showExamples={false}
        autoplayAudio={false}
        muteAudio={true}
        repetitions={0}
        onAnswer={vi.fn()}
      />,
    );
    const immatureHeading = await screen.findByRole('heading', { level: 2 });
    const immatureText = immatureHeading.textContent;
    unmount();

    renderWithProviders(
      <PracticeCard
        infinitive="vara"
        form="imperativ"
        mode="typing"
        showExamples={false}
        autoplayAudio={false}
        muteAudio={true}
        repetitions={7}
        onAnswer={vi.fn()}
      />,
    );
    const matureHeading = await screen.findByRole('heading', { level: 2 });
    expect(matureHeading.textContent).toBe(immatureText);
    expect(matureHeading.textContent).toContain('vara');
  });

  it("still reveals the full paradigm in the post-answer 'Complete pattern' review even for a mature item", async () => {
    // The fade applies only to the pre-answer cue; the review after
    // answering is unaffected regardless of maturity, so a learner
    // reviewing a mature item still gets the full paradigm for study.
    const user = userEvent.setup();
    renderWithProviders(
      <PracticeCard
        infinitive="vara"
        form="preteritum"
        mode="typing"
        showExamples={false}
        autoplayAudio={false}
        muteAudio={true}
        repetitions={5}
        onAnswer={vi.fn()}
      />,
    );

    const input = await screen.findByPlaceholderText('Type your answer...');
    await user.type(input, VARA_PRETERITUM_ANSWER);
    await screen.findByText('Correct!');

    const completePattern = screen.getByText('Complete pattern:').closest('div');
    expect(completePattern).toHaveTextContent('är');
    expect(completePattern).toHaveTextContent('varit');
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
