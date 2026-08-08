import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/renderWithProviders';
import { VerbDetailsModal } from '@/components/VerbDetailsModal';
import { getFormLabel, type ConjugatedVerb } from '@/lib/verbs';
import { conjugationItemId } from '@/lib/itemIds';
import type { SrsState } from '@/lib/srs';

// PR #199 (issue #112, AC #4): the "New" stage badge used an off-palette
// bg-purple-500 utility that doesn't map to a design token. It must use an
// existing token color (bg-primary) instead.
const VERB: ConjugatedVerb = {
  id: '1',
  infinitive: 'vara',
  cefr: 'A1',
  presens: 'är',
  preteritum: 'var',
  supinum: 'varit',
  imperativ: 'var',
};

describe('VerbDetailsModal - stage badge color token', () => {
  it('renders the New badge (stage 0) with the bg-primary token, not the off-palette purple', () => {
    renderWithProviders(
      <VerbDetailsModal verb={VERB} srsStage={0} srsStates={{}} onClose={vi.fn()} />,
    );

    const badge = screen.getByText('New');
    expect(badge).toHaveClass('bg-primary');
    expect(badge).not.toHaveClass('bg-purple-500');
  });
});

// Issue #227: getStageBadge previously returned bg-orange-500 / bg-yellow-500
// / bg-green-500 (raw Tailwind palette classes with no design-token backing)
// for the Learning/Reviewing/Mastered stages, duplicated between this
// component and Progress.tsx. Post-fix both call sites share
// StageBadge.tsx's getStageBadge, which returns semantic bg-stage-* tokens
// instead. Against the pre-fix inline getStageBadge these raw-class
// assertions fail (the badge does carry bg-orange-500 etc.), so this is
// non-vacuous.
describe('VerbDetailsModal - Learning/Reviewing/Mastered badges use semantic tokens, not raw palette classes (issue #227)', () => {
  it('renders the Learning badge (stage 1-2) with bg-stage-learning, not bg-orange-500', () => {
    renderWithProviders(
      <VerbDetailsModal verb={VERB} srsStage={1} srsStates={{}} onClose={vi.fn()} />,
    );
    const badge = screen.getByText('Learning');
    expect(badge).toHaveClass('bg-stage-learning');
    expect(badge).not.toHaveClass('bg-orange-500');
  });

  it('renders the Reviewing badge (stage 3-4) with bg-stage-reviewing, not bg-yellow-500', () => {
    renderWithProviders(
      <VerbDetailsModal verb={VERB} srsStage={3} srsStates={{}} onClose={vi.fn()} />,
    );
    const badge = screen.getByText('Reviewing');
    expect(badge).toHaveClass('bg-stage-reviewing');
    expect(badge).not.toHaveClass('bg-yellow-500');
  });

  it('renders the Mastered badge (stage 5+) with bg-stage-mastered, not bg-green-500', () => {
    renderWithProviders(
      <VerbDetailsModal verb={VERB} srsStage={5} srsStates={{}} onClose={vi.fn()} />,
    );
    const badge = screen.getByText('Mastered');
    expect(badge).toHaveClass('bg-stage-mastered');
    expect(badge).not.toHaveClass('bg-green-500');
  });
});

// Issue #227: the stray overdue indicator at VerbDetailsModal.tsx:117 used
// text-orange-500 directly (no token). It is retokenized to text-stage-learning.
// A deterministic fake clock pins "overdue" without touching real Date.now().
describe('VerbDetailsModal - overdue indicator retokenized (issue #227)', () => {
  const FIXED_NOW = new Date('2026-08-08T12:00:00Z').getTime();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('applies text-stage-learning (not text-orange-500) to the "Next review" line when the item is overdue', () => {
    const overdueState: SrsState = {
      itemId: conjugationItemId(VERB.id, 'presens'),
      repetitions: 3,
      intervalDays: 4,
      easeFactor: 2.1,
      // Due a full day before the fixed "now" -- unambiguously overdue.
      dueAt: FIXED_NOW - 24 * 60 * 60 * 1000,
    };
    renderWithProviders(
      <VerbDetailsModal
        verb={VERB}
        srsStage={1}
        srsStates={{ [overdueState.itemId]: overdueState }}
        onClose={vi.fn()}
      />,
    );

    const nextReviewLine = screen.getByText(/Next review:/).closest('p') as HTMLElement;
    expect(nextReviewLine.textContent).toContain('(Due now!)');
    expect(nextReviewLine).toHaveClass('text-stage-learning');
    expect(nextReviewLine).not.toHaveClass('text-orange-500');
  });
});

