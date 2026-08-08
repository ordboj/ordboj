import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import Home from '@/pages/Home';

// Home.tsx composes useSrsProgress and useSettings (both srs-engine owned)
// to show a due-card count. They are mocked here as boundaries this suite
// does not own. Deliberately, like the real hook, `getDueItems` below is a
// brand-new closure on every call to useSrsProgress() (the real hook's
// getDueItems is a useCallback that is recreated whenever srsStates
// changes) -- exactly the identity churn that issue #103's fix guards the
// due-count effect against. `getVerbs`/`loadVoices` are left real: they are
// swedish-linguist/frontend-expert owned and side-effect free in jsdom.
const mocks = vi.hoisted(() => {
  return {
    srsLoading: false,
    settingsLoading: false,
    cefrLevels: ['A1', 'A2'] as string[],
    dueItemsCallIndex: 0,
  };
});

vi.mock('@/hooks/useSrsProgress', () => ({
  useSrsProgress: () => ({
    isLoading: mocks.srsLoading,
    getDueItems: async () => {
      // First call simulates the real due count (5). Any later call (which
      // should never happen once the deck-load effect is fixed to only
      // react to isLoading/settingsLoading/cefrLevels) simulates the count
      // having dropped, so a spurious recompute is loud and observable.
      const lengths = [5, 1, 1, 1, 1];
      const idx = Math.min(mocks.dueItemsCallIndex, lengths.length - 1);
      mocks.dueItemsCallIndex += 1;
      // idx is always in bounds; the fallback only satisfies
      // noUncheckedIndexedAccess.
      const len = lengths[idx] ?? 1;
      return Array.from({ length: len }, (_, i) => ({
        verbId: String(i),
        infinitive: 'vara',
        form: 'presens' as const,
        itemId: `item-${i}`,
      }));
    },
    recordAnswer: vi.fn(),
    exportData: () => '{}',
    importData: () => true,
    resetProgress: () => undefined,
    srsStates: {},
    initializeAllItems: () => undefined,
  }),
}));

vi.mock('@/hooks/useSettings', () => ({
  useSettings: () => ({
    isLoading: mocks.settingsLoading,
    settings: {
      practiceMode: 'typing',
      showExamples: false,
      autoplayAudio: false,
      muteAudio: true,
      dailyGoal: 20,
      cefrLevels: mocks.cefrLevels,
    },
    updateSettings: vi.fn(),
  }),
}));

beforeEach(() => {
  mocks.srsLoading = false;
  mocks.settingsLoading = false;
  mocks.cefrLevels = ['A1', 'A2'];
  mocks.dueItemsCallIndex = 0;
});

describe('Home page - regression #103 (due count recompute on unrelated render)', () => {
  it('does not recompute the due count when an unrelated re-render happens', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Home />, { route: '/' });

    expect(await screen.findByText(/5 conjugations due for review/i)).toBeInTheDocument();

    // Toggle a CEFR level checkbox: this changes Home's own `selectedLevels`
    // state (an unrelated re-render caused by user interaction elsewhere on
    // the page), not `isLoading`/`settingsLoading`/`settings.cefrLevels`.
    // It must not cause the due-count effect to recompute just because
    // useSrsProgress() handed back a fresh (but functionally identical)
    // getDueItems reference on this render.
    const a2Checkbox = screen.getByRole('checkbox', { name: 'A2' });
    await user.click(a2Checkbox);

    // Give any (incorrect) recompute a chance to land before asserting.
    await waitFor(() => {
      expect(screen.getByText(/conjugations due for review/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/5 conjugations due for review/i)).toBeInTheDocument();
  });
});
