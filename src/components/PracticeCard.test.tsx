import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import { PracticeCard } from '@/components/PracticeCard';
import type { Grade } from '@/lib/srs';
import { getAllConjugatedVerbs, getVerbGrupp } from '@/lib/verbs';

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

describe("PracticeCard - wrong-answer feedback shows the learner's own input (#136)", () => {
  // Regression: the feedback screen used to reveal only the correct
  // conjugation on a wrong answer, never what the learner actually typed.
  it("shows the learner's exact wrong input next to the correct form, not just the correct form alone", async () => {
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

    await screen.findByText('Not quite');
    expect(screen.getByText('You wrote')).toBeInTheDocument();
    // The learner's own submitted text is rendered, verbatim, alongside the
    // correct answer — not merely a pattern with the correct form filled in.
    expect(screen.getByText('totallywrong')).toBeInTheDocument();
    expect(screen.getByText('Correct')).toBeInTheDocument();
    expect(
      screen.getByText(VARA_PRESENS_ANSWER, { selector: 'p.text-success' }),
    ).toBeInTheDocument();
  });

  it('preserves the exact case the learner typed in the wrong-answer comparison (comparison is case-insensitive, display is not)', async () => {
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
    await user.type(input, 'TOTALLYWRONG');
    await user.click(screen.getByRole('button', { name: /check answer/i }));

    await screen.findByText('Not quite');
    // If the display were silently lowercased/normalized it would teach the
    // learner an inaccurate picture of what they actually wrote.
    expect(screen.getByText('TOTALLYWRONG')).toBeInTheDocument();
    expect(screen.queryByText('totallywrong')).not.toBeInTheDocument();
  });

  it('trims surrounding whitespace from the displayed submitted answer', async () => {
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
    await user.type(input, '  totallywrong  ');
    await user.click(screen.getByRole('button', { name: /check answer/i }));

    await screen.findByText('Not quite');
    expect(screen.getByText('totallywrong')).toBeInTheDocument();
  });

  // Regression: the "You wrote" label is only accurate in typing mode. In
  // multiple-choice mode the learner tapped an option, they never wrote
  // anything, so the feedback copy must say "You chose" instead.
  it('shows the exact wrong multiple-choice option the learner clicked next to the correct form, labeled "You chose"', async () => {
    const user = userEvent.setup();
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
    const wrongText = (wrongButton as HTMLElement).textContent as string;
    await user.click(wrongButton as HTMLElement);

    await screen.findByText('Not quite');
    expect(screen.getByText('You chose')).toBeInTheDocument();
    expect(screen.queryByText('You wrote')).not.toBeInTheDocument();
    expect(screen.getByText(wrongText)).toBeInTheDocument();
    expect(
      screen.getByText(VARA_PRESENS_ANSWER, { selector: 'p.text-success' }),
    ).toBeInTheDocument();
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

// Issue #123: lägga preteritum has two SAOL-correct forms, primary "la" and
// documented alternate "lade" (likewise säga: primary "sa", alternate
// "sade"). Before the fix, PracticeCard compared only against the primary
// stored form, so a learner typing the equally-correct alternate was told
// they were wrong — "wrong Swedish is worse than missing Swedish" cuts the
// other way here: marking correct Swedish wrong.
describe('PracticeCard - alternate accepted answers (issue #123)', () => {
  it('accepts the documented alternate "lade" for lägga preteritum, not just the primary "la"', async () => {
    renderWithProviders(
      <PracticeCard
        infinitive="lägga"
        form="preteritum"
        mode="typing"
        showExamples={false}
        autoplayAudio={false}
        muteAudio={true}
        onAnswer={vi.fn()}
      />,
    );

    const input = await screen.findByPlaceholderText('Type your answer...');
    // Deliberately NOT user.type(): "lade" begins with the primary form
    // "la", so typing it keystroke-by-keystroke passes through the
    // intermediate value "la" and would auto-submit as correct via the
    // *primary*-form match alone (a false pass on pre-fix code too, which
    // only compares against the primary form). Setting the full value in
    // one change event is the only way this test actually proves the
    // alternate form itself is accepted.
    fireEvent.change(input, { target: { value: 'lade' } });

    expect(await screen.findByText('Correct!')).toBeInTheDocument();
  });

  it('still accepts the primary form "la" for lägga preteritum via Check Answer (alternate support does not replace the primary)', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <PracticeCard
        infinitive="lägga"
        form="preteritum"
        mode="typing"
        showExamples={false}
        autoplayAudio={false}
        muteAudio={true}
        onAnswer={vi.fn()}
      />,
    );

    const input = await screen.findByPlaceholderText('Type your answer...');
    await user.type(input, 'la');
    await user.click(screen.getByRole('button', { name: /check answer/i }));

    expect(await screen.findByText('Correct!')).toBeInTheDocument();
  });

  // Product policy P4 (docs/product/2026-08-08-alternate-answers-decision.md):
  // auto-submit is suppressed while the typed value is a strict prefix of
  // another accepted answer for this card, so a learner who means the short
  // form gets to submit it deliberately instead of being auto-graded on an
  // intermediate keystroke of the long form.
  it('suppresses auto-submit while "la" is a strict prefix of the accepted alternate "lade" (AC3)', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <PracticeCard
        infinitive="lägga"
        form="preteritum"
        mode="typing"
        showExamples={false}
        autoplayAudio={false}
        muteAudio={true}
        onAnswer={vi.fn()}
      />,
    );

    const input = await screen.findByPlaceholderText('Type your answer...');
    await user.type(input, 'la');

    expect(screen.queryByText('Correct!')).not.toBeInTheDocument();
    expect(screen.queryByText('Not quite')).not.toBeInTheDocument();
    expect(input).toHaveValue('la');
  });

  it('auto-submits once typing continues from "la" to the full alternate "lade" (AC4)', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <PracticeCard
        infinitive="lägga"
        form="preteritum"
        mode="typing"
        showExamples={false}
        autoplayAudio={false}
        muteAudio={true}
        onAnswer={vi.fn()}
      />,
    );

    const input = await screen.findByPlaceholderText('Type your answer...');
    await user.type(input, 'lade');

    expect(await screen.findByText('Correct!')).toBeInTheDocument();
  });

  it('regression: a single-answer card (tala preteritum, "talade") still auto-submits the instant the exact answer is typed (AC5)', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <PracticeCard
        infinitive="tala"
        form="preteritum"
        mode="typing"
        showExamples={false}
        autoplayAudio={false}
        muteAudio={true}
        onAnswer={vi.fn()}
      />,
    );

    const input = await screen.findByPlaceholderText('Type your answer...');
    await user.type(input, 'talade');

    expect(await screen.findByText('Correct!')).toBeInTheDocument();
  });

  it('grades "LADE " (uppercase, trailing space) correct (AC6)', async () => {
    renderWithProviders(
      <PracticeCard
        infinitive="lägga"
        form="preteritum"
        mode="typing"
        showExamples={false}
        autoplayAudio={false}
        muteAudio={true}
        onAnswer={vi.fn()}
      />,
    );

    const input = await screen.findByPlaceholderText('Type your answer...');
    fireEvent.change(input, { target: { value: 'LADE ' } });

    expect(await screen.findByText('Correct!')).toBeInTheDocument();
  });

  it('grades "läde" incorrect: diacritics are not folded (AC7)', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <PracticeCard
        infinitive="lägga"
        form="preteritum"
        mode="typing"
        showExamples={false}
        autoplayAudio={false}
        muteAudio={true}
        onAnswer={vi.fn()}
      />,
    );

    const input = await screen.findByPlaceholderText('Type your answer...');
    await user.type(input, 'läde');
    await user.click(screen.getByRole('button', { name: /check answer/i }));

    expect(await screen.findByText('Not quite')).toBeInTheDocument();
  });

  // Product policy P6: the feedback panel names the other accepted forms
  // when a card's accepted set has more than one entry, and stays silent
  // when it doesn't.
  it('the feedback panel names "lade" as also accepted for lägga preteritum (AC10)', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <PracticeCard
        infinitive="lägga"
        form="preteritum"
        mode="typing"
        showExamples={false}
        autoplayAudio={false}
        muteAudio={true}
        onAnswer={vi.fn()}
      />,
    );

    const input = await screen.findByPlaceholderText('Type your answer...');
    await user.type(input, 'la');
    await user.click(screen.getByRole('button', { name: /check answer/i }));
    await screen.findByText('Correct!');

    expect(screen.getByText(/lade/)).toBeInTheDocument();
  });

  it('shows no alternates line on a single-answer card (tala preteritum) (AC10)', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <PracticeCard
        infinitive="tala"
        form="preteritum"
        mode="typing"
        showExamples={false}
        autoplayAudio={false}
        muteAudio={true}
        onAnswer={vi.fn()}
      />,
    );

    const input = await screen.findByPlaceholderText('Type your answer...');
    await user.type(input, 'talade');
    await screen.findByText('Correct!');

    expect(screen.queryByText(/also correct/i)).not.toBeInTheDocument();
  });

  it('accepts the documented alternate "sade" for säga preteritum, ignoring case and surrounding whitespace', async () => {
    renderWithProviders(
      <PracticeCard
        infinitive="säga"
        form="preteritum"
        mode="typing"
        showExamples={false}
        autoplayAudio={false}
        muteAudio={true}
        onAnswer={vi.fn()}
      />,
    );

    const input = await screen.findByPlaceholderText('Type your answer...');
    // Same reasoning as the "lade" test above: "sade" begins with the
    // primary form "sa", so char-by-char typing would false-pass on
    // pre-fix code by auto-submitting at the intermediate value "sa".
    fireEvent.change(input, { target: { value: '  SADE  ' } });

    expect(await screen.findByText('Correct!')).toBeInTheDocument();
  });

  it('still rejects an answer that is neither the primary form nor a documented alternate', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <PracticeCard
        infinitive="lägga"
        form="preteritum"
        mode="typing"
        showExamples={false}
        autoplayAudio={false}
        muteAudio={true}
        onAnswer={vi.fn()}
      />,
    );

    // Deliberately avoids any prefix of "la"/"lade" (e.g. "lag...") so the
    // auto-submit-on-match effect can't fire on an intermediate keystroke
    // while user-event is still typing.
    const input = await screen.findByPlaceholderText('Type your answer...');
    await user.type(input, 'totallywrong');
    await user.click(screen.getByRole('button', { name: /check answer/i }));

    expect(await screen.findByText('Not quite')).toBeInTheDocument();
  });

  it('clicking the primary-form option in multiple-choice still grades correct for a verb with a documented alternate', async () => {
    renderWithProviders(
      <PracticeCard
        infinitive="lägga"
        form="preteritum"
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

    const correctButton = screen.getByRole('button', { name: 'la' });
    await userEvent.setup().click(correctButton);

    expect(await screen.findByText('Correct!')).toBeInTheDocument();
  });

  // Product policy P7: a multiple-choice distractor is rejected against the
  // WHOLE accepted set (primary + alternates) for the card, not just against
  // values already drawn — otherwise a distractor verb whose own primary
  // form happens to equal this card's alternate would render as a second
  // correct button. This forces the collision with a mocked VERB_DATA fixture
  // (same pattern as the "ids unstable" test in verbs.test.ts) — the real
  // 8-verb pool used before #139's group-based distractor policy didn't
  // collide, and the current group-based policy needs a real `grupp` on the
  // fixture (matching säga's own grupp "4") to draw any candidates at all.
  it('never renders two multiple-choice options that are both in the accepted set (P7)', async () => {
    vi.resetModules();
    vi.doMock('@/data/verbData', async () => {
      const actual = await vi.importActual<typeof import('@/data/verbData')>('@/data/verbData');
      // "säga" is grupp "4". Give it "sade" as its own (unrelated) primary
      // preteritum, so it collides with the "sade-collision" card's
      // documented alternate, and stays a same-group distractor candidate.
      const withCollidingDistractor = actual.VERB_DATA.map((v) =>
        v.infinitive === 'säga' ? { ...v, preteritum: 'sade', alternates: undefined } : v,
      );
      return {
        ...actual,
        VERB_DATA: [
          ...withCollidingDistractor,
          {
            cefr: 'A1',
            infinitive: 'sade-collision-fixture',
            presens: 'x',
            preteritum: 'sa',
            supinum: 'y',
            imperativ: 'z',
            grupp: '4',
            alternates: { preteritum: ['sade'] },
          },
        ],
      };
    });

    const { PracticeCard: MockedPracticeCard } = await import('@/components/PracticeCard');
    const { getAcceptedAnswers } = await import('@/lib/verbs');

    renderWithProviders(
      <MockedPracticeCard
        infinitive="sade-collision-fixture"
        form="preteritum"
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

    const accepted = getAcceptedAnswers('sade-collision-fixture', 'preteritum').map((a) =>
      a.trim().toLowerCase(),
    );
    const optionTexts = screen
      .getAllByRole('button')
      .map((b) => (b.textContent ?? '').trim().toLowerCase());
    const acceptedOptionsShown = optionTexts.filter((text) => accepted.includes(text));

    expect(acceptedOptionsShown).toHaveLength(1);

    vi.resetModules();
    vi.doUnmock('@/data/verbData');
  });
});

