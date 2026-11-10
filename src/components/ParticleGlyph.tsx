import { useState, type CSSProperties } from 'react';
import { cn } from '@/lib/utils';

export type ParticleGlyphName = 'upp' | 'ut' | 'in' | 'ner' | 'bort' | 'tillbaka';

/** Main animation duration (learning decision 2026-11-10, rule 4). */
export const GLYPH_DURATION_MS = 700;
/** Start delay after mount. */
export const GLYPH_START_DELAY_MS = 0;
/**
 * Stagger of a secondary element. The glyphs have one mover and a static
 * landmark, so no element is staggered; the cap (<= 100 ms) is kept here so
 * a test can assert the full sum.
 */
export const GLYPH_STAGGER_MS = 0;
/** Hard cap on delay + duration of every animated element. */
export const GLYPH_MAX_TOTAL_MS = 1500;

type GlyphVars = CSSProperties & Record<`--${string}`, string>;

interface GlyphGeometry {
  /** Mover centre in the rest frame (the end of the path), viewBox units. */
  rest: { x: number; y: number };
  /** Offset of the start frame from the rest frame, viewBox units. */
  from: { x: number; y: number };
  landmark: 'box' | 'ground' | 'point';
}

// Shared square viewBox 0 0 24 24. The mover's path relative to the landmark
// is the meaning.
const GLYPHS: Record<ParticleGlyphName, GlyphGeometry> = {
  // Leaves the box: starts inside, rests outside.
  ut: { rest: { x: 19.5, y: 12 }, from: { x: -11, y: 0 }, landmark: 'box' },
  // Enters the box: starts outside, rests inside.
  in: { rest: { x: 8.5, y: 12 }, from: { x: 11, y: 0 }, landmark: 'box' },
  // Rises away from the ground.
  upp: { rest: { x: 12, y: 5.5 }, from: { x: 0, y: 10.5 }, landmark: 'ground' },
  // Descends onto the ground.
  ner: { rest: { x: 12, y: 16 }, from: { x: 0, y: -10.5 }, landmark: 'ground' },
  // Moves away from a point.
  bort: { rest: { x: 19.5, y: 12 }, from: { x: -7, y: 0 }, landmark: 'point' },
  // Returns to a point.
  tillbaka: { rest: { x: 12.5, y: 12 }, from: { x: 7, y: 0 }, landmark: 'point' },
};

const MOVER_RADIUS = 2.5;
const STROKE_WIDTH = 2;

function Landmark({ kind }: { kind: GlyphGeometry['landmark'] }) {
  switch (kind) {
    case 'box':
      return <rect x="3" y="6" width="11" height="12" rx="1.5" />;
    case 'ground':
      return <line x1="3" y1="20" x2="21" y2="20" />;
    case 'point':
      return <circle cx="5" cy="12" r="2.5" />;
  }
}

function readsReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

interface ParticleGlyphProps {
  name: ParticleGlyphName;
  className?: string;
}

export function ParticleGlyph({ name, className }: ParticleGlyphProps) {
  // Read once at mount, as ConfettiEffect does.
  const [reducedMotion] = useState(readsReducedMotion);
  // Bumping the key remounts the SVG, which restarts the CSS animation.
  const [playCount, setPlayCount] = useState(0);

  const { rest, from, landmark } = GLYPHS[name];

  const moverVars: GlyphVars = {
    '--glyph-duration': `${GLYPH_DURATION_MS}ms`,
    '--glyph-delay': `${GLYPH_START_DELAY_MS}ms`,
    '--glyph-from-x': `${from.x}px`,
    '--glyph-from-y': `${from.y}px`,
  };

  const svg = (
    <svg
      key={playCount}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className="size-7 overflow-visible"
      fill="none"
      strokeWidth={STROKE_WIDTH}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <g className="text-muted-foreground" stroke="currentColor">
        <Landmark kind={landmark} />
      </g>
      {/* Faint path trace: part of the rest frame. */}
      <line
        className="text-primary"
        stroke="currentColor"
        strokeOpacity={0.3}
        strokeDasharray="0.1 4"
        x1={rest.x + from.x}
        y1={rest.y + from.y}
        x2={rest.x}
        y2={rest.y}
      />
      <circle
        className="particle-glyph-mover text-primary"
        fill="currentColor"
        stroke="none"
        cx={rest.x}
        cy={rest.y}
        r={MOVER_RADIUS}
        style={moverVars}
      />
    </svg>
  );

  const box = 'inline-flex size-11 shrink-0 items-center justify-center rounded-full';

  if (reducedMotion) {
    return (
      <span aria-hidden="true" className={cn(box, className)}>
        {svg}
      </span>
    );
  }

  return (
    <button
      type="button"
      aria-label={`Replay movement: ${name}`}
      onClick={() => setPlayCount((n) => n + 1)}
      className={cn(
        box,
        'cursor-pointer touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        className,
      )}
    >
      {svg}
    </button>
  );
}
