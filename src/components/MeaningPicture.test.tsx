import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MeaningPicture } from '@/components/MeaningPicture';
import {
  GLYPH_CYCLE_MS,
  GLYPH_DURATION_MS,
  GLYPH_LOOP_PAUSE_MS,
  GLYPH_MAX_TOTAL_MS,
  GLYPH_START_DELAY_MS,
} from '@/components/ParticleGlyph';
import type { MeaningPictureId } from '@/lib/particleVerbs';

// ORD-134: the seven human-approved meaning pictures.
const IDS: MeaningPictureId[] = [
  'white-flag',
  'printer',
  'warning-triangle',
  'car-collision',
  'snapping-rod',
  'overtaking-car',
  'handcuffs',
];

const originalMatchMedia = window.matchMedia;

function mockReducedMotion(reduce: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: reduce && query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
}

afterEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: originalMatchMedia,
  });
});

describe('MeaningPicture rendering', () => {
  it.each(IDS)('renders an svg tagged data-meaning-picture="%s"', (id) => {
    mockReducedMotion(false);
    const { container } = render(<MeaningPicture id={id} />);
    const svg = container.querySelector(`svg[data-meaning-picture="${id}"]`);
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelectorAll('svg')).toHaveLength(1);
    expect(container.querySelectorAll('.meaning-picture-mover')).toHaveLength(1);
  });
});

describe('MeaningPicture motion preference', () => {
  it.each(IDS)('normal motion: "%s" is a Replay picture button', (id) => {
    mockReducedMotion(false);
    const { container } = render(<MeaningPicture id={id} />);
    const button = screen.getByRole('button', { name: 'Replay picture' });
    expect(button).toHaveClass('size-11');
    expect(button).toContainElement(container.querySelector('svg'));
  });

  it.each(IDS)('reduced motion: "%s" is a non-interactive aria-hidden span', (id) => {
    mockReducedMotion(true);
    const { container } = render(<MeaningPicture id={id} />);
    expect(screen.queryByRole('button')).toBeNull();
    const svg = container.querySelector(`svg[data-meaning-picture="${id}"]`)!;
    expect(svg).not.toBeNull();
    const wrapper = svg.parentElement!;
    expect(wrapper.tagName).toBe('SPAN');
    expect(wrapper).toHaveAttribute('aria-hidden', 'true');
  });

  it('clicking replay remounts the svg, restarting the animation', async () => {
    mockReducedMotion(false);
    const user = userEvent.setup();
    const { container } = render(<MeaningPicture id="white-flag" />);
    const before = container.querySelector('svg')!;
    await user.click(screen.getByRole('button', { name: 'Replay picture' }));
    const after = container.querySelector('svg')!;
    expect(after).not.toBe(before);
    expect(before.isConnected).toBe(false);
    expect(after).toHaveAttribute('data-meaning-picture', 'white-flag');
    expect(container.querySelectorAll('svg')).toHaveLength(1);
  });
});

describe('MeaningPicture timing contract (shared with ParticleGlyph)', () => {
  it('uses the glyph cycle: movement within the 1500 ms cap, then 2000 ms rest', () => {
    expect(GLYPH_MAX_TOTAL_MS).toBe(1500);
    expect(GLYPH_START_DELAY_MS + GLYPH_DURATION_MS).toBeLessThanOrEqual(GLYPH_MAX_TOTAL_MS);
    expect(GLYPH_LOOP_PAUSE_MS).toBe(2000);
    expect(GLYPH_CYCLE_MS).toBe(GLYPH_DURATION_MS + GLYPH_LOOP_PAUSE_MS);
  });

  it.each(IDS)('"%s" mover carries --glyph-cycle = GLYPH_CYCLE_MS', (id) => {
    mockReducedMotion(false);
    const { container } = render(<MeaningPicture id={id} />);
    const mover = container.querySelector<SVGElement>('.meaning-picture-mover')!;
    expect(mover.style.getPropertyValue('--glyph-cycle')).toBe(`${GLYPH_CYCLE_MS}ms`);
  });
});