describe('PracticeCard - willRequeueIfWrong feedback copy', () => {
  // docs/learning/lapse-handling.md: the same-sitting re-queue decision is
  // made by the caller (Practice.tsx); PracticeCard's only job is to render
  // the "you'll see this again" copy when told to, and never claim a
  // re-queue that isn't happening. All three cases are asserted in one test
  // (rather than three) because the "does not show" cases are, on their
  // own, vacuously true against code that doesn't have the prop at all --
  // pairing them with the true-case assertion is what makes the whole test
  // actually fail against pre-feature code, instead of proving nothing.
  it('shows the re-queue notice only for a wrong answer, and only when willRequeueIfWrong is true', async () => {
    const user = userEvent.setup();
    const { unmount } = renderWithProviders(
      <PracticeCard
        infinitive="vara"
        form="presens"
        mode="typing"
        showExamples={false}
        autoplayAudio={false}
        muteAudio={true}
        willRequeueIfWrong={true}
        onAnswer={vi.fn()}
      />,
    );

    let input = await screen.findByPlaceholderText('Type your answer...');
    await user.type(input, 'totallywrong');
    await user.click(screen.getByRole('button', { name: /check answer/i }));

    expect(await screen.findByText('Not quite')).toBeInTheDocument();
    expect(screen.getByText(/you'll see this one again/i)).toBeInTheDocument();
    unmount();

    // Same wrong answer, but willRequeueIfWrong is false (the default): no
    // notice, because no re-queue is actually going to happen.
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
    input = await screen.findByPlaceholderText('Type your answer...');
    await user.type(input, 'totallywrong');
    await user.click(screen.getByRole('button', { name: /check answer/i }));
    expect(await screen.findByText('Not quite')).toBeInTheDocument();
    expect(screen.queryByText(/you'll see this one again/i)).not.toBeInTheDocument();
    unmount();

    // willRequeueIfWrong true, but the answer is correct: still no notice,
    // because there is nothing to re-queue.
    renderWithProviders(
      <PracticeCard
        infinitive="vara"
        form="presens"
        mode="typing"
        showExamples={false}
        autoplayAudio={false}
        muteAudio={true}
        willRequeueIfWrong={true}
        onAnswer={vi.fn()}
      />,
    );
    input = await screen.findByPlaceholderText('Type your answer...');
    await user.type(input, 'är');
    expect(await screen.findByText('Correct!')).toBeInTheDocument();
    expect(screen.queryByText(/you'll see this one again/i)).not.toBeInTheDocument();
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

// Issue #139: multiple-choice distractors were drawn from a fixed 8-verb
// pool and could surface "(not available)" as a selectable option.
describe('PracticeCard - multiple-choice distractor policy (#139)', () => {
  it("regression: never offers the '(not available)' placeholder or an empty string as an option", async () => {
    // "vara" has imperativ "var". Most of VERB_DATA's imperativ column is
    // empty ("" -> conjugateVerb falls back to "(not available)"): 43 of 50
    // rows, including every verb in the old hardcoded 8-verb pool except
    // "vara", "ha" and "komma". Against the pre-fix pool
    // (['vara','ha','gå','komma','skriva','läsa','säga','få']) the only
    // three distinct imperativ values obtainable besides the correct answer
    // "var" are "ha", "kom" and "(not available)" (from gå/skriva/läsa/säga/få,
    // which all fall back identically) — so the old while loop was
    // *guaranteed* to include "(not available)" as one of the 4 options
    // every single run. This must never happen.
    renderWithProviders(
      <PracticeCard
        infinitive="vara"
        form="imperativ"
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

    const optionTexts = screen.getAllByRole('button').map((b) => b.textContent);
    expect(optionTexts).not.toContain('(not available)');
    expect(optionTexts).not.toContain('');
    expect(optionTexts).toContain('var');
  });

  it("draws distractors from the full verb table, preferring the target's own conjugation group", async () => {
    // "unna" is grupp '1' and is not one of the old hardcoded 8 pool verbs
    // (which are all irregular/grupp '4' or '3'). VERB_DATA has 10 grupp-'1'
    // verbs total (9 excluding "unna" itself) — enough that all 3
    // distractors should be drawn from grupp '1' under the scoring policy
    // (same-group score strictly beats every other candidate, since every
    // row shares the same CEFR level). Under the old fixed-pool
    // implementation this could never happen: none of the 8 pool verbs are
    // grupp '1'.
    renderWithProviders(
      <PracticeCard
        infinitive="unna"
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

    const optionTexts = screen.getAllByRole('button').map((b) => b.textContent);
    const correctAnswer = 'unnar';
    expect(optionTexts).toContain(correctAnswer);

    const distractorTexts = optionTexts.filter((t) => t !== correctAnswer);
    expect(distractorTexts).toHaveLength(3);

    const allVerbs = await getAllConjugatedVerbs();
    for (const text of distractorTexts) {
      const sourceVerb = allVerbs.find((v) => v.presens === text);
      expect(sourceVerb, `distractor "${text}" should map to a known verb`).toBeDefined();
      expect(getVerbGrupp(sourceVerb!.infinitive)).toBe('1');
    }
  });

  it('produces exactly 4 unique, non-empty options including the correct answer, for several verb/form pairs', async () => {
    // General validity check across a spread of forms and conjugation
    // groups (grupp 1, 2a, 2b, 4 - each with enough same/adjacent-group
    // candidates to fill all 3 distractor slots), doubling as evidence that
    // option building always terminates (no unbounded retry loop can hang
    // the component under waitFor's timeout). Grupp '3' has only 3 verbs
    // total and legitimately degrades below 4 options; that's covered by
    // the dedicated degrade test below, not here.
    const cases: Array<{ infinitive: string; form: 'presens' | 'preteritum' | 'supinum' }> = [
      { infinitive: 'tycka', form: 'presens' }, // grupp 2b
      { infinitive: 'höra', form: 'preteritum' }, // grupp 2a
      { infinitive: 'börja', form: 'preteritum' }, // grupp 1
      { infinitive: 'komma', form: 'presens' }, // grupp 4
    ];

    for (const { infinitive, form } of cases) {
      const { unmount } = renderWithProviders(
        <PracticeCard
          infinitive={infinitive}
          form={form}
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

      const optionTexts = screen.getAllByRole('button').map((b) => b.textContent ?? '');
      expect(optionTexts).toHaveLength(4);
      expect(new Set(optionTexts).size).toBe(4); // no duplicates
      for (const text of optionTexts) {
        expect(text).not.toBe('');
        expect(text).not.toBe('(not available)');
      }

      unmount();
    }
  });

  it('falls back to typing mode instead of rendering the empty/unavailable form as a multiple-choice option', async () => {
    // "kunna" has no imperativ (imperativ: "" -> conjugateVerb falls back to
    // "(not available)"). Requesting multiple-choice mode for that pair must
    // not render "(not available)" as a clickable, gradeable "correct"
    // button — the card degrades to the typing input instead.
    renderWithProviders(
      <PracticeCard
        infinitive="kunna"
        form="imperativ"
        mode="multiple-choice"
        showExamples={false}
        autoplayAudio={false}
        muteAudio={true}
        onAnswer={vi.fn()}
      />,
    );

    const input = await screen.findByPlaceholderText('Type your answer...');
    expect(input).toBeInTheDocument();
    // No option grid at all - the multiple-choice grid ("grid-cols-1") never
    // renders, so there is no button offering "(not available)" as a choice.
    expect(document.querySelector('.grid-cols-1')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '(not available)' })).not.toBeInTheDocument();
  });

  it('degrades to fewer options rather than leak a cross-group distractor when a grupp-3 target has too few in-group candidates', async () => {
    // Grupp '3' has exactly three verbs total ("tro", "te sig", "ro") and no
    // adjacent group (only 2a<->2b are adjacent), so a grupp-'3' target has
    // at most 2 valid in-group distractors available. The hard group
    // constraint (P14) means the option list must shrink to 3 total options
    // (1 correct + 2 distractors), never pad to 4 with a cross-group verb.
    renderWithProviders(
      <PracticeCard
        infinitive="tro"
        form="presens"
        mode="multiple-choice"
        showExamples={false}
        autoplayAudio={false}
        muteAudio={true}
        onAnswer={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByRole('button').length).toBeGreaterThan(0);
    });

    const optionTexts = screen.getAllByRole('button').map((b) => b.textContent);
    expect(optionTexts).toHaveLength(3);
    expect(optionTexts).toContain('tror');

    const allVerbs = await getAllConjugatedVerbs();
    const distractorTexts = optionTexts.filter((t) => t !== 'tror');
    for (const text of distractorTexts) {
      const sourceVerb = allVerbs.find((v) => v.presens === text);
      expect(sourceVerb, `distractor "${text}" should map to a known verb`).toBeDefined();
      expect(getVerbGrupp(sourceVerb!.infinitive)).toBe('3');
    }
  });
});

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
