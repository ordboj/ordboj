import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/renderWithProviders';
import { VerbDetailsModal } from '@/components/VerbDetailsModal';
import type { ConjugatedVerb } from '@/lib/verbs';

// VerbDetailsModal.tsx reads useSettings (frontend-expert), mocked here as
// a boundary this suite does not own.
vi.mock('@/hooks/useSettings', () => ({
  useSettings: () => ({ settings: { muteAudio: true } }),
}));

// "vara" is a stable, real fixture from VERB_DATA (owned by
// swedish-linguist): presens "är", preteritum "var", supinum "varit",
// imperativ "var".
const VARA: ConjugatedVerb = {
  id: '1',
  infinitive: 'vara',
  presens: 'är',
  preteritum: 'var',
  supinum: 'varit',
  imperativ: 'var',
  cefr: 'A1',
};

// Issue #110: every pronounce icon button in the modal must reach the 44px
// minimum touch target and carry a distinguishing accessible name (the icon
// alone has none).
describe('VerbDetailsModal - 44px pronounce targets (issue #110)', () => {
  it('renders the headline pronounce button at 44px with an accessible name', () => {
    renderWithProviders(
      <VerbDetailsModal verb={VARA} srsStage={0} srsStates={{}} onClose={vi.fn()} />,
    );

    const headlineButton = screen.getByRole('button', { name: 'Pronounce vara' });
    expect(headlineButton).toHaveClass('h-11', 'w-11');
  });

  it('renders each per-form pronounce button at 44px with a distinguishing accessible name', () => {
    renderWithProviders(
      <VerbDetailsModal verb={VARA} srsStage={0} srsStates={{}} onClose={vi.fn()} />,
    );

    const presensButton = screen.getByRole('button', { name: 'Pronounce Present: är' });
    const preteritumButton = screen.getByRole('button', { name: 'Pronounce Past: var' });

    expect(presensButton).toHaveClass('h-11', 'w-11');
    expect(preteritumButton).toHaveClass('h-11', 'w-11');
  });
});
