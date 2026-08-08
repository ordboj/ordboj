import { describe, it, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/renderWithProviders';
import { VerbDetailsModal } from '@/components/VerbDetailsModal';
import { getFormLabel, type ConjugatedVerb } from '@/lib/verbs';

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

// Issue #110 AC: touch targets must be at least 44px. Both pronounce
// buttons here were 40px (the infinitive one: size="icon" default h-10 w-10,
// no explicit size class) and 32px (h-8 w-8, the per-form one) before this fix.
describe('VerbDetailsModal - pronounce button touch targets (issue #110 AC)', () => {
  it('renders the infinitive pronounce button at 44px (h-11 w-11) with an aria-label', () => {
    renderWithProviders(
      <VerbDetailsModal verb={VERB} srsStage={0} srsStates={{}} onClose={vi.fn()} />,
    );

    const button = screen.getByRole('button', { name: `Pronounce ${VERB.infinitive}` });
    expect(button).toHaveClass('h-11');
    expect(button).toHaveClass('w-11');
  });

  it('renders each per-form pronounce button at 44px (h-11 w-11) with an aria-label, not the old 32px (h-8 w-8)', () => {
    renderWithProviders(
      <VerbDetailsModal verb={VERB} srsStage={0} srsStates={{}} onClose={vi.fn()} />,
    );

    const formButton = screen.getByRole('button', {
      name: `Pronounce ${getFormLabel('presens')}`,
    });
    expect(formButton).toHaveClass('h-11');
    expect(formButton).toHaveClass('w-11');
    expect(formButton).not.toHaveClass('h-8');
    expect(formButton).not.toHaveClass('w-8');
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
