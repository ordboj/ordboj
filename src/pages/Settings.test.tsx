import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import Settings from '@/pages/Settings';

// Settings.tsx composes useSettings (frontend-expert) and useSrsProgress
// (srs-engine). Both are mocked here as boundaries this suite does not own,
// so the page's own markup is what's under test - specifically, issue #92
// asks for the no-op Interface Language control to be gone for good.
vi.mock('@/hooks/useSettings', () => ({
  useSettings: () => ({
    settings: {
      practiceMode: 'typing',
      showExamples: false,
      autoplayAudio: true,
      muteAudio: false,
      dailyGoal: 20,
      cefrLevels: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
    },
    updateSettings: vi.fn(),
  }),
}));

// resetProgress/exportData are spies (not just stubs) for issue #93: the
// tests assert on whether/when they are invoked, which is the actual
// contract of the confirmation dialog. Hoisted + reset in beforeEach so the
// harness's global restoreMocks (vitest.config.ts) can't silently strip the
// exportData implementation between tests (see Practice.test.tsx for the
// same pattern).
const mocks = vi.hoisted(() => {
  return {
    resetProgress: vi.fn(),
    exportData: vi.fn(() => '{}'),
  };
});

vi.mock('@/hooks/useSrsProgress', () => ({
  useSrsProgress: () => ({
    exportData: mocks.exportData,
    importData: () => true,
    resetProgress: mocks.resetProgress,
  }),
}));

beforeEach(() => {
  mocks.resetProgress.mockClear();
  mocks.exportData.mockClear();
  mocks.exportData.mockImplementation(() => '{}');
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

describe('Settings page - issue #93: guard Reset All Progress with a real confirmation', () => {
  it('opens a confirmation dialog naming the exact consequence when the trigger is clicked, without resetting yet', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Settings />, { route: '/settings' });

    await user.click(screen.getByRole('button', { name: /reset all progress/i }));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/reset all progress\?/i)).toBeInTheDocument();
    expect(
      within(dialog).getByText(/deletes all practice progress on this device/i),
    ).toBeInTheDocument();
    expect(within(dialog).getByText(/cannot be undone/i)).toBeInTheDocument();
    expect(mocks.resetProgress).not.toHaveBeenCalled();
  });

  it("does not rename the trigger to 'Click again to confirm reset' after one click (regression for the old double-click flow)", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Settings />, { route: '/settings' });

    await user.click(screen.getByRole('button', { name: /reset all progress/i }));

    expect(
      screen.queryByRole('button', { name: /click again to confirm reset/i }),
    ).not.toBeInTheDocument();
    expect(mocks.resetProgress).not.toHaveBeenCalled();
  });

  it('does not reset progress when the dialog is cancelled', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Settings />, { route: '/settings' });

    await user.click(screen.getByRole('button', { name: /reset all progress/i }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: /cancel/i }));

    expect(mocks.resetProgress).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('calls resetProgress exactly once after the destructive action inside the dialog is confirmed', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Settings />, { route: '/settings' });

    await user.click(screen.getByRole('button', { name: /reset all progress/i }));
    const dialog = await screen.findByRole('alertdialog');
    // AlertDialogAction: the confirm button inside the dialog, distinct from
    // the trigger button of the same name that opened it.
    await user.click(within(dialog).getByRole('button', { name: /^reset all progress$/i }));

    expect(mocks.resetProgress).toHaveBeenCalledTimes(1);
  });

  it('offers an Export action inside the confirmation dialog that calls the real export', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Settings />, { route: '/settings' });

    await user.click(screen.getByRole('button', { name: /reset all progress/i }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: /export progress/i }));

    expect(mocks.exportData).toHaveBeenCalled();
    // Exporting from inside the dialog must not itself wipe progress.
    expect(mocks.resetProgress).not.toHaveBeenCalled();
  });

  it('states the local-only storage risk honestly and recommends periodic export', () => {
    renderWithProviders(<Settings />, { route: '/settings' });

    // Regression for the old blanket "All data is stored locally on your
    // device" copy, which didn't say what that implies.
    expect(
      screen.queryByText(/^all data is stored locally on your device$/i),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/clearing site data/i)).toBeInTheDocument();
    expect(screen.getByText(/export regularly/i)).toBeInTheDocument();
  });
});
