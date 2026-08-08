import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
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

vi.mock('@/hooks/useSrsProgress', () => ({
  useSrsProgress: () => ({
    exportData: () => '{}',
    importData: () => true,
    resetProgress: () => undefined,
  }),
}));

describe('Settings page - viewport height (issue #113)', () => {
  it("uses min-h-dvh (not min-h-screen) so content isn't clipped when the mobile keyboard opens", () => {
    const { container } = renderWithProviders(<Settings />, { route: '/settings' });

    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toMatch(/\bmin-h-dvh\b/);
    expect(root.className).not.toMatch(/\bmin-h-screen\b/);
  });
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
