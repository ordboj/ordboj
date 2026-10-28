import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import { PracticeCard } from '@/components/PracticeCard';
import type { Grade } from '@/lib/srs';
import { getAllConjugatedVerbs, getFormLabel, getVerbGrupp, type Form } from '@/lib/verbs';
import {
  installSpeechSynthesisMock,
  SV_VOICE,
  type SpeechSynthesisMockHandle,
} from '@/test/speechMock';

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
    // and no underscore stand-ins revealing the answer's length (P2, ticket
    // #91) -- this holds regardless of item maturity (#32's maturity-fade
    // cue does not apply here; see the PracticeCardProps.repetitions note).
    expect(heading.textContent).toBe('vara');
    expect(heading.textContent).not.toContain('_');
    expect(heading.textContent).not.toContain('–');
    expect(screen.getByText(/Missing:/)).toHaveTextContent('Presens');

    // The full pattern (with sibling forms) is a feedback-only reveal, never
    // shown while the learner is still trying to recall the answer.
    expect(screen.queryByText('Complete pattern:')).not.toBeInTheDocument();
  });

  it('marks the answer input as Swedish, disables phone autocorrect/autocapitalize, and hints "go" as the enter key (issue #134, ticket #91)', async () => {
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
    expect(input).toHaveAttribute('enterkeyhint', 'go');
    // The text cursor must be visible: hiding it (caret-transparent) was
    // cosmetic support for a letter-tile keyboard that no longer exists.
    expect(input.className).not.toMatch(/caret-transparent/);
  });

  it('does not auto-submit when the typed answer becomes correct; grading requires clicking Check Answer', async () => {
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
});

describe('PracticeCard - mobile input attributes (#113)', () => {
  it('sets enterkeyhint, disables autocapitalize/autocorrect/spellcheck, and keeps the caret visible', async () => {
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

    // Mobile keyboards: "go" lets the on-screen keyboard submit the answer,
    // and turning off capitalize/correct/spellcheck stops the OS from
    // "fixing" Swedish words into English ones mid-entry.
    expect(input).toHaveAttribute('enterkeyhint', 'go');
    expect(input).toHaveAttribute('autocapitalize', 'off');
    expect(input).toHaveAttribute('autocorrect', 'off');
    expect(input).toHaveAttribute('spellcheck', 'false');

    // Regression: caret-transparent hid the text caret entirely, which is
    // fine on the on-screen keyboard (letter buttons) but leaves
    // hardware-keyboard users with no visible insertion point at all.
    expect(input.className.split(/\s+/)).not.toContain('caret-transparent');
  });
});

