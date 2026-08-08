import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import Settings from '@/pages/Settings';

// Settings.tsx composes useSettings (frontend-expert) and useSrsProgress
// (srs-engine). Both are mocked here as boundaries this suite does not own,
// so the page's own markup is what's under test - specifically, issue #92
// asks for the no-op Interface Language control to be gone for good, and
// issue #137 asks for the CEFR checkbox group to refuse unselecting the
// last remaining level.
//
// mockSettingsState is mutable so individual tests can set up a specific
// cefrLevels starting point (e.g. exactly one level selected) without
// re-mocking the module per test. vi.hoisted is required because vi.mock
// factories are hoisted above normal module-scope declarations.
const { mockSettingsState } = vi.hoisted(() => ({
  mockSettingsState: {
    settings: {
      practiceMode: 'typing',
      showExamples: false,
      autoplayAudio: true,
      muteAudio: false,
      dailyGoal: 20,
      cefrLevels: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as string[],
    },
    updateSettings: vi.fn(),
  },
}));

vi.mock('@/hooks/useSettings', () => ({
  useSettings: () => mockSettingsState,
}));

vi.mock('@/hooks/useSrsProgress', () => ({
  useSrsProgress: () => ({
    exportData: () => '{}',
    importData: () => true,
    resetProgress: () => undefined,
  }),
}));

beforeEach(() => {
  mockSettingsState.settings.cefrLevels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  mockSettingsState.updateSettings = vi.fn();
});

describe('Settings page - issue #92: remove the no-op Interface Language setting', () => {
  it('does not render an Interface Language label', () => {
    renderWithProviders(<Settings />, { route: '/settings' });

    expect(screen.queryByText(/interface language/i)).not.toBeInTheDocument();
  });

  it('does not render an interface-language select control', () => {
    renderWithProviders(<Settings />, { route: '/settings' });

    expect(screen.queryByRole('combobox', { name: /interface language/i })).not.toBeInTheDocument();
    expect(document.getElementById('interface-language')).toBeNull();
  });

  it('does not offer English/Svenska as selectable options anywhere on the page', () => {
    renderWithProviders(<Settings />, { route: '/settings' });

    expect(screen.queryByText(/^svenska$/i)).not.toBeInTheDocument();
  });

  it('still renders the other Practice Settings controls untouched by the removal', () => {
    renderWithProviders(<Settings />, { route: '/settings' });

    expect(screen.getByText('Practice Mode')).toBeInTheDocument();
    expect(screen.getByText('Show example sentences')).toBeInTheDocument();
    expect(screen.getByText('Autoplay pronunciation')).toBeInTheDocument();
    expect(screen.getByText('CEFR Levels to Practice')).toBeInTheDocument();
  });
});

describe('Settings page - issue #137: CEFR checkbox group refuses zero selection', () => {
  // Regression for issue #137: previously the onCheckedChange handler called
  // updateSettings with whatever newLevels came out of the toggle, with no
  // guard, so unchecking the last selected level produced cefrLevels: []
  // and persisted it - which useSrsProgress.getDueItems then silently
  // treated as "match every verb" (see the useSrsProgress.test.ts
  // regression for that half of the bug).
  it('#137: does not call updateSettings when unchecking the last remaining CEFR level', async () => {
    mockSettingsState.settings.cefrLevels = ['A1'];
    const user = userEvent.setup();
    renderWithProviders(<Settings />, { route: '/settings' });

    const a1 = screen.getByRole('checkbox', { name: 'A1' });
    expect(a1).toHaveAttribute('aria-checked', 'true');

    await user.click(a1);

    expect(mockSettingsState.updateSettings).not.toHaveBeenCalled();
    // The checkbox reflects the (unchanged) settings.cefrLevels prop, so it
    // must still render as checked - the click had no effect.
    expect(a1).toHaveAttribute('aria-checked', 'true');
  });

  it('#137: still allows unchecking a level when more than one remains selected', async () => {
    mockSettingsState.settings.cefrLevels = ['A1', 'A2'];
    const user = userEvent.setup();
    renderWithProviders(<Settings />, { route: '/settings' });

    const a1 = screen.getByRole('checkbox', { name: 'A1' });
    await user.click(a1);

    expect(mockSettingsState.updateSettings).toHaveBeenCalledTimes(1);
    expect(mockSettingsState.updateSettings).toHaveBeenCalledWith({ cefrLevels: ['A2'] });
  });

  it('#137: checking an additional level while several are already selected is unaffected by the guard', async () => {
    mockSettingsState.settings.cefrLevels = ['A1'];
    const user = userEvent.setup();
    renderWithProviders(<Settings />, { route: '/settings' });

    const a2 = screen.getByRole('checkbox', { name: 'A2' });
    await user.click(a2);

    expect(mockSettingsState.updateSettings).toHaveBeenCalledTimes(1);
    expect(mockSettingsState.updateSettings).toHaveBeenCalledWith({ cefrLevels: ['A1', 'A2'] });
  });
});
