// Discrimination-variant selection logic (issue #472).
//
// Pure functions only: no Math.random, no Date, no React, no storage
// access. Every decision reads only the arguments the caller passes in, so
// the same (frame, repetitions, introduced-particle set) triple always
// produces the same options in the same order, for every value of
// `repetitions`. That determinism is what lets the discrimination card be a
// *render mode* of the existing cloze item rather than a new scheduled item
// (docs/learning/2026-08-08-discrimination-exercise.md): nothing here reads
// or writes SrsState, it only decides what to show for a repetitions count
// the caller already has.
//
// This module does not decide *when* introduced-set membership changes, nor
// does it touch particleVerbData.ts, srs.ts or any UI file — see #472's
// acceptance criteria. The caller supplies:
//   - the frame (entry-level reflexive + acceptedParticles, and the
//     example's excludedParticles), matching ParticleVerbData /
//     ParticleVerbExample in src/data/particleVerbData.ts;
//   - `repetitions`, read from the item's stored SrsState;
//   - `introducedParticles`, the set of particle strings the learner has
//     already met (docs/learning/2026-08-08-discrimination-exercise.md's
//     "introduced" definition: at least one particle-verb item whose
//     `particle === p` has SRS state in the store).

import type { ReflexivePosition } from '@/data/particleVerbData';

/** The minimal frame shape this module reads. Deliberately narrower than
 * ParticleVerbData/ParticleVerbExample so a caller can pass either the real
 * data objects (which structurally satisfy this) or a synthetic fixture in
 * tests, with no React and no data-file import required to exercise it. */
export interface DiscriminationFrame {
  /** Entry-level (ParticleVerbData.reflexive). Only 'none' entries are
   * eligible: a reflexive lemma's {refl} placeholder never appears in a
   * rendered option label, so a reflexive frame has no valid option set. */
  reflexive: ReflexivePosition;
  /** Entry-level (ParticleVerbData.acceptedParticles), primary first.
   * Index 0 is always the target option's label — never a second accepted
   * spelling, even when the entry accepts more than one particle. */
  acceptedParticles: readonly string[];
  /** Frame-level (ParticleVerbExample.excludedParticles), authored order.
   * Particles the linguist has certified impossible in this exact sentence.
   * Undefined means none have been authored for this frame. */
  excludedParticles?: readonly string[];
}

export interface DiscriminationOption {
  particle: string;
  correct: boolean;
}

export interface DiscriminationVariant {
  /** k = floor(repetitions / 3): the render index every rule below is keyed
   * on, in place of raw `repetitions`. Exposed so a caller (or a test) can
   * confirm which render of the frame this is without recomputing it. */
  renderIndex: number;
  /** Exactly 3 options — the target plus 2 lures — sorted by
   * `localeCompare(..., 'sv')` and then rotated by `renderIndex % 3`.
   * Exactly one option has `correct: true`. */
  options: readonly DiscriminationOption[];
}

/** Below this many repetitions the target cloze is not yet learned enough
 * to be probed by recognition; see the eligibility table in #472. */
const MIN_REPETITIONS = 3;

/** A frame needs at least this many eligible lures — excludedParticles the
 * learner has already met — to fill a 3-option card (target + 2 lures). */
const MIN_ELIGIBLE_LURES = 2;

/** One review in three renders as a discrimination card; see
 * docs/learning/2026-08-08-discrimination-exercise.md. */
const TRIGGER_MODULUS = 3;

/** How many lures a rendered card shows alongside the target. */
const LURES_PER_CARD = 2;

/** Lures this frame can use today: `excludedParticles` the learner has
 * already met, filtered from the authored list without reordering it. Order
 * is load-bearing — the cyclic pick below indexes into this list
 * positionally, so a particle's authored position controls which render
 * windows it appears in. */
export function getEligibleLures(
  frame: Pick<DiscriminationFrame, 'excludedParticles'>,
  introducedParticles: ReadonlySet<string>,
): string[] {
  return (frame.excludedParticles ?? []).filter((particle) => introducedParticles.has(particle));
}

