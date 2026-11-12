import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import { resetPracticeEventsForTests } from '@/lib/practiceEvents';
import Settings from '@/pages/Settings';

const auth = vi.hoisted(() => ({
  status: 'authenticated' as 'authenticated' | 'loading',
  offline: false,
}));

vi.mock('@/lib/auth/session', () => ({
  getAuthSnapshot: () => {
    if (auth.status !== 'authenticated') return { status: 'loading' as const };
    return {
      status: 'authenticated' as const,
      offline: auth.offline,
      user: { id: 'user-1', email: 'ada@example.com', emailVerified: true },
    };
  },
}));

vi.mock('@/hooks/useSettings', () => ({
  useSettings: () => ({
    settings: {
      practiceMode: 'typing',
      showExamples: false,
      autoplayAudio: true,
      muteAudio: false,
      autoReadAllForms: false,
      dailyGoal: 20,
      particleDailyGoal: 12,
      cefrLevels: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
    },
    updateSettings: vi.fn(),
  }),
  reloadSettingsFromStorage: vi.fn(),
}));

vi.mock('@/hooks/useSrsProgress', () => ({
  useSrsProgress: () => ({
    exportData: () => '{}',
    importData: () => true,
    resetProgress: vi.fn(),
  }),
}));

const calls: { method: string; body: string | null }[] = [];

beforeEach(() => {
  auth.status = 'authenticated';
  auth.offline = false;
  calls.length = 0;
  resetPracticeEventsForTests();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const body = typeof init?.body === 'string' ? init.body : null;
      calls.push({ method, body });
      if (method === 'PUT') {
        return new Response(JSON.stringify({ optedOut: body?.includes('"optedOut":true') }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ optedOut: false }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
});

afterEach(() => {
  resetPracticeEventsForTests();
  vi.unstubAllGlobals();
});

describe('Settings practice-event objection', () => {
  it('turns storage off for the signed-in account', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Settings />, { route: '/settings' });

    const control = await screen.findByRole('switch', { name: 'Store practice events' });
    expect(control).toHaveAttribute('aria-checked', 'true');

    await act(async () => {
      await user.click(control);
    });

    await waitFor(() => {
      expect(calls.some((call) => call.method === 'PUT')).toBe(true);
    });
    const put = calls.find((call) => call.method === 'PUT');
    expect(put?.body).toBe(JSON.stringify({ optedOut: true }));
    await waitFor(() => {
      expect(control).toHaveAttribute('aria-checked', 'false');
    });
    expect(screen.getByText(/Turn off Store practice events to object/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute(
      'href',
      '/privacy',
    );
  });
});
