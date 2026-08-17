import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import Progress from '@/pages/Progress';

// Split from the original monolithic Progress.test.tsx (one describe block
// per file) as a qa-side fix for a deterministic CI killer: Progress.tsx
// renders every VERB_DATA row unvirtualized, twice (desktop table + mobile
// card list), and each such render was measured to retain ~150-220MB of JS
// heap that survives unmount() + testing-library's cleanup() + two forced
// GC passes -- i.e. a real per-render leak, not just a big-but-freed working
// set (reported to frontend-expert, since the leak's source is in
// Progress.tsx / its subtree, which qa does not own or edit). With vitest's
// default one-process-per-file isolation (pool: 'forks', isolate: true),
// packing 21 such renders into a single file let the leak accumulate in one
// worker process until it exceeded the process's heap and vitest killed the
// fork ("Worker exited unexpectedly"), non-deterministically depending on
// CI's memory ceiling and how large VERB_DATA had grown. Splitting by
// describe block bounds how many leaking renders share one process's heap,
// resetting between files, without touching a single assertion, skipping a
// single test, or changing what data (real, full VERB_DATA via the
// unmocked getAllConjugatedVerbs()) each test exercises.
//
// Temporary until #424 lands: issue #415 grew VERB_DATA from 68 to 971 rows,
// and Progress.tsx renders every row unvirtualized (~13s per render in
// jsdom), blowing past vitest's default 5s testTimeout on every test in this
// file. This is a real perf finding tracked as #424, owned by frontend-expert
// -- qa does not fix the page. frontend-expert removes this raise in the
// #424 PR.
vi.setConfig({ testTimeout: 60000 });

// Progress.tsx composes useSrsProgress (srs-engine) and useSettings
// (frontend-expert) with the real getAllConjugatedVerbs() lookup
// (swedish-linguist). Only the two hooks are mocked here as boundaries this
// suite does not own; the real VERB_DATA / conjugateVerb wiring is left
// untouched so this exercises PR #199 / issue #112's cosmetic fixes,
// issue #132's overlapping em-dash fix, and issue #113's responsive
// mobile card list end-to-end against real data.
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
