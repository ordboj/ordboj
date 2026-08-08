import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import Home from '@/pages/Home';

// useSrsProgress and useSettings (srs-engine) are mocked here as boundaries
// this suite does not own, the same way src/pages/Practice.test.tsx does.
// getVerbs() (swedish-linguist) is left real: it's synchronous in-memory
// data, not a network/storage boundary.
const mocks = vi.hoisted(() => {
  return {
    muteAudio: false,
    updateSettings: vi.fn(),
  };
});

vi.mock('@/hooks/useSrsProgress', () => ({
  useSrsProgress: () => ({
    isLoading: false,
    getDueItems: async () => [],
  }),
}));

vi.mock('@/hooks/useSettings', () => ({
  useSettings: () => ({
    isLoading: false,
    settings: {
      practiceMode: 'typing',
      showExamples: false,
      autoplayAudio: false,
      muteAudio: mocks.muteAudio,
      dailyGoal: 20,
      cefrLevels: ['A1'],
    },
    updateSettings: mocks.updateSettings,
  }),
}));

beforeEach(() => {
  mocks.muteAudio = false;
  mocks.updateSettings.mockClear();
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
