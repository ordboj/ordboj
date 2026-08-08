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
    muteAudio: false,
    updateSettings: vi.fn(),
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
      const len = lengths[idx];
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
      muteAudio: mocks.muteAudio,
      dailyGoal: 20,
      cefrLevels: mocks.cefrLevels,
    },
    updateSettings: mocks.updateSettings,
  }),
}));

beforeEach(() => {
  mocks.muteAudio = false;
  mocks.updateSettings.mockClear();
  mocks.srsLoading = false;
  mocks.settingsLoading = false;
  mocks.cefrLevels = ['A1', 'A2'];
  mocks.dueItemsCallIndex = 0;
});

// Issue #100 / PR #202: the icon-only mute toggle needs an accessible name
// so a screen reader announces something other than "button".
describe('Home - mute toggle accessibility', () => {
  it('labels the toggle "Mute audio" when audio is currently unmuted', async () => {
    renderWithProviders(<Home />);

    expect(await screen.findByRole('button', { name: 'Mute audio' })).toBeInTheDocument();
  });

  it('labels the toggle "Unmute audio" when audio is currently muted', async () => {
    mocks.muteAudio = true;
    renderWithProviders(<Home />);

    expect(await screen.findByRole('button', { name: 'Unmute audio' })).toBeInTheDocument();
  });

  it('toggles muteAudio in settings when clicked, and meets the 44px touch target', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Home />);

    const toggle = await screen.findByRole('button', { name: 'Mute audio' });
    expect(toggle.className).toMatch(/\bh-11\b/);
    expect(toggle.className).toMatch(/\bw-11\b/);

    await user.click(toggle);
    expect(mocks.updateSettings).toHaveBeenCalledWith({ muteAudio: true });
  });
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
