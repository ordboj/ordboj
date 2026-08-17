import { describe, it, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import Progress from '@/pages/Progress';

// Split from the original monolithic Progress.test.tsx (one describe block
// per file) as a qa-side fix for a deterministic CI killer - see the header
// comment in Progress.responsive.test.tsx for the full rationale (per-render
// heap that survives unmount + cleanup() + forced GC, bounded here by
// keeping each file's render count low so vitest's per-file process
// isolation resets it between files).
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
// untouched so this exercises issue #110's keyboard-activatable row button
// end-to-end against real data.
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

// Issue #110 AC: the verb row opens the details modal via a real, focusable
// <button> in its first cell (native keyboard semantics), not a custom
// role="button" TableRow with a hand-rolled onKeyDown.
describe('Progress page - verb row opens the details modal by keyboard (issue #110 AC)', () => {
  it('opens the VerbDetailsModal for "kunna" when its row button is activated by keyboard Enter', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Progress />, { route: '/progress' });

    const button = await screen.findByRole('button', { name: 'kunna' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // Real keyboard activation (see keypress.js note above), not a click
    // stand-in: this is what proves the button is keyboard-reachable, which
    // is the actual issue #110 AC.
    button.focus();
    await user.keyboard('{Enter}');

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getAllByText('kunna').length).toBeGreaterThan(0);
  });

  it('opens the VerbDetailsModal when its row button is activated by keyboard Space', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Progress />, { route: '/progress' });

    const button = await screen.findByRole('button', { name: 'kunna' });
    button.focus();
    await user.keyboard(' ');

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('does not open the modal on an unrelated key (e.g. Tab) and leaves the row button focusable', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Progress />, { route: '/progress' });

    const button = await screen.findByRole('button', { name: 'kunna' });
    button.focus();
    await user.keyboard('{Tab}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // A native <button> needs no tabIndex/role/aria-label wiring to be
    // reachable; pin that contract so a future regression back to a
    // non-native, role="button" element is caught (see next describe block).
    expect(button.tagName).toBe('BUTTON');
    expect(button).toHaveAttribute('type', 'button');
  });

  it('renders the row button at a 44x44 minimum touch target, not height-only', async () => {
    renderWithProviders(<Progress />, { route: '/progress' });
    const button = await screen.findByRole('button', { name: 'kunna' });
    expect(button).toHaveClass('min-h-11');
    expect(button).toHaveClass('min-w-11');
  });
});
