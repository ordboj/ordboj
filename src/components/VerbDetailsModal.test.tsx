import { describe, it, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/renderWithProviders';
import { VerbDetailsModal } from '@/components/VerbDetailsModal';
import type { ConjugatedVerb } from '@/lib/verbs';

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
    expect(screen.queryByText('Imperative (command)')).not.toBeInTheDocument();
  });

  it('still shows the Imperative row for a verb with a real imperativ and no flag (baseline, unaffected by #124)', () => {
    renderWithProviders(
      <VerbDetailsModal verb={VERB} srsStage={0} srsStates={{}} onClose={vi.fn()} />,
    );

    const label = screen.getByText('Imperative (command)');
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
