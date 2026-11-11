import { useState, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { GLYPH_CYCLE_MS } from '@/components/ParticleGlyph';
import type { MeaningPictureId } from '@/lib/particleVerbs';

const STROKE_WIDTH = 2;

type PictureVars = CSSProperties & Record<`--${string}`, string>;

type Motion = 'sway' | 'close' | 'pulse' | 'fade' | 'burst';

interface Mover {
  motion: Motion;
  /** Fixed point of rotation or scaling, viewBox units. */
  origin: { x: number; y: number };
  /** Peak rotation in degrees (sway: both ways; close: start offset). */
  angle?: number;
  /** Peak scale (pulse). */
  scale?: number;
}

interface PictureSpec {
  /** Landmark or support: muted token, never animated. */
  landmark: ReactNode;
  /** The single animated element: primary token. Its own style is the rest frame. */
  mover: ReactNode;
  moverSpec: Mover;
}

// A car seen from above, nose up, top-left of the body at (x, y).
function TopCar({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width="5.4" height="10.5" rx="2.4" />
      <path d="M1.3 5L2 3H3.4L4.1 5Z" fill="currentColor" strokeWidth="0.8" />
      <path d="M-0.8 3.4V4.8M-0.8 7.8V9.2M6.2 3.4V4.8M6.2 7.8V9.2" strokeWidth="2.2" />
    </g>
  );
}

// Every picture: 24x24 viewBox, one landmark, one mover, in-place motion,
// rest frame complete. No people, text, arrows, trails or ground lines.
const PICTURES: Record<MeaningPictureId, PictureSpec> = {
  // Pole and an empty outline flag that waves: surrender.
  'white-flag': {
    landmark: (
      <>
        <line x1="3" y1="21" x2="14" y2="21" />
        <line x1="8" y1="21" x2="8" y2="3.5" />
      </>
    ),
    mover: <path d="M8 4.5C11 3 14 6 19 4.5L19 11.5C14 13 11 10 8 11.5" strokeWidth="1.6" />,
    moverSpec: { motion: 'sway', origin: { x: 8, y: 8 }, angle: 10 },
  },
  // Front view of a printer; a sheet with plain lines sits at its front, the
  // lines fade in. The sheet never moves.
  printer: {
    landmark: (
      <>
        <rect x="3" y="3" width="18" height="11" rx="2.5" />
        <circle cx="17" cy="8.5" r="1" fill="currentColor" stroke="none" />
        <rect x="6.5" y="14" width="11" height="8" rx="1" />
      </>
    ),
    mover: (
      <>
        <line x1="9.5" y1="17.5" x2="14.5" y2="17.5" strokeWidth="1.5" />
        <line x1="9.5" y1="20" x2="13" y2="20" strokeWidth="1.5" />
      </>
    ),
    moverSpec: { motion: 'fade', origin: { x: 12, y: 18.5 } },
  },
  // Warning triangle outline; the mark inside pulses.
  'warning-triangle': {
    landmark: <path d="M12 3L22 20.5H2Z" />,
    mover: (
      <>
        <line x1="12" y1="9" x2="12" y2="14" />
        <circle cx="12" cy="17.2" r="0.6" fill="currentColor" />
      </>
    ),
    moverSpec: { motion: 'pulse', origin: { x: 12, y: 13.5 }, scale: 1.08 },
  },
  // Top view: two equal open-ring cuffs joined by a three-link chain. Each ring
  // is a C-shaped body plus a jaw leaving a small gap; the right jaw closes.
  handcuffs: {
    landmark: (
      <>
        <path d="M8.6 12A4 4 0 1 1 3.23 8.24" strokeWidth="2.4" />
        <path d="M8.54 11.31A4 4 0 0 0 5.64 8.14" strokeWidth="2.4" />
        <path d="M15.4 12A4 4 0 1 0 20.77 8.24" strokeWidth="2.4" />
        <ellipse cx="9.8" cy="12" rx="1.5" ry="1.1" strokeWidth="1.3" />
        <line x1="12" y1="10.9" x2="12" y2="13.1" strokeWidth="1.8" />
        <ellipse cx="14.2" cy="12" rx="1.5" ry="1.1" strokeWidth="1.3" />
      </>
    ),
    mover: <path d="M15.46 11.31A4 4 0 0 1 18.36 8.14" strokeWidth="2.4" />,
    moverSpec: { motion: 'close', origin: { x: 15.4, y: 12 }, angle: -15 },
  },
  // Left half is still; the right half sways about the wide, jagged break.
  'snapping-rod': {
    landmark: <path d="M2.5 3L8.2 8.7L6.8 10.3L9.9 11" strokeWidth="2.6" />,
    mover: <path d="M13.2 11.2L15.2 12.2L14 14.7L21.5 21.5" strokeWidth="2.6" />,
    moverSpec: { motion: 'sway', origin: { x: 14, y: 13 }, angle: 10 },
  },
  // Top view: road edges, slower car in its lane, the overtaking car in the
  // other lane with its nose ahead. Each car: rounded body, dark windscreen,
  // wheels sticking out at the sides.
  'overtaking-car': {
    landmark: (
      <>
        <line x1="1.5" y1="2" x2="1.5" y2="22" />
        <line x1="22.5" y1="2" x2="22.5" y2="22" />
        <TopCar x={4.3} y={11} />
      </>
    ),
    mover: <TopCar x={14.3} y={3} />,
    moverSpec: { motion: 'sway', origin: { x: 17, y: 8.2 }, angle: 8 },
  },
  // Side view: car nose touches the post; the impact burst grows in.
  'car-collision': {
    landmark: (
      <>
        <line x1="22" y1="4" x2="22" y2="21" strokeWidth="2.4" />
        <path d="M1.5 18V14.5L5 13.5L7.5 10H12.5L14.5 13.5L19.5 14.5V18Z" />
        <circle cx="5.5" cy="18.2" r="1.9" fill="currentColor" stroke="none" />
        <circle cx="13.5" cy="18.2" r="1.9" fill="currentColor" stroke="none" />
      </>
    ),
    mover: (
      <path
        d="M17.8 5.6L18.55 7.3L20.4 7.1L19.3 8.6L20.4 10.1L18.55 9.9L17.8 11.6L17.05 9.9L15.2 10.1L16.3 8.6L15.2 7.1L17.05 7.3Z"
        fill="currentColor"
        strokeWidth="1"
      />
    ),
    moverSpec: { motion: 'burst', origin: { x: 17.8, y: 8.6 } },
  },
};

function readsReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

interface MeaningPictureProps {
  id: MeaningPictureId;
  className?: string;
}

export function MeaningPicture({ id, className }: MeaningPictureProps) {
  // Read once at mount, as ParticleGlyph and ConfettiEffect do.
  const [reducedMotion] = useState(readsReducedMotion);
  // Bumping the key remounts the SVG, which restarts the CSS animation.
  const [playCount, setPlayCount] = useState(0);

  const { landmark, mover, moverSpec } = PICTURES[id];

  const moverVars: PictureVars = {
    '--glyph-cycle': `${GLYPH_CYCLE_MS}ms`,
    '--mp-angle': `${moverSpec.angle ?? 0}deg`,
    '--mp-scale': `${moverSpec.scale ?? 1}`,
    transformOrigin: `${moverSpec.origin.x}px ${moverSpec.origin.y}px`,
  };

  const svg = (
    <svg
      key={playCount}
      data-meaning-picture={id}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className="size-10 overflow-visible"
      fill="none"
      strokeWidth={STROKE_WIDTH}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <g className="text-muted-foreground" stroke="currentColor">
        {landmark}
      </g>
      <g
        className={cn('meaning-picture-mover text-primary', `meaning-picture-${moverSpec.motion}`)}
        stroke="currentColor"
        style={moverVars}
      >
        {mover}
      </g>
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
      aria-label="Replay picture"
      onClick={() => setPlayCount((n) => n + 1)}
      className={cn(
        box,
        'cursor-pointer touch-manipulation hover:bg-muted active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        className,
      )}
    >
      {svg}
    </button>
  );
}
