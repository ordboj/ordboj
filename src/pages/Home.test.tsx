import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/renderWithProviders';
import Home from '@/pages/Home';

// Home.tsx composes useSrsProgress and useSettings (srs-engine owned).
// Mocked here as boundaries this suite doesn't own, so the "due count > 0"
// branch (Home.tsx ~89-102) can be exercised deterministically. That branch
// used to render <div> elements as direct children of shadcn's
// CardDescription, which renders a <p> — invalid HTML that React flags via
// a validateDOMNesting console.error (issue #112, AC #1).
const mocks = vi.hoisted(() => ({
  dueItems: [] as Array<{ verbId: string; infinitive: string; form: string; itemId: string }>,
}));

vi.mock('@/hooks/useSrsProgress', () => ({
  useSrsProgress: () => ({
    isLoading: false,
    getDueItems: async () => mocks.dueItems,
  }),
}));

vi.mock('@/hooks/useSettings', () => ({
  useSettings: () => ({
    isLoading: false,
    settings: { cefrLevels: ['A1'], muteAudio: false },
    updateSettings: vi.fn(),
  }),
}));

beforeEach(() => {
  mocks.dueItems = [
    { verbId: '1', infinitive: 'vara', form: 'presens', itemId: '1-presens' },
    { verbId: '1', infinitive: 'vara', form: 'preteritum', itemId: '1-preteritum' },
  ];
});

describe('Home - due-count DOM nesting (regression, issue #112 AC #1)', () => {
  it('does not log a validateDOMNesting <div>-in-<p> warning when cards are due', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    renderWithProviders(<Home />);

    // Wait for the async getDueItems() effect to resolve and the
    // due-count branch (the one that used to nest divs) to render.
    const dueMessage = await screen.findByText(/conjugations due for review/i);

    // React logs this with a %s-templated format string as args[0] plus the
    // interpolated tag names as separate args (e.g. args = [format, '<div>',
    // 'p', ...]) — console.error never does the substitution itself, so
    // "<p>" never appears as a literal substring anywhere in the raw args
    // (the ancestor tag arg is the bare name "p", not "<p>"). A check for
    // the literal substring "<p>" — on one arg or joined across all of
    // them — passes vacuously whether or not the warning fired. Check the
    // format string and tag-name args separately instead.
    const nestingWarning = errorSpy.mock.calls.find(([message, ...rest]) => {
      return (
        typeof message === 'string' &&
        message.includes('validateDOMNesting') &&
        rest.includes('<div>') &&
        rest.includes('p')
      );
    });
    expect(nestingWarning).toBeUndefined();

    // The due-count text must not be nested inside a <p> element (i.e. it
    // was pulled out of CardDescription's <p> into a plain <div>).
    expect(dueMessage.closest('p')).toBeNull();

    errorSpy.mockRestore();
  });
});
