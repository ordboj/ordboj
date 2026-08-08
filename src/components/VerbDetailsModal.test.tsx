import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
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
