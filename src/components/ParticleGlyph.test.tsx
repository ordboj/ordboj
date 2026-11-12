import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  GLYPH_CYCLE_MS,
  GLYPH_DURATION_MS,
  GLYPH_LOOP_PAUSE_MS,
  GLYPH_MAX_TOTAL_MS,
  GLYPH_MOTION_END_MS,
  GLYPH_MOTION_LIMIT_MS,
  GLYPH_PLAY_COUNT,
  GLYPH_STAGGER_MS,
  GLYPH_START_DELAY_MS,
  ParticleGlyph,
  type ParticleGlyphName,
} from './ParticleGlyph';

const NAMES: ParticleGlyphName[] = [
  'upp',
  'ut',
  'in',
  'ner',
  'bort',
  'tillbaka',
  'fram',
  'hem',
  'ihop',
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
  vi.restoreAllMocks();
});

describe('ParticleGlyph rendering', () => {
  it.each(NAMES)('renders an aria-hidden SVG for "%s" (motion allowed)', (name) => {
    mockReducedMotion(false);
    const { container } = render(<ParticleGlyph name={name} />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  it.each(NAMES)('renders an aria-hidden SVG for "%s" (reduced motion)', (name) => {
    mockReducedMotion(true);
    const { container } = render(<ParticleGlyph name={name} />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  it('draws different geometry for different names', () => {
    mockReducedMotion(false);
    const markup = NAMES.map((n) => {
      const { container, unmount } = render(<ParticleGlyph name={n} />);
      const html = container.querySelector('svg')!.innerHTML;
      unmount();
      return html;
    });
    expect(new Set(markup).size).toBe(NAMES.length);
  });

  it('contains no text nodes inside the SVG', () => {
    mockReducedMotion(false);
    for (const name of NAMES) {
      const { container, unmount } = render(<ParticleGlyph name={name} />);
      const svg = container.querySelector('svg')!;
      expect(svg.querySelectorAll('text, tspan, title, desc')).toHaveLength(0);
      expect(svg.textContent).toBe('');
      unmount();
    }
  });

  it('uses no SMIL animation elements', () => {
    for (const reduce of [false, true]) {
      mockReducedMotion(reduce);
      for (const name of NAMES) {
        const { container, unmount } = render(<ParticleGlyph name={name} />);
        expect(
          container.querySelectorAll('animate, animateMotion, animateTransform, set'),
        ).toHaveLength(0);
        unmount();
      }
    }
  });
});

describe('ParticleGlyph with motion allowed', () => {
  it.each(NAMES)('exposes a replay button named for "%s"', (name) => {
    mockReducedMotion(false);
    render(<ParticleGlyph name={name} />);
    expect(screen.getByRole('button', { name: `Replay movement: ${name}` })).toBeInTheDocument();
  });

  it('gives the button a 44px (size-11) hit area and no autofocus', () => {
    mockReducedMotion(false);
    render(<ParticleGlyph name="upp" />);
    const button = screen.getByRole('button', { name: 'Replay movement: upp' });
    expect(button).toHaveClass('size-11');
    expect(button).not.toHaveAttribute('autofocus');
    expect(button).not.toHaveFocus();
    expect(document.body).toHaveFocus();
  });

  it('remounts the SVG on click and keeps the button', async () => {
    mockReducedMotion(false);
    const user = userEvent.setup();
    const { container } = render(<ParticleGlyph name="ut" />);
    const before = container.querySelector('svg');
    const button = screen.getByRole('button', { name: 'Replay movement: ut' });

    await user.click(button);

    const after = container.querySelector('svg');
    expect(after).not.toBeNull();
    expect(after).not.toBe(before);
    expect(before!.isConnected).toBe(false);
    expect(screen.getByRole('button', { name: 'Replay movement: ut' })).toBeInTheDocument();
    expect(after).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('ParticleGlyph with reduced motion', () => {
  it('renders no button and nothing focusable or button-like', () => {
    mockReducedMotion(true);
    const { container } = render(<ParticleGlyph name="in" />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(container.querySelector('button, [role="button"], [tabindex]')).toBeNull();
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('keeps the same 44px box as the motion variant', () => {
    mockReducedMotion(false);
    const motion = render(<ParticleGlyph name="ner" />);
    const motionBox = motion.container.firstElementChild as HTMLElement;
    expect(motionBox).toHaveClass('size-11');
    const motionSvgClass = motionBox.querySelector('svg')?.getAttribute('class');
    motion.unmount();

    mockReducedMotion(true);
    const reduced = render(<ParticleGlyph name="ner" />);
    const reducedBox = reduced.container.firstElementChild as HTMLElement;
    expect(reducedBox).toHaveClass('size-11');
    expect(reducedBox.querySelector('svg')?.getAttribute('class')).toBe(motionSvgClass);
  });
});

describe('ParticleGlyph without matchMedia', () => {
  it('does not crash and falls back to the animated variant', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: undefined,
    });
    const { container } = render(<ParticleGlyph name="bort" />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('button', { name: 'Replay movement: bort' })).toBeInTheDocument();
  });
});

describe('ParticleGlyph timing contract', () => {
  it('keeps delay + duration within the hard cap', () => {
    expect(GLYPH_START_DELAY_MS + GLYPH_DURATION_MS).toBeLessThanOrEqual(GLYPH_MAX_TOTAL_MS);
    expect(GLYPH_START_DELAY_MS + GLYPH_STAGGER_MS + GLYPH_DURATION_MS).toBeLessThanOrEqual(
      GLYPH_MAX_TOTAL_MS,
    );
    expect(GLYPH_MAX_TOTAL_MS).toBe(1500);
  });

  it('keeps stagger <= 100ms and duration within 600-900ms', () => {
    expect(GLYPH_STAGGER_MS).toBeLessThanOrEqual(100);
    expect(GLYPH_DURATION_MS).toBeGreaterThanOrEqual(600);
    expect(GLYPH_DURATION_MS).toBeLessThanOrEqual(900);
  });

  it.each(NAMES)('applies the exported constants as inline custom properties on "%s"', (name) => {
    mockReducedMotion(false);
    const { container } = render(<ParticleGlyph name={name} />);
    const mover = container.querySelector<SVGElement>('.particle-glyph-mover')!;
    expect(mover).not.toBeNull();
    expect(mover.style.getPropertyValue('--glyph-duration')).toBe(`${GLYPH_DURATION_MS}ms`);
    expect(mover.style.getPropertyValue('--glyph-delay')).toBe(`${GLYPH_START_DELAY_MS}ms`);
  });
});

describe('ParticleGlyph loop contract (decision H)', () => {
  it('moves 600-900 ms, within the 1.5 s cap, then rests 2000 ms; cycle is their sum', () => {
    expect(GLYPH_DURATION_MS).toBeGreaterThanOrEqual(600);
    expect(GLYPH_DURATION_MS).toBeLessThanOrEqual(900);
    expect(GLYPH_START_DELAY_MS + GLYPH_DURATION_MS).toBeLessThanOrEqual(GLYPH_MAX_TOTAL_MS);
    expect(GLYPH_LOOP_PAUSE_MS).toBe(2000);
    expect(GLYPH_CYCLE_MS).toBe(GLYPH_DURATION_MS + GLYPH_LOOP_PAUSE_MS);
  });

  it.each(NAMES)('sets --glyph-cycle and --glyph-duration from the constants on "%s"', (name) => {
    mockReducedMotion(false);
    const { container } = render(<ParticleGlyph name={name} />);
    const mover = container.querySelector<SVGElement>('.particle-glyph-mover')!;
    expect(mover.style.getPropertyValue('--glyph-cycle')).toBe(`${GLYPH_CYCLE_MS}ms`);
    expect(mover.style.getPropertyValue('--glyph-duration')).toBe(`${GLYPH_DURATION_MS}ms`);
  });

  const css = readFileSync(join(__dirname, '..', 'index.css'), 'utf8');

  it('keyframe movement percentage equals round(duration / cycle * 100, 3)', () => {
    const expected = Math.round((GLYPH_DURATION_MS / GLYPH_CYCLE_MS) * 100 * 1000) / 1000;
    const block = css.match(/@keyframes particle-glyph-move\s*\{[\s\S]*?\n\}/)![0];
    const percentages = Array.from(block.matchAll(/(\d+(?:\.\d+)?)%/g)).map((m) => Number(m[1]));
    expect(percentages).toContain(expected);
    expect(percentages).toContain(0);
    expect(percentages).toContain(100);
  });

  it('the mover animation plays var(--glyph-plays) times over var(--glyph-cycle), never infinite', () => {
    const rule = css.match(/\.particle-glyph-mover\s*\{[^}]*\}/)![0];
    expect(rule).toMatch(/animation:[^;]*var\(--glyph-cycle\)[^;]*var\(--glyph-plays\)\s*;/);
  });
});

// Human decision I (2026-11-11), docs/learning/2026-11-11-glyph-loop-auto-stop.md:
// two plays, all movement ends at 3400 ms, rest frame, tap replays.
describe('ParticleGlyph two-play rule (decision I)', () => {
  const css = readFileSync(join(__dirname, '..', 'index.css'), 'utf8');
  const glyphRule = css.match(/\.particle-glyph-mover\s*\{[^}]*\}/)![0];
  const pictureRule = css.match(/\.meaning-picture-mover\s*\{[^}]*\}/)![0];

  it('plays twice', () => {
    expect(GLYPH_PLAY_COUNT).toBe(2);
  });

  it('ends all movement at start delay + (plays - 1) cycles + one movement, which is 3400 ms', () => {
    expect(GLYPH_MOTION_END_MS).toBe(
      GLYPH_START_DELAY_MS + (GLYPH_PLAY_COUNT - 1) * GLYPH_CYCLE_MS + GLYPH_DURATION_MS,
    );
    expect(GLYPH_MOTION_END_MS).toBe(3400);
  });

  it('keeps automatic movement within the WCAG 2.2.2 limit of 5000 ms', () => {
    expect(GLYPH_MOTION_LIMIT_MS).toBe(5000);
    expect(GLYPH_MOTION_END_MS).toBeLessThanOrEqual(GLYPH_MOTION_LIMIT_MS);
    expect(GLYPH_MOTION_END_MS).toBeLessThanOrEqual(5000);
  });

  it.each(NAMES)('sets --glyph-plays to "2" on the mover of "%s"', (name) => {
    mockReducedMotion(false);
    const { container } = render(<ParticleGlyph name={name} />);
    const mover = container.querySelector<SVGElement>('.particle-glyph-mover')!;
    expect(mover.style.getPropertyValue('--glyph-plays')).toBe('2');
  });

  it('the glyph rule uses var(--glyph-plays) without a fallback and var(--glyph-cycle)', () => {
    expect(glyphRule).toContain('var(--glyph-plays)');
    expect(glyphRule).not.toMatch(/var\(--glyph-plays\s*,/);
    expect(glyphRule).toContain('var(--glyph-cycle)');
  });

  it('the picture rule sets animation-iteration-count: var(--glyph-plays)', () => {
    expect(pictureRule).toMatch(/animation-iteration-count:\s*var\(--glyph-plays\)\s*;/);
  });

  it('neither mover rule, nor any rule that animates them, says infinite', () => {
    expect(glyphRule).not.toMatch(/infinite/i);
    expect(pictureRule).not.toMatch(/infinite/i);
    // The picture's per-kind rules (sway, pulse, ...) carry the animation-name.
    const pictureRules = css.match(/\.meaning-picture-[a-z-]+\s*\{[^}]*\}/g) ?? [];
    expect(pictureRules.length).toBeGreaterThan(1);
    for (const rule of pictureRules) expect(rule).not.toMatch(/infinite/i);
  });

  it('sets no fill mode on either mover (the base style is the rest frame)', () => {
    for (const rule of [glyphRule, pictureRule]) {
      expect(rule).not.toMatch(/animation-fill-mode/);
      expect(rule).not.toMatch(/\b(forwards|both|backwards)\b/);
    }
  });

  it('has exactly one button, and nothing named Pause or Stop', () => {
    mockReducedMotion(false);
    const { container } = render(<ParticleGlyph name="upp" />);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(container.querySelectorAll('button, [role="button"]')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /pause|stop/i })).toBeNull();
    expect(container.querySelector('[aria-label*="ause" i], [aria-label*="top" i]')).toBeNull();
  });

  it('keeps the button name through a replay', async () => {
    mockReducedMotion(false);
    const user = userEvent.setup();
    render(<ParticleGlyph name="hem" />);
    await user.click(screen.getByRole('button', { name: 'Replay movement: hem' }));
    await user.click(screen.getByRole('button', { name: 'Replay movement: hem' }));
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button')).not.toHaveAttribute('aria-pressed');
  });

  it('does not remount the SVG on a re-render with the same props', () => {
    mockReducedMotion(false);
    const { container, rerender } = render(<ParticleGlyph name="ut" />);
    const before = container.querySelector('svg');
    const mover = container.querySelector('.particle-glyph-mover');
    rerender(<ParticleGlyph name="ut" />);
    expect(container.querySelector('svg')).toBe(before);
    expect(container.querySelector('.particle-glyph-mover')).toBe(mover);
  });
});

describe('ParticleGlyph fram geometry', () => {
  // Read from the rendered DOM: the constants are not exported.
  it('hides the mover start fully behind the cover and draws the cover on top', () => {
    mockReducedMotion(false);
    const { container } = render(<ParticleGlyph name="fram" />);
    const mover = container.querySelector<SVGCircleElement>('.particle-glyph-mover')!;
    const cover = container.querySelector<SVGRectElement>('svg rect')!;
    expect(cover).not.toBeNull();

    const startX =
      Number(mover.getAttribute('cx')) + parseFloat(mover.style.getPropertyValue('--glyph-from-x'));
    const startY =
      Number(mover.getAttribute('cy')) + parseFloat(mover.style.getPropertyValue('--glyph-from-y'));
    const r = Number(mover.getAttribute('r'));
    const x = Number(cover.getAttribute('x'));
    const y = Number(cover.getAttribute('y'));
    const w = Number(cover.getAttribute('width'));
    const h = Number(cover.getAttribute('height'));

    expect(startX).toBe(5);
    expect(r).toBe(2.5);
    expect(startX - r).toBeGreaterThanOrEqual(x);
    expect(startX + r).toBeLessThanOrEqual(x + w);
    expect(startY - r).toBeGreaterThanOrEqual(y);
    expect(startY + r).toBeLessThanOrEqual(y + h);
    // Painted after the mover, so it covers it.
    expect(mover.compareDocumentPosition(cover) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('ParticleGlyph isolation', () => {
  it('does not import verb/particle data (it is a pure presentational glyph)', () => {
    const source = readFileSync(join(__dirname, 'ParticleGlyph.tsx'), 'utf8');
    const imports = source.match(/^\s*import[^;]*;/gm) ?? [];
    expect(imports.length).toBeGreaterThan(0);
    for (const line of imports) {
      expect(line).not.toMatch(/@\/data|particleVerbs/);
    }
  });
});
