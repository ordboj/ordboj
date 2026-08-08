import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import Progress from '@/pages/Progress';

// Progress.tsx composes useSrsProgress and useSettings (srs-engine). Both are
// mocked here as boundaries this suite does not own. getAllConjugatedVerbs()
// (swedish-linguist) is left real, so the verb data rendered below is the
// actual shipped VERB_DATA - "vara" is a stable fixture used elsewhere in
// this suite (presens "är", preteritum "var", supinum "varit").
vi.mock('@/hooks/useSrsProgress', () => ({
  useSrsProgress: () => ({
    srsStates: {},
  }),
}));

vi.mock('@/hooks/useSettings', () => ({
  useSettings: () => ({
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

beforeEach(() => {
  vi.clearAllMocks();
});

// Finds the nearest ancestor (or self) carrying both of the given Tailwind
// utility classes, walking up from a starting element. Avoids CSS-selector
// escaping headaches with classes that contain a literal ":" (e.g. "md:hidden").
function closestWithClasses(start: Element | null, ...classes: string[]): HTMLElement | null {
  let el = start as HTMLElement | null;
  while (el) {
    if (classes.every((c) => el!.classList.contains(c))) return el;
    el = el.parentElement;
  }
  return null;
}

describe('Progress page - responsive verb list (issue #113)', () => {
  it('renders a stacked mobile card list (md:hidden) in addition to the table, both carrying the same verb data', async () => {
    const { container } = renderWithProviders(<Progress />, { route: '/progress' });

    // Wait for the async getAllConjugatedVerbs() load to finish.
    await screen.findByText(/Your Progress/i);

    const mobileContainer = Array.from(container.querySelectorAll('div')).find((d) =>
      d.classList.contains('md:hidden'),
    );
    expect(mobileContainer).toBeTruthy();

    const varaCard = within(mobileContainer as HTMLElement)
      .getAllByRole('button')
      .find((b) => b.textContent?.includes('vara'));
    expect(varaCard).toBeDefined();
    expect(varaCard!.textContent).toContain('Presens:');
    expect(varaCard!.textContent).toContain('är');
    expect(varaCard!.textContent).toContain('Preteritum:');
    expect(varaCard!.textContent).toContain('var');
    expect(varaCard!.textContent).toContain('Supinum:');
    expect(varaCard!.textContent).toContain('varit');
  });

  it('keeps the fixed-height ScrollArea table but hides it below the md breakpoint (hidden md:block), instead of always showing an unreadable 7-column table', async () => {
    const { container } = renderWithProviders(<Progress />, { route: '/progress' });

    await screen.findByText(/Your Progress/i);

    const table = container.querySelector('table');
    expect(table).toBeTruthy();

    const tableCard = closestWithClasses(table, 'hidden', 'md:block');
    expect(tableCard).not.toBeNull();
  });

  it('opens the verb details modal from a tap on a mobile card, same as a click on a desktop table row', async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<Progress />, { route: '/progress' });

    await screen.findByText(/Your Progress/i);

    const mobileContainer = Array.from(container.querySelectorAll('div')).find((d) =>
      d.classList.contains('md:hidden'),
    ) as HTMLElement;
    const varaCard = within(mobileContainer)
      .getAllByRole('button')
      .find((b) => b.textContent?.includes('vara'))!;

    await user.click(varaCard);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getAllByText('vara').length).toBeGreaterThan(0);
  });
});
