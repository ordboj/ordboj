import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import Progress from '@/pages/Progress';

// Progress.tsx composes useSrsProgress and useSettings (both srs-engine),
// mocked here as boundaries this suite does not own. getAllConjugatedVerbs()
// (swedish-linguist's real VERB_DATA) is left untouched.
const mocks = vi.hoisted(() => ({ srsStates: {} as Record<string, unknown> }));

vi.mock('@/hooks/useSrsProgress', () => ({
  useSrsProgress: () => ({ srsStates: mocks.srsStates }),
}));

vi.mock('@/hooks/useSettings', () => ({
  useSettings: () => ({
    settings: { cefrLevels: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'], muteAudio: true },
    updateSettings: vi.fn(),
  }),
}));

beforeEach(() => {
  mocks.srsStates = {};
});

// Issue #110: sortable TableHead cells must expose aria-sort and be
// keyboard-toggleable, not just clickable.
describe('Progress page - sortable headers expose aria-sort and toggle via keyboard (issue #110)', () => {
  it('marks the default-sorted Verb column ascending and the untouched Difficulty column none', async () => {
    renderWithProviders(<Progress />, { route: '/progress' });

    const verbHeader = await screen.findByRole('button', { name: /verb/i });
    const difficultyHeader = screen.getByRole('button', { name: /difficulty/i });

    expect(verbHeader).toHaveAttribute('aria-sort', 'ascending');
    expect(difficultyHeader).toHaveAttribute('aria-sort', 'none');
  });

  it('flips the Verb column to descending when Enter is pressed on the focused header', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Progress />, { route: '/progress' });

    const verbHeader = await screen.findByRole('button', { name: /verb/i });
    expect(verbHeader).toHaveAttribute('aria-sort', 'ascending');

    verbHeader.focus();
    await user.keyboard('{Enter}');

    expect(verbHeader).toHaveAttribute('aria-sort', 'descending');
  });

  it('switches sort to the Difficulty column via the Space key, resetting Verb to none', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Progress />, { route: '/progress' });

    const verbHeader = await screen.findByRole('button', { name: /verb/i });
    const difficultyHeader = screen.getByRole('button', { name: /difficulty/i });

    difficultyHeader.focus();
    await user.keyboard(' ');

    expect(difficultyHeader).toHaveAttribute('aria-sort', 'ascending');
    expect(verbHeader).toHaveAttribute('aria-sort', 'none');
  });
});

// Issue #110: a TableRow with an onClick that opens the details modal must
// be reachable and operable without a mouse.
describe('Progress page - verb rows are keyboard-accessible (issue #110)', () => {
  it('exposes each row as a focusable role=button naming the verb it opens', async () => {
    renderWithProviders(<Progress />, { route: '/progress' });

    const rows = await screen.findAllByRole('button', { name: /view details for/i });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toHaveAttribute('tabIndex', '0');
  });

  it('opens the verb details modal when Enter is pressed on a focused row', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Progress />, { route: '/progress' });

    const rows = await screen.findAllByRole('button', { name: /view details for/i });
    const firstRow = rows[0];
    const verbName = firstRow.getAttribute('aria-label')!.replace('View details for ', '');

    firstRow.focus();
    await user.keyboard('{Enter}');

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(verbName);
  });

  it('opens the verb details modal when Space is pressed on a focused row', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Progress />, { route: '/progress' });

    const rows = await screen.findAllByRole('button', { name: /view details for/i });
    const firstRow = rows[0];

    firstRow.focus();
    await user.keyboard(' ');

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});