/** Frame eligibility: `repetitions >= 3`, at least 2 eligible lures, and a
 * non-reflexive entry. Independent of the one-in-three trigger below — a
 * frame can be eligible on every review from repetitions 3 onward and still
 * only render as a discrimination card on the reviews the trigger selects. */
export function isDiscriminationEligible(
  frame: DiscriminationFrame,
  repetitions: number,
  introducedParticles: ReadonlySet<string>,
): boolean {
  if (frame.reflexive !== 'none') return false;
  if (repetitions < MIN_REPETITIONS) return false;
  return getEligibleLures(frame, introducedParticles).length >= MIN_ELIGIBLE_LURES;
}

/** Rotates `items` left by `by` positions, wrapping. `by` is taken modulo
 * the array length first (and floor-mod'd, though every caller here already
 * passes a non-negative value) so any integer is safe to pass. */
function rotate<T>(items: readonly T[], by: number): T[] {
  if (items.length === 0) return [];
  const n = ((by % items.length) + items.length) % items.length;
  return [...items.slice(n), ...items.slice(0, n)];
}

/**
 * Decides whether this exact `repetitions` value renders `frame` as a
 * discrimination card and, if so, builds the card deterministically.
 *
 * Returns `null` whenever the frame is ineligible, this review does not
 * land on the one-in-three trigger, or a data defect breaks the "exactly
 * one correct option" invariant. `null` is the caller's signal to render
 * the typed cloze as normal — never a reduced-option card.
 */
export function selectDiscriminationVariant(
  frame: DiscriminationFrame,
  repetitions: number,
  introducedParticles: ReadonlySet<string>,
): DiscriminationVariant | null {
  if (!isDiscriminationEligible(frame, repetitions, introducedParticles)) return null;
  // Variant trigger: eligible AND repetitions % 3 === 0.
  if (repetitions % TRIGGER_MODULUS !== 0) return null;

  // Render index k, used everywhere below instead of raw repetitions.
  const renderIndex = Math.floor(repetitions / TRIGGER_MODULUS);

  const lures = getEligibleLures(frame, introducedParticles);
  // Distractor pick: 2 lures taken cyclically from the authored-order
  // (post-filter) list, starting at index k % n.
  const start = renderIndex % lures.length;
  const distractors: string[] = [];
  for (let i = 0; i < LURES_PER_CARD; i++) {
    const lure = lures[(start + i) % lures.length];
    if (lure !== undefined) distractors.push(lure);
  }

  // Target label is acceptedParticles[0] only — never a second accepted
  // spelling, even when the entry accepts more than one particle.
  const target = frame.acceptedParticles[0];
  if (target === undefined) return null;

  const optionSet = [target, ...distractors];
  // The distractor loop above can push fewer than LURES_PER_CARD lures if
  // the eligible-lure list is shorter than expected. Guard the count here so
  // the caller never receives a reduced-option card, even in that case.
  if (optionSet.length !== LURES_PER_CARD + 1) return null;
  // Safety net for a data defect (a lure that is, contrary to
  // certification, also an accepted answer, or a duplicate label): the
  // option set must intersect acceptedParticles in exactly one member, the
  // target. Anything else is ineligible rather than a card with two "right"
  // answers or a missing one.
  const acceptedInSet = optionSet.filter((particle) => frame.acceptedParticles.includes(particle));
  if (acceptedInSet.length !== 1) return null;
  if (new Set(optionSet).size !== optionSet.length) return null;

  // Option order: particle strings sorted by localeCompare(..., 'sv'), then
  // rotated by k % 3.
  //
  // Known limit: this rotation only guarantees a changing target position
  // while the option set itself is stable across renders. At more than two
  // eligible lures, the distractor window above also advances with k, so
  // the option set changes between renders and the rotation can still repeat
  // a position (see the render-index table in
  // docs/learning/2026-08-12-sentence-completion-distractors.md). The
  // dataset carries at most two eligible lures per frame today, so this
  // path stays latent — see that same note.
  const sorted = [...optionSet].sort((a, b) => a.localeCompare(b, 'sv'));
  const ordered = rotate(sorted, renderIndex % sorted.length);

  return {
    renderIndex,
    options: ordered.map((particle) => ({ particle, correct: particle === target })),
  };
}
