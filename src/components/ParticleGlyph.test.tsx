import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  GLYPH_DURATION_MS,
  GLYPH_MAX_TOTAL_MS,
  GLYPH_STAGGER_MS,
  GLYPH_START_DELAY_MS,
  ParticleGlyph,
  type ParticleGlyphName,
} from './ParticleGlyph';

const NAMES: ParticleGlyphName[] = ['upp', 'ut', 'in', 'ner', 'bort', 'tillbaka'];

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
