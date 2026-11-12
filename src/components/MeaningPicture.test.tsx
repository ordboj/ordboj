import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MeaningPicture } from '@/components/MeaningPicture';
import {
  GLYPH_CYCLE_MS,
  GLYPH_DURATION_MS,
  GLYPH_LOOP_PAUSE_MS,
  GLYPH_MAX_TOTAL_MS,
  GLYPH_MOTION_END_MS,
  GLYPH_MOTION_LIMIT_MS,
  GLYPH_PLAY_COUNT,
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

// Human decision I (2026-11-11): the picture plays twice, then rests, like the glyph.
describe('MeaningPicture two-play rule (decision I)', () => {
  it.each(IDS)('"%s" mover carries --glyph-plays = "2"', (id) => {
    mockReducedMotion(false);
    const { container } = render(<MeaningPicture id={id} />);
    const mover = container.querySelector<SVGElement>('.meaning-picture-mover')!;
    expect(mover.style.getPropertyValue('--glyph-plays')).toBe('2');
    expect(mover.style.getPropertyValue('--glyph-plays')).toBe(String(GLYPH_PLAY_COUNT));
  });

  it('ends all movement within 3400 ms, inside the 5000 ms limit', () => {
    expect(GLYPH_MOTION_END_MS).toBe(3400);
    expect(GLYPH_MOTION_END_MS).toBeLessThanOrEqual(GLYPH_MOTION_LIMIT_MS);
  });

  const css = readFileSync(join(__dirname, '..', 'index.css'), 'utf8');
  const rule = css.match(/\.meaning-picture-mover\s*\{[^}]*\}/)![0];

  it('the stylesheet repeats the picture var(--glyph-plays) times, never infinite, no fill mode', () => {
    expect(rule).toMatch(/animation-iteration-count:\s*var\(--glyph-plays\)\s*;/);
    expect(rule).not.toMatch(/infinite/i);
    expect(rule).not.toMatch(/animation-fill-mode|\b(forwards|both|backwards)\b/);
  });

  it.each(IDS)('"%s" has exactly one button, named Replay picture, nothing Pause or Stop', (id) => {
    mockReducedMotion(false);
    render(<MeaningPicture id={id} />);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Replay picture' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /pause|stop/i })).toBeNull();
  });

  it('keeps the button and its name through a replay', async () => {
    mockReducedMotion(false);
    const user = userEvent.setup();
    render(<MeaningPicture id="printer" />);
    await user.click(screen.getByRole('button', { name: 'Replay picture' }));
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Replay picture' })).toHaveClass('size-11');
  });

  it('does not remount the SVG on a re-render with the same props', () => {
    mockReducedMotion(false);
    const { container, rerender } = render(<MeaningPicture id="handcuffs" />);
    const before = container.querySelector('svg');
    rerender(<MeaningPicture id="handcuffs" />);
    expect(container.querySelector('svg')).toBe(before);
  });
});
