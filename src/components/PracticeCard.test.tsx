import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
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
  // correct button. None of the 8-verb hardcoded distractor pool collides
  // with "sade"/"lade" today, so this forces the collision with a mocked
  // VERB_DATA (same pattern as the "ids unstable" test in verbs.test.ts) —
  // otherwise P7 has no way to fail red before the fix.
  it('never renders two multiple-choice options that are both in the accepted set (P7)', async () => {
    vi.resetModules();
    vi.doMock('@/data/verbData', async () => {
      const actual = await vi.importActual<typeof import('@/data/verbData')>('@/data/verbData');
      // "säga" is one of PracticeCard's 8 hardcoded distractor-pool verbs.
      // Give it "sade" as its own (unrelated) primary preteritum, so it
      // collides with the "sade-collision" card's documented alternate.
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
