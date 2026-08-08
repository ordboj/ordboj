import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import Home from '@/pages/Home';

// Home.tsx (frontend-expert) composes useSettings and useSrsProgress
// (srs-engine) as data sources. Both are mocked here as boundaries this
// suite does not own, driven by hoisted mutable state so each test can
// steer settings.cefrLevels without re-declaring vi.mock.
//
// Issue #118: Home used to keep a `selectedLevels` local state that
// duplicated settings.cefrLevels and only converged with it via a sync
// useEffect, and its handleLevelToggle called setSelectedLevels directly
// regardless of whether updateSettings actually persisted anything. It also
// mutated settings.cefrLevels in place via a render-time `.sort()` call on
// the same array reference. These tests pin the fixed behavior:
// selectedLevels must be *derived* straight from settings.cefrLevels (no
// local state to drift), and the level list must never be mutated by
// rendering the "Selected: ..." summary.
const mocks = vi.hoisted(() => {
  return {
    updateSettings: vi.fn(),
    settings: {
      practiceMode: 'typing' as const,
      showExamples: false,
      autoplayAudio: false,
      muteAudio: true,
      dailyGoal: 20,
      cefrLevels: ['B1', 'A1'] as string[],
    },
    settingsLoading: false,
  };
});

vi.mock('@/hooks/useSettings', () => ({
  useSettings: () => ({
    settings: mocks.settings,
    isLoading: mocks.settingsLoading,
    updateSettings: mocks.updateSettings,
  }),
}));

vi.mock('@/hooks/useSrsProgress', () => ({
  useSrsProgress: () => ({
    isLoading: false,
    getDueItems: async () => [],
  }),
}));

beforeEach(() => {
  mocks.updateSettings.mockClear();
  mocks.settingsLoading = false;
  mocks.settings = {
    practiceMode: 'typing',
    showExamples: false,
    autoplayAudio: false,
    muteAudio: true,
    dailyGoal: 20,
    cefrLevels: ['B1', 'A1'],
  };
});

describe('Home page - issue #118: derive selectedLevels from settings', () => {
  it('does not keep a separate selectedLevels state: a toggle that updateSettings fails to persist leaves the checkbox unchanged', async () => {
    // All 6 levels selected on purpose: this keeps the render on the "All
    // levels selected" branch (no .sort() call), isolating this test to the
    // separate-local-state bug rather than the render-time mutation bug
    // (covered separately below).
    mocks.settings = {
      ...mocks.settings,
      cefrLevels: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
    };
    const user = userEvent.setup();
    renderWithProviders(<Home />, { route: '/' });

    const a2Checkbox = await screen.findByRole('checkbox', { name: 'A2' });
    expect(a2Checkbox).toBeChecked();

    await user.click(a2Checkbox);

    // updateSettings was asked to drop A2 ...
    expect(mocks.updateSettings).toHaveBeenCalledWith({
      cefrLevels: ['A1', 'B1', 'B2', 'C1', 'C2'],
    });

    // ... but since the mock never actually writes back to
    // settings.cefrLevels (simulating that Home is not the source of
    // truth), a selectedLevels that is truly *derived* from settings must
    // still show A2 checked. Pre-fix, handleLevelToggle also called
    // setSelectedLevels(newLevels) directly, so the checkbox flipped
    // regardless of whether updateSettings took effect - that's the bug
    // this test pins.
    expect(a2Checkbox).toBeChecked();
  });

  it("reflects settings.cefrLevels directly, with no stale carryover from a previous render's levels", () => {
    mocks.settings = { ...mocks.settings, cefrLevels: ['C1'] };
    renderWithProviders(<Home />, { route: '/' });

    expect(screen.getByRole('checkbox', { name: 'C1' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'A1' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'B1' })).not.toBeChecked();
  });

  it('does not mutate settings.cefrLevels in place while rendering the sorted summary', () => {
    // Unsorted on purpose, and a strict subset of allLevels so the render
    // path takes the `Selected: ${...sort().join(', ')}` branch rather than
    // the "All levels selected" one.
    const cefrLevels = ['B1', 'A1'];
    mocks.settings = { ...mocks.settings, cefrLevels };

    renderWithProviders(<Home />, { route: '/' });

    // The displayed summary is sorted either way ...
    expect(screen.getByText('Selected: A1, B1')).toBeInTheDocument();

    // ... but the underlying array handed in by useSettings must be left
    // exactly as it was. Pre-fix, `selectedLevels.sort()` ran directly on
    // this array reference (selectedLevels was initialized straight from
    // settings.cefrLevels) and sorted it in place on the very first render.
    expect(cefrLevels).toEqual(['B1', 'A1']);
  });
});
