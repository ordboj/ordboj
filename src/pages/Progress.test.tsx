import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import ProgressPage from '@/pages/Progress';

// Progress.tsx composes useSrsProgress and useSettings (srs-engine). Both
// are mocked here as boundaries this suite does not own. getAllConjugatedVerbs
// (swedish-linguist) is left real so the page's actual verb data flows
// through, the same way Practice.test.tsx leaves conjugateVerb real.
vi.mock('@/hooks/useSrsProgress', () => ({
  useSrsProgress: () => ({
    srsStates: {},
  }),
}));

vi.mock('@/hooks/useSettings', () => ({
  useSettings: () => ({
    isLoading: false,
    settings: {
      practiceMode: 'typing',
      showExamples: false,
      autoplayAudio: false,
      muteAudio: true,
      dailyGoal: 20,
      cefrLevels: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
    },
    updateSettings: vi.fn(),
  }),
}));

describe('Progress page - responsive table at 360px (#113)', () => {
  it('renders a desktop table (hidden below sm) and a separate mobile card list (hidden at sm+) with the same verb data', async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<ProgressPage />, { route: '/progress' });

    // Narrow to the one verb we can assert on precisely ("vara" is the only
    // infinitive containing that substring in VERB_DATA).
    const search = await screen.findByPlaceholderText('Search by verb...');
    await user.type(search, 'vara');

    // Desktop table: a real <table> row for "vara" with each conjugated form
    // as its own cell.
    const table = container.querySelector('table');
    expect(table).not.toBeNull();
    expect(table).toHaveTextContent('vara');
    expect(table).toHaveTextContent('är');
    expect(table).toHaveTextContent('varit');

    // The table's Card ancestor must carry both "hidden" (default: not shown
    // below sm) and "sm:block" (shown at sm+) - a 7-column table cannot stay
    // readable at 360px width, so it must not be the layout used there.
    const tableCard = table!.closest('.hidden');
    expect(tableCard).not.toBeNull();
    expect(tableCard!.className.split(/\s+/)).toEqual(
      expect.arrayContaining(['hidden', 'sm:block']),
    );

    // Mobile card list: same verb's data rendered as a card, in a container
    // hidden at sm+ (shown only below sm).
    const mobileHeading = screen.getByText('vara', { selector: 'span.font-semibold' });
    expect(mobileHeading).toBeInTheDocument();
    const mobileContainer = mobileHeading.closest('.sm\\:hidden');
    expect(mobileContainer).not.toBeNull();
    expect(mobileContainer!.className.split(/\s+/)).toContain('sm:hidden');
    expect(mobileContainer).toHaveTextContent('är');
    expect(mobileContainer).toHaveTextContent('varit');

    // Regression: before #113 there was only the table, so a 360px-wide
    // screen had no readable alternative at all. Both layouts must coexist
    // in the DOM (CSS breakpoints decide which is visible).
    expect(tableCard).not.toBe(mobileContainer);
  });

  it('gives the results table a bounded, viewport-relative scroll height instead of a fixed 600px', async () => {
    const { container } = renderWithProviders(<ProgressPage />, { route: '/progress' });
    await screen.findByPlaceholderText('Search by verb...');

    // Regression: a bare h-[600px] ScrollArea does not shrink on short
    // viewports (e.g. keyboard open), pushing content off-screen. The fix
    // caps it at the smaller of 600px and 70% of the dynamic viewport
    // height.
    const scrollArea = container.querySelector('[class*="70dvh"]');
    expect(scrollArea).not.toBeNull();
    expect(scrollArea!.className).toContain('h-[min(600px,70dvh)]');

    // The old unbounded fixed-height class must be gone, not just
    // supplemented.
    const oldFixedHeight = container.querySelector('.h-\\[600px\\]');
    expect(oldFixedHeight).toBeNull();
  });
});
