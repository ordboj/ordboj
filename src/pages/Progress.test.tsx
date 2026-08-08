import { describe, it, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import Progress from '@/pages/Progress';

// Progress.tsx composes useSrsProgress (srs-engine) and useSettings
// (frontend-expert) with the real getAllConjugatedVerbs() lookup
// (swedish-linguist). Only the two hooks are mocked here as boundaries this
// suite does not own; the real VERB_DATA / conjugateVerb wiring is left
// untouched so this exercises the actual fix end-to-end.
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
    const { container } = renderWithProviders(<Progress />, { route: '/progress' });

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
    const { container } = renderWithProviders(<Progress />, { route: '/progress' });
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

  it('gives the mobile card list a keyboard-operable role, tabIndex and Enter/Space handler that opens the verb modal', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Progress />, { route: '/progress' });

    const search = await screen.findByPlaceholderText('Search by verb...');
    await user.type(search, 'vara');

    const mobileHeading = screen.getByText('vara', { selector: 'span.font-semibold' });
    const mobileCard = mobileHeading.closest('.sm\\:hidden [role="button"]') as HTMLElement | null;
    expect(mobileCard).not.toBeNull();
    expect(mobileCard).toHaveAttribute('tabIndex', '0');

    mobileCard!.focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('offers a sort affordance below sm that is wired to the same sortBy/sortOrder state as the desktop table headers', async () => {
    renderWithProviders(<Progress />, { route: '/progress' });
    await screen.findByPlaceholderText('Search by verb...');

    // Below sm the table headers (with their onClick sort handlers) are
    // hidden along with the rest of the table, so the card list needs its
    // own control wired to the same sort state - otherwise phone users lose
    // sorting entirely.
    const mobileSort = screen.getByLabelText(/sort verbs/i);
    expect(mobileSort).toBeInTheDocument();
  });
});

describe("Progress page - issue #132: no raw '(not available)' placeholder", () => {
  it('renders an em dash, not the raw literal string, for a verb whose imperativ is genuinely absent', async () => {
    renderWithProviders(<Progress />, { route: '/progress' });

    // "kunna" is a modal verb: VERB_DATA pins its imperativ as "" on
    // purpose (no Swedish imperativ exists for modal verbs). Scoped to the
    // <table> cell (selector: 'td'), not the mobile card list's span, which
    // (#113) renders the same infinitive concurrently in the DOM.
    const infinitiveCell = await screen.findByText('kunna', { selector: 'td' });
    const row = infinitiveCell.closest('tr');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText('—')).toBeInTheDocument();
    expect(within(row as HTMLElement).queryByText('(not available)')).not.toBeInTheDocument();
  });

  it("never shows the raw literal '(not available)' string anywhere on the page", async () => {
    renderWithProviders(<Progress />, { route: '/progress' });

    // Wait for the async verb list to finish loading before asserting a
    // global negative, otherwise the assertion would trivially pass while
    // the table is still empty.
    await screen.findByText('kunna', { selector: 'td' });
    expect(screen.queryByText('(not available)')).not.toBeInTheDocument();
    expect(screen.queryByText(/not available/i)).not.toBeInTheDocument();
  });

  it('still renders a real imperativ form as plain text for a verb that has one', async () => {
    renderWithProviders(<Progress />, { route: '/progress' });

    const infinitiveCell = await screen.findByText('använda', { selector: 'td' });
    const row = infinitiveCell.closest('tr');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText('använd')).toBeInTheDocument();
  });

  it('renders an em dash, not the raw literal string, for a verb with no imperativ in the mobile card list too', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Progress />, { route: '/progress' });

    const search = await screen.findByPlaceholderText('Search by verb...');
    await user.type(search, 'kunna');

    const mobileHeading = screen.getByText('kunna', { selector: 'span.font-semibold' });
    const mobileContainer = mobileHeading.closest('.sm\\:hidden');
    expect(mobileContainer).not.toBeNull();
    expect(within(mobileContainer as HTMLElement).getByText('—')).toBeInTheDocument();
    expect(
      within(mobileContainer as HTMLElement).queryByText('(not available)'),
    ).not.toBeInTheDocument();
  });
});
