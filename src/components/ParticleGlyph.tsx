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
  // Leaves the room: starts inside, rests outside the doorway.
  ut: { rest: { x: 20, y: 12 }, from: { x: -12, y: 0 }, landmark: 'box' },
  // Enters the room: starts outside, rests inside.
  in: { rest: { x: 8, y: 12 }, from: { x: 12, y: 0 }, landmark: 'box' },
  // Rises away from the ground.
  upp: { rest: { x: 12, y: 5.5 }, from: { x: 0, y: 10.5 }, landmark: 'ground' },
  // Descends onto the ground.
  ner: { rest: { x: 12, y: 16 }, from: { x: 0, y: -10.5 }, landmark: 'ground' },
  // Moves away from a point.
  bort: { rest: { x: 20.5, y: 12 }, from: { x: -9, y: 0 }, landmark: 'point' },
  // Returns to a point: rests at least 2.5 units clear of the ring.
  tillbaka: { rest: { x: 13.5, y: 12 }, from: { x: 9.5, y: 0 }, landmark: 'point' },
};

const MOVER_RADIUS = 2.5;
const STROKE_WIDTH = 2;

// Direction cue, part of the rest frame. A chevron sits just behind the mover
// and points in the travel direction; three dots taper away behind it.
const CUE_STROKE_WIDTH = 1.5;
/** Distance from the mover centre to the chevron tip. */
const CHEVRON_TIP = 3.5;
const CHEVRON_ARM = 1.6;
const TRAIL: readonly { back: number; r: number; opacity: number }[] = [
  { back: 7, r: 1.1, opacity: 0.85 },
  { back: 8.9, r: 0.8, opacity: 0.6 },
  { back: 10.6, r: 0.5, opacity: 0.35 },
];
/** At this opacity the chevron has >= 3:1 contrast on card and background. */
const CUE_OPACITY = 0.85;

function Landmark({ kind }: { kind: GlyphGeometry['landmark'] }) {
  switch (kind) {
    case 'box':
      // A room open on the right: the doorway the mover passes through.
      return <path d="M13 6H4.5A1.5 1.5 0 0 0 3 7.5v9A1.5 1.5 0 0 0 4.5 18H13" />;
    case 'ground':
      return <line x1="3" y1="20" x2="21" y2="20" />;
    case 'point':
      return <circle cx="5" cy="12" r="2.5" />;
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function DirectionCue({ rest, from }: Pick<GlyphGeometry, 'rest' | 'from'>) {
  const len = Math.hypot(from.x, from.y);
  // Unit vector of travel (start to rest) and its perpendicular.
  const dx = -from.x / len;
  const dy = -from.y / len;
  const px = -dy;
  const py = dx;
  const at = (back: number, side = 0) => ({
    x: round2(rest.x - dx * back + px * side),
    y: round2(rest.y - dy * back + py * side),
  });
  const tip = at(CHEVRON_TIP);
  const armA = at(CHEVRON_TIP + CHEVRON_ARM, CHEVRON_ARM);
  const armB = at(CHEVRON_TIP + CHEVRON_ARM, -CHEVRON_ARM);
  return (
    <g className="text-primary">
      <path
        d={`M${armA.x} ${armA.y}L${tip.x} ${tip.y}L${armB.x} ${armB.y}`}
        stroke="currentColor"
        strokeWidth={CUE_STROKE_WIDTH}
        strokeOpacity={CUE_OPACITY}
      />
      {TRAIL.map(({ back, r, opacity }) => {
        const c = at(back);
        return (
          <circle
            key={back}
            cx={c.x}
            cy={c.y}
            r={r}
            fill="currentColor"
            stroke="none"
            fillOpacity={opacity}
          />
        );
      })}
    </g>
  );
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
      <DirectionCue rest={rest} from={from} />
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
