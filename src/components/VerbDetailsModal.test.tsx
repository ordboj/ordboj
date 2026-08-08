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