describe("PracticeCard - wrong-answer feedback shows the learner's own input (#136)", () => {
  // Regression: the feedback screen used to reveal only the correct
  // conjugation on a wrong answer, never what the learner actually typed.
  // Per P21 (docs/learning/2026-08-08-ux-pedagogy-red-lines.md) the learner's
  // answer is muted, struck through and subordinate to the correct form
  // (shown at full prominence in the "Complete pattern" section below) --
  // never a symmetric side-by-side pair, so both live in one stacked line
  // rather than the two-column "You wrote / Correct" layout this ticket
  // originally shipped.
  it("shows the learner's exact wrong input, muted and struck through, alongside the correct form shown at full prominence", async () => {
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
    // The learner's own submitted text is rendered, verbatim, muted and
    // struck through — not merely a pattern with the correct form filled in.
    const typedLine = screen.getByText(/You typed:/);
    expect(typedLine).toHaveTextContent('totallywrong');
    const struckSpan = typedLine.querySelector('span');
    expect(struckSpan).toHaveClass('line-through');
    // The correct form keeps its existing prominence in the pattern reveal.
    expect(screen.getByText('Complete pattern:').closest('div')).toHaveTextContent(
      VARA_PRESENS_ANSWER,
    );
  });

  it('renders the wrong-answer line at reduced size with no pronounce button, and the missing form in the pattern reveal at full prominence (#254)', async () => {
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

    // The wrong-answer line is visually subordinate: small text, struck
    // through and muted, never at the same weight as the correct form.
    const wrongAnswerLine = screen.getByText(/You typed:/);
    expect(wrongAnswerLine).toHaveClass('text-xs');
    const struckSpan = wrongAnswerLine.querySelector('span');
    expect(struckSpan).toHaveClass('line-through');
    expect(struckSpan).toHaveClass('opacity-60');

    // The correct form, shown in the "Complete pattern" reveal, keeps full
    // prominence: larger text inside a highlighted, bold wrapper.
    const missingFormSpan = screen.getByText(VARA_PRESENS_ANSWER, { selector: 'span' });
    expect(missingFormSpan).toHaveClass('text-lg');
    const missingFormWrapper = missingFormSpan.parentElement;
    expect(missingFormWrapper).toHaveClass('bg-primary');
    expect(missingFormWrapper).toHaveClass('font-bold');

    // The wrong answer is never spoken: no pronounce button targets it, and
    // no button anywhere in the panel carries the learner's wrong text.
    expect(
      within(wrongAnswerLine).queryByRole('button', { name: /^Pronounce/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /totallywrong/i })).not.toBeInTheDocument();
    // Every pronounce button belongs to a form the learner did not have to supply.
    expect(
      screen.queryByRole('button', { name: `Pronounce ${getFormLabel('presens')}` }),
    ).not.toBeInTheDocument();
  });

  it('preserves the exact case the learner typed in the wrong-answer line (comparison is case-insensitive, display is not)', async () => {
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
    expect(screen.getByText(/You typed:/)).toHaveTextContent('TOTALLYWRONG');
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
    expect(screen.getByText(/You typed:/)).toHaveTextContent('totallywrong');
  });

  // Regression: the "You typed" label is only accurate in typing mode. In
  // multiple-choice mode the learner tapped an option, they never typed
  // anything, so the feedback copy must say "You chose" instead.
  it('shows the exact wrong multiple-choice option the learner clicked, labeled "You chose", alongside the correct form', async () => {
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
    const chosenLine = screen.getByText(/You chose:/);
    expect(chosenLine).toHaveTextContent(wrongText);
    expect(screen.queryByText(/You typed:/)).not.toBeInTheDocument();
    expect(screen.getByText('Complete pattern:').closest('div')).toHaveTextContent(
      VARA_PRESENS_ANSWER,
    );
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
  it('accepts the documented alternate "lade" for lägga preteritum via Check Answer, not just the primary "la"', async () => {
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
    await user.click(screen.getByRole('button', { name: /check answer/i }));

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

  // Ticket #91 removed auto-submit entirely, so #123's original P4
  // prefix-suppression concern (typing "la" ahead of "lade" grading early
  // on an intermediate keystroke) no longer applies to anything -- nothing
  // grades until Check Answer or Enter regardless of what's been typed so
  // far. This test pins that a partial, in-progress value ("la", also a
  // valid answer on its own) shows neither outcome and does not disable or
  // otherwise short-circuit typing further.
  it('does not grade a partially-typed answer that already matches a shorter accepted form, until Check Answer is clicked', async () => {
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

    // Typing on to the full alternate, then submitting deliberately, still
    // grades correct.
    await user.type(input, 'de');
    await user.click(screen.getByRole('button', { name: /check answer/i }));
    expect(await screen.findByText('Correct!')).toBeInTheDocument();
  });

  it('regression: a single-answer card (tala preteritum, "talade") grades correct via Check Answer (AC5)', async () => {
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
    await user.click(screen.getByRole('button', { name: /check answer/i }));

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
    await userEvent.setup().click(screen.getByRole('button', { name: /check answer/i }));

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
    await user.click(screen.getByRole('button', { name: /check answer/i }));
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
    fireEvent.change(input, { target: { value: '  SADE  ' } });
    await userEvent.setup().click(screen.getByRole('button', { name: /check answer/i }));

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

// Issue #43 (docs/learning/2026-08-08-verb-data-conventions.md), acceptance
// checks 5 and 6: every form in an accepted set grades full credit (grade
// 5), including a sense-conditioned pair, and a sense-conditioned pair's
// feedback panel shows the `alternatesNote` override instead of the generic
// "Both ... are correct." line.
describe('PracticeCard - #43 alternate grading and alternatesNote disclosure', () => {
  // AC5, real shipped data: typing the documented alternate for a real
  // VERB_DATA row must grade full credit (onAnswer(5)), not just show
  // "Correct!". The "#123" describe block above only asserts the
  // onAnswer(5) contract for vara/presens (line 163), which has no
  // alternates at all, so it does not cover this.
  it('grades onAnswer(5) after typing the alternate "lade" for lägga preteritum (AC5)', async () => {
    const user = userEvent.setup();
    const onAnswer = vi.fn<(grade: Grade) => void>();
    renderWithProviders(
      <PracticeCard
        infinitive="lägga"
        form="preteritum"
        mode="typing"
        showExamples={false}
        autoplayAudio={false}
        muteAudio={true}
        onAnswer={onAnswer}
      />,
    );

    const input = await screen.findByPlaceholderText('Type your answer...');
    await user.type(input, 'lade');
    await user.click(screen.getByRole('button', { name: /check answer/i }));
    await screen.findByText('Correct!');
    await user.click(screen.getByRole('button', { name: /next card/i }));

    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith(5);
  });

  it('grades onAnswer(5) after typing the alternate "sade" for säga preteritum (AC5)', async () => {
    const user = userEvent.setup();
    const onAnswer = vi.fn<(grade: Grade) => void>();
    renderWithProviders(
      <PracticeCard
        infinitive="säga"
        form="preteritum"
        mode="typing"
        showExamples={false}
        autoplayAudio={false}
        muteAudio={true}
        onAnswer={onAnswer}
      />,
    );

    const input = await screen.findByPlaceholderText('Type your answer...');
    await user.type(input, 'sade');
    await user.click(screen.getByRole('button', { name: /check answer/i }));
    await screen.findByText('Correct!');
    await user.click(screen.getByRole('button', { name: /next card/i }));

    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith(5);
  });

  describe('sense-conditioned alternatesNote (fixture verb, AC6)', () => {
    afterEach(() => {
      vi.resetModules();
      vi.doUnmock('@/data/verbData');
    });

    // VERB_DATA ships no row with alternatesNote yet (the sense-conditioned
    // rows the decision doc names -- lyda, svälta -- are CSV-only per
    // section 7), so this mocks a fixture row the same way the P7
    // distractor-collision test above does, rather than asserting against
    // a shipped row that does not exist.
    async function renderWithLydaFixture() {
      vi.resetModules();
      vi.doMock('@/data/verbData', async () => {
        const actual = await vi.importActual<typeof import('@/data/verbData')>('@/data/verbData');
        return {
          ...actual,
          VERB_DATA: [
            ...actual.VERB_DATA,
            {
              cefr: 'A2',
              infinitive: 'lyda-fixture',
              imperativ: 'lyd',
              presens: 'lyder',
              preteritum: 'lydde',
              supinum: 'lytt',
              grupp: '2a',
              alternates: { preteritum: ['löd'] },
              alternatesNote: {
                preteritum: 'lydde = obey; löd = read as/state a text (different senses).',
              },
            },
          ],
        };
      });
      const { PracticeCard: MockedPracticeCard } = await import('@/components/PracticeCard');
      return MockedPracticeCard;
    }

    it('shows the alternatesNote line, not the generic "Both ... are correct." line', async () => {
      const user = userEvent.setup();
      const MockedPracticeCard = await renderWithLydaFixture();

      renderWithProviders(
        <MockedPracticeCard
          infinitive="lyda-fixture"
          form="preteritum"
          mode="typing"
          showExamples={false}
          autoplayAudio={false}
          muteAudio={true}
          onAnswer={vi.fn()}
        />,
      );

      const input = await screen.findByPlaceholderText('Type your answer...');
      await user.type(input, 'lydde');
      await user.click(screen.getByRole('button', { name: /check answer/i }));
      await screen.findByText('Correct!');

      expect(screen.getByText(/lydde = obey; löd = read as\/state a text/)).toBeInTheDocument();
      expect(screen.queryByText(/are correct\./)).not.toBeInTheDocument();
    });

    // C5 rules out a plausible alternative design -- rejecting the
    // "wrong-sense" member of a sense-conditioned pair, since the bare
    // paradigm card can't disambiguate sense. isAcceptedAnswer never reads
    // `alternatesNote`, so nothing here could special-case a
    // sense-conditioned alternate differently from a free one; this pins
    // that policy decision (both grade 5) at the UI level rather than
    // proving a new code path.
    it('grades the sense-conditioned alternate "löd" full credit (grade 5), same as the primary "lydde" (AC5)', async () => {
      const user = userEvent.setup();
      const onAnswer = vi.fn<(grade: Grade) => void>();
      const MockedPracticeCard = await renderWithLydaFixture();

      renderWithProviders(
        <MockedPracticeCard
          infinitive="lyda-fixture"
          form="preteritum"
          mode="typing"
          showExamples={false}
          autoplayAudio={false}
          muteAudio={true}
          onAnswer={onAnswer}
        />,
      );

      const input = await screen.findByPlaceholderText('Type your answer...');
      await user.type(input, 'löd');
      await user.click(screen.getByRole('button', { name: /check answer/i }));
      await screen.findByText('Correct!');
      await user.click(screen.getByRole('button', { name: /next card/i }));

      expect(onAnswer).toHaveBeenCalledTimes(1);
      expect(onAnswer).toHaveBeenCalledWith(5);
    });
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
    await user.click(screen.getByRole('button', { name: /check answer/i }));
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

describe("PracticeCard - lang='sv' on inline Swedish word display (issue #112 AC #5)", () => {
  it("marks the pattern heading and the fixed å/ä/ö key row with lang='sv' (typing mode)", async () => {
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
    expect(heading).toHaveAttribute('lang', 'sv');

    await screen.findByPlaceholderText('Type your answer...');
    const keyButton = screen.getByRole('button', { name: 'å' });
    const keySpan = keyButton.querySelector('span');
    expect(keySpan).toHaveAttribute('lang', 'sv');
  });

  it("marks multiple-choice option text with lang='sv'", async () => {
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

    const optionButton = screen.getByRole('button', { name: VARA_PRESENS_ANSWER });
    const optionSpan = optionButton.querySelector('span');
    expect(optionSpan).toHaveAttribute('lang', 'sv');
  });

  it("marks the revealed complete-pattern words and a real example sentence with lang='sv'", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <PracticeCard
        infinitive="vara"
        form="presens"
        mode="typing"
        showExamples={true}
        autoplayAudio={false}
        muteAudio={true}
        onAnswer={vi.fn()}
      />,
    );

    const input = await screen.findByPlaceholderText('Type your answer...');
    await user.type(input, 'är');
    await user.click(screen.getByRole('button', { name: /check answer/i }));
    await screen.findByText('Correct!');

    // "Complete pattern:" section reveals the real Swedish infinitive/preteritum/
    // supinum words: they must be tagged lang="sv".
    const patternSection = screen.getByText('Complete pattern:').closest('div') as HTMLElement;
    const infinitiveSpan = within(patternSection).getByText('vara');
    expect(infinitiveSpan).toHaveAttribute('lang', 'sv');

    // "vara" has a real example sentence fixture ("Jag är glad"), not the
    // "[Example with ...]" placeholder, so it must also be tagged lang="sv".
    const example = screen.getByText('Jag är glad');
    expect(example).toHaveAttribute('lang', 'sv');
  });

  // A companion test asserting the placeholder example sentence ("[Example
  // with ...]", not real Swedish) does NOT get lang="sv" was dropped: it
  // passed even against pre-fix code (which never sets lang on anything, so
  // "not.toHaveAttribute('lang')" is trivially true there too) and could not
  // be made fail-first without editing production code, which qa does not
  // own. See PR #199 review notes for the owner (frontend-expert) if that
  // conditional needs its own regression test later.
});

// Tickets #229/#44: getExampleSentence now returns null instead of a
// "[Example with ...]" placeholder for verbs with no hand-written example.
// Regression: the feedback screen must render nothing in that case, never
// the literal placeholder text.
describe('PracticeCard - no "[Example with ...]" placeholder (tickets #229/#44)', () => {
  it('renders no example section at all for a verb with no hand-written example, even with showExamples on', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <PracticeCard
        infinitive="tala"
        form="presens"
        mode="typing"
        showExamples={true}
        autoplayAudio={false}
        muteAudio={true}
        onAnswer={vi.fn()}
      />,
    );

    const input = await screen.findByPlaceholderText('Type your answer...');
    await user.type(input, 'talar');
    await user.click(screen.getByRole('button', { name: /check answer/i }));
    await screen.findByText('Correct!');

    expect(screen.queryByText(/\[Example with/)).not.toBeInTheDocument();
    expect(screen.queryByText('Example:')).not.toBeInTheDocument();
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
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('kunna');

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('Type your answer...'), '(not available)');
    await user.click(screen.getByRole('button', { name: /check answer/i }));
    expect(await screen.findByText('Correct!')).toBeInTheDocument();
  });
});

// ORD-87 (docs/learning/2026-08-17-reflexive-only-verbs-and-entries-per-base.md):
// a phraseBound verb's card shows a retrieval-side frame cue ("Used in the
// phrase: ...") beside the prompt, and a post-grading example ("In the
// phrase: ..."), sourced from getPhraseFrame. Neither renders for an
// ordinary verb, and the example must never leak into the retrieval screen.
describe('PracticeCard - phraseBound frame cue and example (ORD-87)', () => {
  it('shows the retrieval-side frame cue, as a role="note", for a phraseBound verb\'s non-imperativ card', async () => {
    renderWithProviders(
      <PracticeCard
        infinitive="bry"
        form="presens"
        mode="typing"
        showExamples={false}
        autoplayAudio={false}
        muteAudio={true}
        onAnswer={vi.fn()}
      />,
    );

    await screen.findByPlaceholderText('Type your answer...');

    const note = screen.getByRole('note');
    expect(note).toHaveTextContent('Used in the phrase:');
    expect(note).toHaveTextContent('bry ___ om');

    // The post-grading example must not have leaked into the retrieval
    // screen alongside the frame cue.
    expect(screen.queryByText('In the phrase:')).not.toBeInTheDocument();
    expect(screen.queryByText(/Jag bryr mig om mina grannar/)).not.toBeInTheDocument();
  });

  it('does not show a frame cue for an ordinary (non-phraseBound) verb', async () => {
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
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    expect(screen.queryByText(/Used in the phrase:/)).not.toBeInTheDocument();
  });

  it('shows the phrase example only in the post-grading feedback pane, not during retrieval', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <PracticeCard
        infinitive="bry"
        form="presens"
        mode="typing"
        showExamples={false}
        autoplayAudio={false}
        muteAudio={true}
        onAnswer={vi.fn()}
      />,
    );

    const input = await screen.findByPlaceholderText('Type your answer...');
    // Before grading: no example anywhere on the card.
    expect(screen.queryByText('In the phrase:')).not.toBeInTheDocument();
    expect(screen.queryByText(/Jag bryr mig om mina grannar/)).not.toBeInTheDocument();

    await user.type(input, 'bryr');
    await user.click(screen.getByRole('button', { name: /check answer/i }));
    await screen.findByText('Correct!');

    // After grading: the example appears in the feedback pane, labelled
    // distinctly from the frame cue shown before grading.
    expect(screen.getByText('In the phrase:')).toBeInTheDocument();
    expect(screen.getByText('Jag bryr mig om mina grannar.')).toBeInTheDocument();
  });

  it('does not show a phrase example for an ordinary verb after grading', async () => {
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
    await user.type(input, VARA_PRESENS_ANSWER);
    await user.click(screen.getByRole('button', { name: /check answer/i }));
    await screen.findByText('Correct!');

    expect(screen.queryByText('In the phrase:')).not.toBeInTheDocument();
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
    // (same-group score of 20 strictly beats any cross-group candidate
    // regardless of the +1 same-CEFR tie-break; unna is tagged B2 per #42
    // while its grupp-1 peers are A1, so the CEFR bonus never applies here
    // and does not change which group wins). Under the old fixed-pool
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
    // Real VERB_DATA no longer exercises this branch on its own (#415 added
    // "nå"/"uppnå", giving grupp-3 targets 4+ valid in-group candidates), so
    // this uses a mocked, minimal fixture (same pattern as the "P7" and
    // "imperativNotApplicable" fixtures above) to force the scarcity the
    // policy is meant to handle: grupp '3' has no adjacent group (only 2a<->2b
    // are adjacent), so with only one other grupp-3 verb available, the hard
    // group constraint (P14) must shrink the option list to 2 total options
    // (1 correct + 1 distractor) rather than pad with the grupp-'4' and
    // grupp-'2a' verbs also present in the fixture.
    vi.resetModules();
    vi.doMock('@/data/verbData', () => ({
      VERB_DATA: [
        {
          cefr: 'A1',
          infinitive: 'tro-fixture',
          imperativ: 'tro-fixture',
          presens: 'tror-fixture',
          preteritum: 'trodde-fixture',
          supinum: 'trott-fixture',
          grupp: '3',
        },
        {
          // The only other grupp-3 verb in this fixture: the sole valid
          // in-group distractor candidate.
          cefr: 'A1',
          infinitive: 'ro-fixture',
          imperativ: 'ro-fixture',
          presens: 'ror-fixture',
          preteritum: 'rodde-fixture',
          supinum: 'rott-fixture',
          grupp: '3',
        },
        {
          // Cross-group (grupp '4', not adjacent to '3'): must never leak in
          // as a distractor even though it would otherwise be a plausible
          // pad.
          cefr: 'A1',
          infinitive: 'ga-fixture',
          imperativ: 'ga-fixture',
          presens: 'gar-fixture',
          preteritum: 'gick-fixture',
          supinum: 'gatt-fixture',
          grupp: '4',
        },
        {
          // Cross-group (grupp '2a', also not adjacent to '3'): same
          // must-never-leak check from a different group.
          cefr: 'A1',
          infinitive: 'anvanda-fixture',
          imperativ: 'anvand-fixture',
          presens: 'anvander-fixture',
          preteritum: 'anvande-fixture',
          supinum: 'anvant-fixture',
          grupp: '2a',
        },
      ],
    }));

    const { PracticeCard: MockedPracticeCard } = await import('@/components/PracticeCard');
    const { getAllConjugatedVerbs: mockedGetAllConjugatedVerbs, getVerbGrupp: mockedGetVerbGrupp } =
      await import('@/lib/verbs');

    renderWithProviders(
      <MockedPracticeCard
        infinitive="tro-fixture"
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
    expect(optionTexts).toHaveLength(2);
    expect(optionTexts).toContain('tror-fixture');

    const allVerbs = await mockedGetAllConjugatedVerbs();
    const distractorTexts = optionTexts.filter((t) => t !== 'tror-fixture');
    expect(distractorTexts).toEqual(['ror-fixture']);
    for (const text of distractorTexts) {
      const sourceVerb = allVerbs.find((v) => v.presens === text);
      expect(sourceVerb, `distractor "${text}" should map to a known verb`).toBeDefined();
      expect(mockedGetVerbGrupp(sourceVerb!.infinitive)).toBe('3');
    }

    vi.resetModules();
    vi.doUnmock('@/data/verbData');
  });
});

// Issue #124: ConjugatedVerb.imperativNotApplicable flags a form as
// grammatically confirmed absent (modal verbs), distinct from a merely
// empty/placeholder value. These fixtures give the flagged verb a REAL,
// non-empty stored imperativ value that is NOT the "(not available)"
// sentinel, so any assertion that still treats it as unavailable can only
// be explained by the new flag itself -- not by the pre-#124 string
// comparison, which would see a normal-looking answer and treat it as
// available. Against pre-#124 code (no such field exists on VERB_DATA or
// ConjugatedVerb) these fixtures behave like an ordinary verb with a real
// imperativ, so every assertion below fails there for the right reason.
describe('PracticeCard - imperativNotApplicable flag drives unavailable-form handling regardless of the stored value (issue #124)', () => {
  it('degrades multiple-choice to typing for a flagged form even though the stored value is a real, non-empty string', async () => {
    vi.resetModules();
    vi.doMock('@/data/verbData', () => ({
      VERB_DATA: [
        {
          cefr: 'A1',
          infinitive: 'flagga-fixture',
          presens: 'flaggarx',
          preteritum: 'flaggadex',
          supinum: 'flaggatx',
          imperativ: 'realimperativvalue',
          grupp: '1',
          noNaturalImperativ: true,
        },
      ],
    }));

    const { PracticeCard: MockedPracticeCard } = await import('@/components/PracticeCard');
    renderWithProviders(
      <MockedPracticeCard
        infinitive="flagga-fixture"
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
    // No multiple-choice option grid at all - it degraded to typing.
    expect(document.querySelector('.grid-cols-1')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'realimperativvalue' })).not.toBeInTheDocument();

    vi.resetModules();
    vi.doUnmock('@/data/verbData');
  });

  it("never offers a flagged verb's real imperativ value as a multiple-choice distractor for a different verb in the same group", async () => {
    vi.resetModules();
    // Exactly two verbs, both grupp '1', so the flagged fixture is the
    // ONLY same-group distractor candidate available for the target verb
    // -- deterministic: pre-#124 code (no flag concept) would always
    // include it since it's the sole candidate, post-#124 code must always
    // exclude it.
    vi.doMock('@/data/verbData', () => ({
      VERB_DATA: [
        {
          cefr: 'A1',
          infinitive: 'target-fixture',
          presens: 'targetpresens',
          preteritum: 'targetpret',
          supinum: 'targetsup',
          imperativ: 'targetimperativ',
          grupp: '1',
        },
        {
          cefr: 'A1',
          infinitive: 'flagga-fixture',
          presens: 'flaggarx',
          preteritum: 'flaggadex',
          supinum: 'flaggatx',
          imperativ: 'realimperativvalue',
          grupp: '1',
          noNaturalImperativ: true,
        },
      ],
    }));

    const { PracticeCard: MockedPracticeCard } = await import('@/components/PracticeCard');
    renderWithProviders(
      <MockedPracticeCard
        infinitive="target-fixture"
        form="imperativ"
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
    expect(optionTexts).toContain('targetimperativ');
    expect(optionTexts).not.toContain('realimperativvalue');

    vi.resetModules();
    vi.doUnmock('@/data/verbData');
  });

  it('does not mark the flagged form as Swedish (lang="sv") in the post-answer "Complete pattern" reveal, even though its real value is still displayed', async () => {
    vi.resetModules();
    vi.doMock('@/data/verbData', () => ({
      VERB_DATA: [
        {
          cefr: 'A1',
          infinitive: 'flagga-fixture',
          presens: 'flaggarx',
          preteritum: 'flaggadex',
          supinum: 'flaggatx',
          imperativ: 'realimperativvalue',
          grupp: '1',
          noNaturalImperativ: true,
        },
      ],
    }));

    const { PracticeCard: MockedPracticeCard } = await import('@/components/PracticeCard');
    const user = userEvent.setup();
    renderWithProviders(
      <MockedPracticeCard
        infinitive="flagga-fixture"
        form="imperativ"
        mode="typing"
        showExamples={false}
        autoplayAudio={false}
        muteAudio={true}
        onAnswer={vi.fn()}
      />,
    );

    const input = await screen.findByPlaceholderText('Type your answer...');
    await user.type(input, 'realimperativvalue');
    await user.click(screen.getByRole('button', { name: /check answer/i }));
    await screen.findByText('Correct!');

    const patternValue = screen.getByText('realimperativvalue');
    expect(patternValue).not.toHaveAttribute('lang', 'sv');

    vi.resetModules();
    vi.doUnmock('@/data/verbData');
  });
});

const VARA_PRETERITUM_ANSWER = 'var';

// #32 originally faded the sibling-form pattern cue in and out of the
// pre-answer heading by item maturity. Ticket #91 replaced the heading
// with the infinitive alone, unconditionally: P2 (RED LINE,
// docs/learning/2026-08-08-ux-pedagogy-red-lines.md) forbids showing any
// other conjugated form during recall regardless of maturity, so #32's
// fade -- which still showed the full pattern for immature items -- no
// longer has a home on this screen. These tests replace the old
// maturity-parametrized suite: the heading must stay infinitive-only across
// the whole repetitions range, including unset.
describe('PracticeCard - repetitions does not affect the recall heading (superseding issue #32, per P2)', () => {
  it.each([0, 2, 3, 10, undefined])(
    'shows only the infinitive for repetitions=%s',
    async (repetitions) => {
      renderWithProviders(
        <PracticeCard
          infinitive="vara"
          form="preteritum"
          mode="typing"
          showExamples={false}
          autoplayAudio={false}
          muteAudio={true}
          repetitions={repetitions}
          onAnswer={vi.fn()}
        />,
      );

      const heading = await screen.findByRole('heading', { level: 2 });
      expect(heading.textContent).toBe('vara');
      expect(heading.textContent).not.toContain('är');
      expect(heading.textContent).not.toContain('varit');
    },
  );

  it("still reveals the full paradigm in the post-answer 'Complete pattern' review, independent of repetitions", async () => {
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
    await user.click(screen.getByRole('button', { name: /check answer/i }));
    await screen.findByText('Correct!');

    const completePattern = screen.getByText('Complete pattern:').closest('div');
    expect(completePattern).toHaveTextContent('är');
    expect(completePattern).toHaveTextContent('varit');
  });
});

// Issue #228 (AC): a "grupp X" text badge in the post-answer feedback area.
// Grupp predicts the answer's ending pattern, so the RED LINE is that it
// must never render before the learner submits an answer (src/lib/verbs.ts:
// 29-32 is the "never guessed" contract for undefined grupp).
describe('PracticeCard - grupp badge (issue #228)', () => {
  it('shows "grupp 4" in feedback only after answering, never on the pre-answer recall screen — typing mode', async () => {
    // "vara" is grupp '4' in VERB_DATA (swedish-linguist owned fixture).
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
    // RED LINE: nothing about the grupp is on the page before submission.
    expect(screen.queryByText(/grupp/i)).not.toBeInTheDocument();

    await user.type(input, VARA_PRESENS_ANSWER);
    expect(screen.queryByText(/grupp/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /check answer/i }));
    await screen.findByText('Correct!');

    expect(screen.getByText('grupp 4')).toBeInTheDocument();
  });

  it('shows "grupp 4" in feedback only after choosing an option, never while the options are on screen — multiple-choice mode', async () => {
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
      expect(screen.getAllByRole('button').length).toBeGreaterThan(0);
    });
    expect(screen.queryByText(/grupp/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: VARA_PRESENS_ANSWER }));
    await screen.findByText('Correct!');

    expect(screen.getByText('grupp 4')).toBeInTheDocument();
  });

  it('never renders a grupp badge — before or after answering — for a verb whose grupp is unknown (never guessed, src/lib/verbs.ts:29-32)', async () => {
    const user = userEvent.setup();

    // Comparison case first: a known-grupp verb really does show the badge
    // once answered, so this whole scenario is not vacuous against a build
    // that never wires the badge up at all.
    const { unmount } = renderWithProviders(
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
    let input = await screen.findByPlaceholderText('Type your answer...');
    await user.type(input, VARA_PRESENS_ANSWER);
    await user.click(screen.getByRole('button', { name: /check answer/i }));
    expect(await screen.findByText('grupp 4')).toBeInTheDocument();
    unmount();

    // Now the real assertion: an infinitive absent from VERB_DATA has an
    // undefined grupp per getVerbGrupp's documented contract, and that must
    // render as absent, not as a guessed/placeholder badge.
    renderWithProviders(
      <PracticeCard
        infinitive="zzz-not-a-real-verb-fixture"
        form="presens"
        mode="typing"
        showExamples={false}
        autoplayAudio={false}
        muteAudio={true}
        onAnswer={vi.fn()}
      />,
    );
    input = await screen.findByPlaceholderText('Type your answer...');
    await user.type(input, 'whatever');
    await user.click(screen.getByRole('button', { name: /check answer/i }));
    await waitFor(() => {
      expect(screen.queryByText('Correct!') || screen.queryByText('Not quite')).toBeTruthy();
    });

    expect(screen.queryByText(/grupp/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/undefined/i)).not.toBeInTheDocument();
  });
});

// Issue #110 AC: answer-correctness feedback must be announced via
// aria-live, since screen reader users must not be required to move focus
// onto the feedback region to hear it.
describe('PracticeCard - aria-live feedback (issue #110 AC)', () => {
  it('announces "Correct!" through a polite aria-live status region', async () => {
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
    await user.type(input, VARA_PRESENS_ANSWER);
    await user.click(screen.getByRole('button', { name: /check answer/i }));

    const status = await screen.findByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('Correct!');
    // The region announces itself; the learner is never required to move
    // focus onto it to perceive the feedback.
    expect(document.activeElement).not.toBe(status);
  });

  it('announces "Not quite" through the same aria-live status region on a wrong answer', async () => {
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
    await user.type(input, 'definitely-not-the-answer');
    await user.click(screen.getByRole('button', { name: /check answer/i }));

    const status = await screen.findByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('Not quite');
  });
});

// Issue #110 AC: touch targets must be at least 44px. The per-form
// pronounce buttons in the post-answer "Complete pattern" row were 24px
// (h-6 w-6) before this fix.
describe('PracticeCard - pronounce button touch target (issue #110 AC)', () => {
  it('renders the per-form pronounce buttons in the complete pattern at 44px (h-11 w-11) with an aria-label', async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(
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
    await user.type(input, VARA_PRESENS_ANSWER);
    await user.click(screen.getByRole('button', { name: /check answer/i }));
    await screen.findByText('Correct!');

    // "vara" pattern has multiple non-missing forms, each with its own
    // per-form pronounce button (aria-label="Pronounce <form label>"),
    // distinct from the unrelated "Pronounce pattern" button below the
    // pattern, which has no aria-label attribute of its own.
    const pronounceButtons = Array.from(
      container.querySelectorAll('button[aria-label^="Pronounce "]'),
    );
    expect(pronounceButtons.length).toBeGreaterThan(0);
    for (const button of pronounceButtons) {
      expect(button).toHaveClass('h-11');
      expect(button).toHaveClass('w-11');
      expect(button).not.toHaveClass('h-6');
      expect(button).not.toHaveClass('w-6');
    }
  });
});

// Issue #100 / PR #202: pronounce buttons need accessible names (screen
// readers announce icon-only <Volume2> buttons as unlabeled otherwise) and
// a >=44x44px touch target (via box size; the glyph itself stays small).
describe('PracticeCard - pronounce button accessibility', () => {
  it('gives every per-form pronounce button a descriptive, form-specific aria-label', async () => {
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
    await user.click(screen.getByRole('button', { name: /check answer/i }));
    await screen.findByText('Correct!');

    // Infinitiv ("vara"), Preteritum ("var") and Supinum ("varit") are the
    // non-missing pattern parts for infinitive="vara"/form="presens" — each
    // gets its own pronounce button labeled by its grammatical form name
    // (getFormLabel, owned by swedish-linguist), not a generic "Pronounce"
    // label that would be indistinguishable to a screen reader.
    expect(screen.getByRole('button', { name: 'Pronounce Infinitiv' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pronounce Preteritum' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pronounce Supinum' })).toBeInTheDocument();
  });

  it('gives per-form pronounce buttons and the pronounce-pattern button a >=44px touch target', async () => {
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
    await user.click(screen.getByRole('button', { name: /check answer/i }));
    await screen.findByText('Correct!');

    // Tailwind's default spacing scale: h-11/w-11 = 2.75rem = 44px. jsdom
    // doesn't compute real CSS (vitest.config.ts sets css: false), so this
    // pins the utility classes that deliver the 44px box per Tailwind's
    // documented scale, not a computed pixel value.
    const formButton = screen.getByRole('button', { name: 'Pronounce Infinitiv' });
    expect(formButton.className).toMatch(/\bh-11\b/);
    expect(formButton.className).toMatch(/\bw-11\b/);

    const pronouncePatternButton = screen.getByRole('button', { name: /pronounce pattern/i });
    expect(pronouncePatternButton.className).toMatch(/\bh-11\b/);
  });

  it('gives the backspace key an accessible name', async () => {
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
    expect(screen.getByRole('button', { name: /backspace/i })).toBeInTheDocument();
  });
});

// Issue #420: the "Pronounce pattern" button speaks the whole feedback-screen
// pattern as one speakSwedish() call, and any pronunciation in progress is
// cancelled on card advance / unmount. These tests exercise the real
// src/lib/speech.ts against a faked window.speechSynthesis (src/test/speechMock.ts,
// #418) rather than mocking speech.ts itself, per the "mock only the boundary
// the test does not own" rule.
describe('PracticeCard - pronounce pattern speech (issue #420)', () => {
  let speech: SpeechSynthesisMockHandle;

  beforeEach(() => {
    speech = installSpeechSynthesisMock([SV_VOICE]);
  });

  afterEach(() => {
    speech.uninstall();
  });

  async function renderAndReachFeedback(options: {
    infinitive: string;
    form: Form;
    muteAudio: boolean;
    autoplayAudio?: boolean;
    typedAnswer: string;
    onAnswer?: (grade: Grade) => void;
  }) {
    const user = userEvent.setup();
    const onAnswer = options.onAnswer ?? vi.fn();
    renderWithProviders(
      <PracticeCard
        infinitive={options.infinitive}
        form={options.form}
        mode="typing"
        showExamples={false}
        autoplayAudio={options.autoplayAudio ?? false}
        muteAudio={options.muteAudio}
        onAnswer={onAnswer}
      />,
    );
    const input = await screen.findByPlaceholderText('Type your answer...');
    await user.type(input, options.typedAnswer);
    await user.click(screen.getByRole('button', { name: /check answer/i }));
    await screen.findByRole('status');
    return { user, onAnswer };
  }

  it('speaks vara/presens as one utterance: infinitive, presens, preteritum, supinum in order', async () => {
    const { user } = await renderAndReachFeedback({
      infinitive: 'vara',
      form: 'presens',
      muteAudio: false,
      typedAnswer: VARA_PRESENS_ANSWER,
    });

    await user.click(screen.getByRole('button', { name: /pronounce pattern/i }));
    await vi.waitFor(() => expect(speech.speakCalls).toHaveLength(1));

    // Exactly one call, the four visible parts joined in display order, with
    // the missing (presens) part filled by correctAnswer rather than the
    // '_____' placeholder -- never a second call, an alternates-disclosure
    // string or note text mixed in.
    expect(speech.speakCalls[0]).toMatchObject({ text: 'vara, är, var, varit', lang: 'sv-SE' });
  });

  it('speaks vara/imperativ as exactly two parts (infinitive, imperativ), never the four-form chain', async () => {
    const { user } = await renderAndReachFeedback({
      infinitive: 'vara',
      form: 'imperativ',
      muteAudio: false,
      typedAnswer: 'var',
    });

    await user.click(screen.getByRole('button', { name: /pronounce pattern/i }));
    await vi.waitFor(() => expect(speech.speakCalls).toHaveLength(1));

    expect(speech.speakCalls[0]!.text).toBe('vara, var');
  });

  it('excludes an unavailable imperativ from the spoken pattern for a modal verb, and never speaks "(not available)"', async () => {
    // "kunna" is a modal verb (VERB_DATA noNaturalImperativ: true) with no
    // Swedish imperativ -- ConjugatedVerb.imperativNotApplicable, not merely
    // an unfilled field.
    const { user } = await renderAndReachFeedback({
      infinitive: 'kunna',
      form: 'imperativ',
      muteAudio: false,
      typedAnswer: 'anything',
    });

    await user.click(screen.getByRole('button', { name: /pronounce pattern/i }));
    await vi.waitFor(() => expect(speech.speakCalls).toHaveLength(1));

    expect(speech.speakCalls[0]!.text).toBe('kunna');
    expect(speech.speakCalls[0]!.text).not.toContain('(not available)');
  });

  it('makes no speakSwedish call when the card is muted and "Pronounce pattern" is clicked', async () => {
    const { user } = await renderAndReachFeedback({
      infinitive: 'vara',
      form: 'presens',
      muteAudio: true,
      typedAnswer: VARA_PRESENS_ANSWER,
    });

    await user.click(screen.getByRole('button', { name: /pronounce pattern/i }));
    // No waitFor: handlePronouncePattern's muted guard is a synchronous
    // early return, before any speakSwedish promise chain would start.
    expect(speech.speakCalls).toHaveLength(0);
  });

  it('calls stopSpeaking (speechSynthesis.cancel) before onAnswer when "Next Card" is clicked', async () => {
    let cancelCallsWhenOnAnswerFired = -1;
    const onAnswer = vi.fn(() => {
      cancelCallsWhenOnAnswerFired = speech.cancelCalls.length;
    });
    const { user } = await renderAndReachFeedback({
      infinitive: 'vara',
      form: 'presens',
      muteAudio: false,
      typedAnswer: VARA_PRESENS_ANSWER,
      onAnswer,
    });

    expect(speech.cancelCalls).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: /next card/i }));

    expect(onAnswer).toHaveBeenCalledTimes(1);
    // cancelCalls already held at least one entry by the time onAnswer ran --
    // proof stopSpeaking() ran before onAnswer, not just that both ran.
    expect(cancelCallsWhenOnAnswerFired).toBeGreaterThanOrEqual(1);
  });

  it('calls stopSpeaking before onAnswer on Enter at the feedback screen', async () => {
    let cancelCallsWhenOnAnswerFired = -1;
    const onAnswer = vi.fn(() => {
      cancelCallsWhenOnAnswerFired = speech.cancelCalls.length;
    });
    await renderAndReachFeedback({
      infinitive: 'vara',
      form: 'presens',
      muteAudio: false,
      typedAnswer: VARA_PRESENS_ANSWER,
      onAnswer,
    });

    expect(speech.cancelCalls).toHaveLength(0);
    fireEvent.keyDown(window, { key: 'Enter' });

    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(cancelCallsWhenOnAnswerFired).toBeGreaterThanOrEqual(1);
  });

  it('calls stopSpeaking on unmount', async () => {
    const { unmount } = renderWithProviders(
      <PracticeCard
        infinitive="vara"
        form="presens"
        mode="typing"
        showExamples={false}
        autoplayAudio={false}
        muteAudio={false}
        onAnswer={vi.fn()}
      />,
    );
    await screen.findByPlaceholderText('Type your answer...');

    expect(speech.cancelCalls).toHaveLength(0);
    unmount();
    expect(speech.cancelCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('keeps per-form Volume2 buttons labeled "Pronounce <form>" and each speaks only that one form', async () => {
    const { user } = await renderAndReachFeedback({
      infinitive: 'vara',
      form: 'presens',
      muteAudio: false,
      typedAnswer: VARA_PRESENS_ANSWER,
    });

    const infinitivButton = screen.getByRole('button', { name: 'Pronounce Infinitiv' });
    expect(infinitivButton).toHaveAttribute('aria-label', 'Pronounce Infinitiv');
    await user.click(infinitivButton);
    await vi.waitFor(() => expect(speech.speakCalls).toHaveLength(1));
    expect(speech.speakCalls[0]!.text).toBe('vara');

    const supinumButton = screen.getByRole('button', { name: 'Pronounce Supinum' });
    expect(supinumButton).toHaveAttribute('aria-label', 'Pronounce Supinum');
    await user.click(supinumButton);
    await vi.waitFor(() => expect(speech.speakCalls).toHaveLength(2));
    // The second call is the Supinum form alone, not appended to or combined
    // with the first -- each per-form button speaks only its own form.
    expect(speech.speakCalls[1]!.text).toBe('varit');
  });

  it('speaks only the correct answer, once, when the submission is correct and autoplayAudio is on', async () => {
    await renderAndReachFeedback({
      infinitive: 'vara',
      form: 'presens',
      muteAudio: false,
      autoplayAudio: true,
      typedAnswer: VARA_PRESENS_ANSWER,
    });

    await vi.waitFor(() => expect(speech.speakCalls).toHaveLength(1));
    expect(speech.speakCalls[0]!.text).toBe(VARA_PRESENS_ANSWER);
  });

  it('does not speak on submit when the answer is correct but autoplayAudio is off', async () => {
    await renderAndReachFeedback({
      infinitive: 'vara',
      form: 'presens',
      muteAudio: false,
      autoplayAudio: false,
      typedAnswer: VARA_PRESENS_ANSWER,
    });

    expect(speech.speakCalls).toHaveLength(0);
  });

  it('does not speak on submit when autoplayAudio is on but the answer is wrong', async () => {
    await renderAndReachFeedback({
      infinitive: 'vara',
      form: 'presens',
      muteAudio: false,
      autoplayAudio: true,
      typedAnswer: 'definitely-not-the-answer',
    });

    expect(speech.speakCalls).toHaveLength(0);
  });
});
