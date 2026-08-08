import { describe, it, expect, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import Progress from '@/pages/Progress';

// Progress.tsx reads real localStorage (via useSrsProgress/useSettings) and
// the real VERB_DATA table (via getAllConjugatedVerbs, swedish-linguist
// owned). This suite exercises PR #199 / issue #112's cosmetic fixes against
// that real data rather than re-mocking boundaries this page doesn't own.
beforeEach(() => {
  localStorage.clear();
});

describe('Progress page - header emoji fix (AC #2)', () => {
  it("renders the page title without the literal flag emoji or 'SE' text, using an icon instead", async () => {
    renderWithProviders(<Progress />, { route: '/progress' });

    const heading = await screen.findByRole('heading', { name: /Progress & Review/i });
    // The Windows-Chrome-hostile flag emoji (U+1F1F8 U+1F1EA "🇸🇪") must be gone.
    expect(heading.textContent).not.toMatch(/\u{1F1F8}\u{1F1EA}/u);
    // And it must not have been replaced by a literal "SE" text fallback.
    expect(heading.textContent?.trim()).toBe('Progress & Review');
    // An icon (lucide Trophy) renders in its place.
    expect(heading.querySelector('svg')).toBeInTheDocument();
  });
});

describe("Progress page - 'New' stage badge color token (AC #4)", () => {
  it('renders the New badge using the bg-primary token, not the off-palette bg-purple-500', async () => {
    renderWithProviders(<Progress />, { route: '/progress' });

    // Every verb starts at stage 0 ("New") with a clean localStorage.
    const newBadges = await screen.findAllByText('New');
    expect(newBadges.length).toBeGreaterThan(0);
    for (const badge of newBadges) {
      expect(badge).toHaveClass('bg-primary');
      expect(badge).not.toHaveClass('bg-purple-500');
    }
  });
});

describe('Progress page - Imperativ placeholder (AC #3)', () => {
  it("renders an em-dash instead of raw '(not available)' text for a verb with no imperativ", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Progress />, { route: '/progress' });

    const searchInput = await screen.findByPlaceholderText('Search by verb...');
    // "kunna" has no attested imperativ in VERB_DATA (imperativ: "").
    await user.type(searchInput, 'kunna');

    const row = await screen.findByText('kunna').then((el) => el.closest('tr') as HTMLElement);
    expect(within(row).getByText('—')).toBeInTheDocument();
    expect(within(row).queryByText('(not available)')).not.toBeInTheDocument();
  });
});

describe("Progress page - lang='sv' on inline Swedish word display (AC #5)", () => {
  it("wraps the verb infinitive cell in a lang='sv' span", async () => {
    renderWithProviders(<Progress />, { route: '/progress' });

    const infinitiveCell = await screen.findByText('kunna');
    expect(infinitiveCell).toHaveAttribute('lang', 'sv');
  });
});
