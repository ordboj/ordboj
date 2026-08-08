import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/renderWithProviders';
import { getStageBadge, StageBadge } from '@/components/StageBadge';

// Issue #227: getStageBadge was duplicated verbatim in VerbDetailsModal.tsx
// and Progress.tsx, each returning raw Tailwind palette classes
// (bg-orange-500 / bg-yellow-500 / bg-green-500). This suite pins the single
// shared helper's stage-boundary contract and the token classNames it must
// now return, so any regression to a duplicate or to a raw palette class is
// loud.
describe('getStageBadge - stage boundaries (issue #227)', () => {
  it('returns "New" with the bg-primary token at stage 0', () => {
    expect(getStageBadge(0)).toEqual({
      label: 'New',
      className: 'bg-primary text-primary-foreground',
    });
  });

  it('returns "Learning" with the stage-learning token at stages 1 and 2 (inclusive upper boundary)', () => {
    expect(getStageBadge(1)).toEqual({
      label: 'Learning',
      className: 'bg-stage-learning text-stage-learning-foreground',
    });
    expect(getStageBadge(2)).toEqual({
      label: 'Learning',
      className: 'bg-stage-learning text-stage-learning-foreground',
    });
  });

  it('returns "Reviewing" with the stage-reviewing token at stages 3 and 4 (inclusive upper boundary)', () => {
    expect(getStageBadge(3)).toEqual({
      label: 'Reviewing',
      className: 'bg-stage-reviewing text-stage-reviewing-foreground',
    });
    expect(getStageBadge(4)).toEqual({
      label: 'Reviewing',
      className: 'bg-stage-reviewing text-stage-reviewing-foreground',
    });
  });

  it('returns "Mastered" with the stage-mastered token at stage 5 and beyond', () => {
    expect(getStageBadge(5)).toEqual({
      label: 'Mastered',
      className: 'bg-stage-mastered text-stage-mastered-foreground',
    });
    expect(getStageBadge(10)).toEqual({
      label: 'Mastered',
      className: 'bg-stage-mastered text-stage-mastered-foreground',
    });
  });

  it('never returns a raw off-token Tailwind palette class for any stage 0-10', () => {
    const rawPaletteClasses = /\b(bg|text)-(purple|orange|yellow|green)-500\b/;
    for (let stage = 0; stage <= 10; stage++) {
      expect(getStageBadge(stage).className).not.toMatch(rawPaletteClasses);
    }
  });
});

describe('StageBadge component', () => {
  it('renders the label and applies the token className from getStageBadge', () => {
    renderWithProviders(<StageBadge stage={1} />);
    const badge = screen.getByText('Learning');
    expect(badge).toHaveClass('bg-stage-learning');
    expect(badge).toHaveClass('text-stage-learning-foreground');
    expect(badge).not.toHaveClass('bg-orange-500');
  });
});