// Issue #124: imperativNotApplicable flags a form as grammatically
// confirmed absent (modal verbs), distinct from a merely empty/placeholder
// value. This fixture gives the flagged verb a REAL, non-empty imperativ
// value (not the "(not available)" sentinel), so hiding it can only be
// explained by the new flag -- against pre-#124 code (no such field on
// ConjugatedVerb), a real non-empty value always rendered a normal row, so
// this fails there for the right reason.
describe('VerbDetailsModal - imperativNotApplicable flag hides the imperativ row regardless of stored value (issue #124)', () => {
  it('hides the Imperative row for a verb flagged imperativNotApplicable, even though it has a real, non-empty imperativ value', () => {
    const flaggedVerb: ConjugatedVerb = {
      ...VERB,
      imperativ: 'realimperativvalue',
      imperativNotApplicable: true,
    };
    renderWithProviders(
      <VerbDetailsModal verb={flaggedVerb} srsStage={0} srsStates={{}} onClose={vi.fn()} />,
    );

    expect(screen.queryByText('realimperativvalue')).not.toBeInTheDocument();
    expect(screen.queryByText(getFormLabel('imperativ'))).not.toBeInTheDocument();
  });

  it('still shows the Imperative row for a verb with a real imperativ and no flag (baseline, unaffected by #124)', () => {
    renderWithProviders(
      <VerbDetailsModal verb={VERB} srsStage={0} srsStates={{}} onClose={vi.fn()} />,
    );

    const label = screen.getByText(getFormLabel('imperativ'));
    expect(label).toBeInTheDocument();
    // VERB's preteritum and imperativ happen to share the same text ("var"),
    // so scope to the imperativ row's own container rather than a bare
    // getByText, which would find both.
    const row = label.closest('.border.rounded-lg') as HTMLElement;
    expect(within(row).getByText('var')).toBeInTheDocument();
  });
});

describe("VerbDetailsModal - lang='sv' on Swedish word display", () => {
  it("wraps the infinitive display with lang='sv' spans/paragraphs", () => {
    renderWithProviders(
      <VerbDetailsModal verb={VERB} srsStage={0} srsStates={{}} onClose={vi.fn()} />,
    );

    // Two separate renderings of the infinitive: the dialog title and the
    // "Infinitive" detail row. Both must carry lang="sv".
    const occurrences = screen.getAllByText('vara');
    expect(occurrences.length).toBeGreaterThan(0);
    for (const el of occurrences) {
      expect(el).toHaveAttribute('lang', 'sv');
    }
  });
});

// Issue #228 (AC): a "grupp X" text badge beside the CEFR badge.
describe('VerbDetailsModal - grupp badge (issue #228)', () => {
  it('shows "grupp 4" beside the CEFR badge for a verb with a known konjugationsgrupp, and shows no grupp badge (never guessed) for a verb whose grupp is unknown', () => {
    // "vara" is grupp '4' in VERB_DATA (swedish-linguist owned fixture). This
    // positive case makes the negative case below non-vacuous: the feature
    // demonstrably exists and only omits the badge for the unknown verb.
    const { unmount } = renderWithProviders(
      <VerbDetailsModal verb={VERB} srsStage={0} srsStates={{}} onClose={vi.fn()} />,
    );
    const cefrBadge = screen.getByText('A1');
    const gruppBadge = screen.getByText('grupp 4');
    expect(cefrBadge).toBeInTheDocument();
    expect(gruppBadge).toBeInTheDocument();
    // "beside" per the acceptance criteria: same immediate container.
    expect(gruppBadge.parentElement).toBe(cefrBadge.parentElement);
    unmount();

    // Real assertion: an infinitive absent from VERB_DATA has an undefined
    // grupp per getVerbGrupp's documented contract (src/lib/verbs.ts:29-32),
    // which must render as absent, never guessed.
    const unknownGruppVerb: ConjugatedVerb = { ...VERB, infinitive: 'zzz-not-a-real-verb-fixture' };
    renderWithProviders(
      <VerbDetailsModal verb={unknownGruppVerb} srsStage={0} srsStates={{}} onClose={vi.fn()} />,
    );
    expect(screen.getByText('A1')).toBeInTheDocument();
    expect(screen.queryByText(/grupp/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/undefined/i)).not.toBeInTheDocument();
  });
});
