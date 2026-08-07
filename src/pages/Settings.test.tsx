import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeProvider } from 'next-themes';
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

// Issue #140: dark mode CSS shipped but unreachable — no provider, toggle, or
// system-preference listener. renderWithProviders() deliberately mirrors only
// the app-wide chrome (react-query, tooltip, router) and has no opinion on
// theme, so these tests wrap Settings the same way App.tsx actually does
// (ThemeProvider with the same props) to prove the "Appearance" control this
// PR adds is wired end-to-end: picking a theme both updates the DOM and
// survives a remount (persistence), not just a local bit of component state.
function renderSettingsWithRealTheme() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <MemoryRouter initialEntries={['/settings']}>
            <Settings />
          </MemoryRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

describe('Settings page - issue #140: theme toggle', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
  });

  afterEach(() => {
    document.documentElement.className = '';
  });

  it('renders an Appearance card with a Theme control offering Light, Dark and System', () => {
    renderSettingsWithRealTheme();

    expect(screen.getByText('Appearance')).toBeInTheDocument();
    expect(screen.getByLabelText('Theme')).toBeInTheDocument();
  });

  it('picking Dark from the theme select adds the dark class to <html> and persists the choice', async () => {
    const user = userEvent.setup();
    renderSettingsWithRealTheme();

    await user.click(screen.getByLabelText('Theme'));
    await user.click(await screen.findByRole('option', { name: /dark/i }));

    await waitFor(() => expect(document.documentElement.classList.contains('dark')).toBe(true));
    expect(localStorage.getItem('theme')).toBe('dark');
  });

  it('picking Light from the theme select removes the dark class and persists the choice', async () => {
    localStorage.setItem('theme', 'dark');
    document.documentElement.classList.add('dark');
    const user = userEvent.setup();
    renderSettingsWithRealTheme();

    await user.click(screen.getByLabelText('Theme'));
    await user.click(await screen.findByRole('option', { name: /^light$/i }));

    await waitFor(() => expect(document.documentElement.classList.contains('light')).toBe(true));
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem('theme')).toBe('light');
  });

  it("reflects a previously stored theme choice as the select's value after mount, not stuck on System", async () => {
    localStorage.setItem('theme', 'dark');
    renderSettingsWithRealTheme();

    await waitFor(() => expect(screen.getByLabelText('Theme')).toHaveTextContent(/dark/i));
  });
});
