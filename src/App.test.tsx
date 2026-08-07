import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import App from '@/App';

// Issue #140: dark mode CSS shipped but unreachable — no ThemeProvider, no
// system-preference listener, no persistence. This pins App.tsx's
// next-themes wiring against the three acceptance criteria for "ship":
//   - attribute="class" (matches tailwind.config.ts's `darkMode: ['class']`)
//   - defaultTheme="system" + enableSystem, so prefers-color-scheme is read
//   - an explicit user choice persists (survives a remount / reload) instead
//     of resetting to whatever the OS prefers
//
// Before this PR's App.tsx change there was no <ThemeProvider> anywhere in
// the tree, so next-themes' useTheme() fell back to its no-context default
// (setTheme is a no-op, theme stays undefined) and <html> never got a
// "dark"/"light" class no matter what the OS preferred or the user picked.

function mockMatchMedia(prefersDark: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-color-scheme: dark)' ? prefersDark : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe('App - issue #140: theme provider is reachable', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
  });

  afterEach(() => {
    document.documentElement.className = '';
  });

  it('applies the dark class to <html> when the OS prefers dark and no theme is stored', async () => {
    mockMatchMedia(true);

    render(<App />);

    await waitFor(() => expect(document.documentElement.classList.contains('dark')).toBe(true));
  });

  it('applies the light class (not dark) to <html> when the OS prefers light and no theme is stored', async () => {
    mockMatchMedia(false);

    render(<App />);

    await waitFor(() => expect(document.documentElement.classList.contains('light')).toBe(true));
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it("honors an explicit stored 'dark' choice even when the OS prefers light", async () => {
    mockMatchMedia(false);
    localStorage.setItem('theme', 'dark');

    render(<App />);

    await waitFor(() => expect(document.documentElement.classList.contains('dark')).toBe(true));
  });

  it("persists an explicit 'light' choice across a remount (simulated reload) even when the OS prefers dark", async () => {
    mockMatchMedia(true); // OS says dark; the stored explicit choice must win
    localStorage.setItem('theme', 'light');

    const { unmount } = render(<App />);
    await waitFor(() => expect(document.documentElement.classList.contains('light')).toBe(true));
    unmount();
    document.documentElement.className = '';

    render(<App />);

    await waitFor(() => expect(document.documentElement.classList.contains('light')).toBe(true));
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem('theme')).toBe('light');
  });
});
