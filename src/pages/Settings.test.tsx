import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
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
  mockCefrLevels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  updateSettingsMock.mockClear();
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

  it('still allows unchecking a level when more than one is selected', async () => {
    mockCefrLevels = ['A1', 'A2'];
    const user = userEvent.setup();
    renderWithProviders(<Settings />, { route: '/settings' });

    const a1 = screen.getByRole('checkbox', { name: 'A1' });
    await user.click(a1);

    expect(updateSettingsMock).toHaveBeenCalledWith({ cefrLevels: ['A2'] });
  });
});

// Issue #327: the Switch primitive itself stays h-6 (24px, below the 44px
// touch-target minimum). Each switch is wrapped in a native <label
// htmlFor={id}> sized to min-h-11 min-w-11 (Tailwind 11 = 44px) so the
// clickable box meets the target without touching the generated
// ui/switch.tsx. jsdom cannot compute real layout, so this pins the class
// contract that produces the 44px box, not pixel geometry.
describe('Settings page - issue #327: 44px touch target on the Switch controls', () => {
  it.each([
    { id: 'show-examples', name: /show example sentences/i },
    { id: 'autoplay-audio', name: /autoplay pronunciation/i },
  ])('wraps the "$id" switch in a min-h-11 min-w-11 label bound via htmlFor', ({ id, name }) => {
    renderWithProviders(<Settings />, { route: '/settings' });

    const switchEl = document.getElementById(id) as HTMLElement;
    expect(switchEl).not.toBeNull();
    expect(switchEl.getAttribute('role')).toBe('switch');

    const label = switchEl.closest('label');
    expect(label).not.toBeNull();
    expect(label).toHaveClass('min-h-11');
    expect(label).toHaveClass('min-w-11');
    expect(label).toHaveAttribute('for', id);

    // Sanity check that the id is still reachable by its accessible name,
    // i.e. the enlarged wrapper didn't detach the control from its text.
    expect(screen.getByRole('switch', { name })).toBe(switchEl);
  });

  it('toggles showExamples via onCheckedChange when the enlarged label (not the switch button) is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Settings />, { route: '/settings' });

    const switchEl = document.getElementById('show-examples') as HTMLElement;
    const label = switchEl.closest('label') as HTMLElement;

    // Click the label itself, not the switch, to prove the enlarged hit
    // area - not just the underlying 24px button - actually activates it.
    expect(label).not.toBe(switchEl);
    await user.click(label);

    expect(updateSettingsMock).toHaveBeenCalledWith({ showExamples: true });
  });

  it('toggles autoplayAudio via onCheckedChange when its enlarged label is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Settings />, { route: '/settings' });

    const switchEl = document.getElementById('autoplay-audio') as HTMLElement;
    const label = switchEl.closest('label') as HTMLElement;

    await user.click(label);

    // autoplayAudio starts true in the mocked settings, so clicking flips it off.
    expect(updateSettingsMock).toHaveBeenCalledWith({ autoplayAudio: false });
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
