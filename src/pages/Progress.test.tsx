import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import Progress from '@/pages/Progress';
import { getAllConjugatedVerbs, type ConjugatedVerb } from '@/lib/verbs';

// Radix Select calls pointer-capture APIs jsdom does not implement. Without
// these, opening the difficulty list throws and the options never mount.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// ORD-68: first paint must mount a window of verb rows, not the whole
// corpus. The ceiling is a contract, independent of the page size the
// component chooses, and well under the real table (900+ verbs).
const INITIAL_ROW_BUDGET = 100;

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

function verbTable(container: HTMLElement): HTMLElement {
  const tableCard = container.querySelector('.hidden.sm\\:block');
  if (!(tableCard instanceof HTMLElement)) {
    throw new Error('desktop verb table not found');
  }
  return tableCard;
}

function verbTableRows(container: HTMLElement): HTMLTableRowElement[] {
  return Array.from(verbTable(container).querySelectorAll('tbody tr'));
}

function infinitiveOf(row: HTMLTableRowElement): string {
  return row.querySelector('td span[lang="sv"]')?.textContent ?? '';
}

function mobileVerbCards(container: HTMLElement): HTMLElement[] {
  const list = container.querySelector('.sm\\:hidden');
  if (!(list instanceof HTMLElement)) {
    throw new Error('mobile verb list not found');
  }
  return Array.from(list.querySelectorAll('[role="button"]'));
}

function levelThatFitsOutsideFirstPage(
  all: ConjugatedVerb[],
  initiallyVisible: Set<string>,
): { level: string; verbs: ConjugatedVerb[] } {
  const byLevel = new Map<string, ConjugatedVerb[]>();
  for (const verb of all) {
    const level = verb.cefr ?? '';
    const group = byLevel.get(level) ?? [];
    group.push(verb);
    byLevel.set(level, group);
  }

  const match = [...byLevel.entries()]
    .filter(([, verbs]) => verbs.length > 0 && verbs.length <= INITIAL_ROW_BUDGET)
    .find(([, verbs]) => verbs.some((verb) => !initiallyVisible.has(verb.infinitive)));

  if (!match) {
    throw new Error('expected a CEFR level with a verb outside the first rendered page');
  }

  return { level: match[0], verbs: match[1] };
}

describe('Progress page - bounded verb row rendering (ORD-68)', () => {
  it('renders only a bounded number of verb rows on first paint', async () => {
    const { container } = renderWithProviders(<Progress />, { route: '/progress' });
    await screen.findByRole('columnheader', { name: /verb/i });

    const all = await getAllConjugatedVerbs();
    expect(all.length).toBeGreaterThan(INITIAL_ROW_BUDGET * 2);

    const rows = verbTableRows(container);
    const cards = mobileVerbCards(container);

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(INITIAL_ROW_BUDGET);
    expect(rows.length).toBeLessThan(all.length);
    expect(cards.length).toBe(rows.length);

    // Totals stay on the full corpus. The mounted window is only a view.
    expect(
      screen.getByText(new RegExp(`You've mastered 0 / ${all.length} verbs`)),
    ).toBeInTheDocument();
    expect(screen.getByText(`Showing ${rows.length} of ${all.length} verbs`)).toBeInTheDocument();
  });

  it('loads another bounded batch when the learner asks for more', async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<Progress />, { route: '/progress' });
    await screen.findByRole('columnheader', { name: /verb/i });

    const before = verbTableRows(container).length;
    const all = await getAllConjugatedVerbs();
    const more = screen.getByRole('button', { name: /show more verbs/i });
    expect(more.tagName).toBe('BUTTON');

    more.focus();
    await user.keyboard('{Enter}');

    const afterRows = verbTableRows(container).length;
    expect(afterRows).toBeGreaterThan(before);
    expect(afterRows - before).toBeLessThanOrEqual(INITIAL_ROW_BUDGET);
    expect(afterRows).toBeLessThan(all.length);
    expect(mobileVerbCards(container).length).toBe(afterRows);
    expect(screen.getByText(`Showing ${afterRows} of ${all.length} verbs`)).toBeInTheDocument();
  });

  it('search and level filter still reach verbs that were not in the first batch', async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<Progress />, { route: '/progress' });
    await screen.findByRole('columnheader', { name: /verb/i });

    const initiallyVisible = new Set(verbTableRows(container).map(infinitiveOf));
    const all = await getAllConjugatedVerbs();
    const hidden = all.find((verb) => !initiallyVisible.has(verb.infinitive));
    expect(hidden).toBeDefined();
    if (!hidden) return;

    const search = screen.getByPlaceholderText('Search by verb...');
    await user.type(search, hidden.infinitive);

    const matches = await screen.findAllByRole('button', { name: hidden.infinitive });
    expect(matches.length).toBeGreaterThan(0);
    expect(verbTableRows(container).map(infinitiveOf)).toContain(hidden.infinitive);

    await user.clear(search);

    const { level, verbs } = levelThatFitsOutsideFirstPage(all, initiallyVisible);
    await user.click(screen.getByRole('combobox', { name: /^Difficulty/ }));
    await user.click(await screen.findByRole('option', { name: level }));

    const shown = verbTableRows(container).map(infinitiveOf);
    expect(shown).toHaveLength(verbs.length);
    expect(shown).toEqual(expect.arrayContaining(verbs.map((verb) => verb.infinitive)));
    expect(verbs.some((verb) => !initiallyVisible.has(verb.infinitive))).toBe(true);
    expect(
      screen.getByText(`Showing ${verbs.length} of ${verbs.length} verbs`),
    ).toBeInTheDocument();
    // The mastery total does not shrink when the table is filtered.
    expect(
      screen.getByText(new RegExp(`You've mastered 0 / ${all.length} verbs`)),
    ).toBeInTheDocument();
  });
});
