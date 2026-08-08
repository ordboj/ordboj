import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import Settings from '@/pages/Settings';

// Settings.tsx composes useSettings (frontend-expert) and useSrsProgress
// (srs-engine). Both are mocked here as boundaries this suite does not own,
// so the page's own markup is what's under test - specifically, issue #92
// asks for the no-op Interface Language control to be gone for good.
const updateSettingsMock = vi.fn();

// Mutable so individual tests (issue #137) can control how many CEFR levels
// are "currently selected" without re-mocking the module per test.
let mockCefrLevels: string[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

vi.mock('@/hooks/useSettings', () => ({
  useSettings: () => ({
    settings: {
      practiceMode: 'typing',
      showExamples: false,
      autoplayAudio: true,
      muteAudio: false,
      dailyGoal: 20,
      get cefrLevels() {
        return mockCefrLevels;
      },
    },
    updateSettings: updateSettingsMock,
  }),
}));

vi.mock('@/hooks/useSrsProgress', () => ({
  useSrsProgress: () => ({
    exportData: () => '{}',
    importData: () => true,
    resetProgress: () => undefined,
  }),
}));

beforeEach(() => {
  mockCefrLevels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  updateSettingsMock.mockClear();
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

// Issue #137: unchecking the last remaining CEFR level checkbox must not
// produce an empty cefrLevels selection. An empty selection is silently
// treated elsewhere as "no filter = every verb", so a UI state that looks
// like "nothing chosen" must be unreachable from the checkbox handler.
describe('Settings page - issue #137: CEFR checkbox guard against zero selection', () => {
  beforeEach(() => {
    updateSettingsMock.mockClear();
  });

  it('does not call updateSettings when unchecking the only remaining selected level', async () => {
    mockCefrLevels = ['A1'];
    const user = userEvent.setup();
    renderWithProviders(<Settings />, { route: '/settings' });

    const a1 = screen.getByRole('checkbox', { name: 'A1' });
    expect(a1).toHaveAttribute('aria-checked', 'true');

    await user.click(a1);

    // The guard must swallow this click entirely: no settings update fires
    // with an empty (or any) cefrLevels array as a result of it.
    expect(updateSettingsMock).not.toHaveBeenCalled();
  });

  it('leaves the last-remaining checkbox visually still checked after the blocked click', async () => {
    mockCefrLevels = ['B2'];
    const user = userEvent.setup();
    renderWithProviders(<Settings />, { route: '/settings' });

    const b2 = screen.getByRole('checkbox', { name: 'B2' });
    await user.click(b2);

    expect(b2).toHaveAttribute('aria-checked', 'true');
  });

  it('still allows unchecking a level when more than one is selected', async () => {
    mockCefrLevels = ['A1', 'A2'];
    const user = userEvent.setup();
    renderWithProviders(<Settings />, { route: '/settings' });

    const a1 = screen.getByRole('checkbox', { name: 'A1' });
    await user.click(a1);

    expect(updateSettingsMock).toHaveBeenCalledWith({ cefrLevels: ['A2'] });
  });
});
