import type { Form } from '@/lib/verbs';

export interface SrsState {
  itemId: string;
  repetitions: number;
  intervalDays: number;
  easeFactor: number;
  dueAt: number;
  lastGrade?: number;
}

export type Grade = 0 | 1 | 2 | 3 | 4 | 5; // 0=Again, 1-2=Hard, 3-4=Good, 5=Easy

// SM-2 Algorithm (Anki-style)
export function calculateNextReview(state: SrsState, grade: Grade): SrsState {
  let { repetitions, intervalDays, easeFactor } = state;

  // Update ease factor
  easeFactor = Math.max(1.3, easeFactor + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02)));

  // Reset if failed
  if (grade < 3) {
    repetitions = 0;
    intervalDays = 1;
  } else {
    repetitions += 1;
    if (repetitions === 1) {
      intervalDays = 1;
    } else if (repetitions === 2) {
      intervalDays = 6;
    } else {
      intervalDays = Math.round(intervalDays * easeFactor);
    }
  }

  return {
    ...state,
    repetitions,
    intervalDays,
    easeFactor,
    dueAt: Date.now() + intervalDays * 24 * 60 * 60 * 1000,
    lastGrade: grade,
  };
}

// Initialize new SRS item
export function initializeSrsState(itemId: string): SrsState {
  return {
    itemId,
    repetitions: 0,
    intervalDays: 0,
    easeFactor: 2.5,
    dueAt: Date.now(),
  };
}

// Check if item is due
export function isDue(state: SrsState): boolean {
  return state.dueAt <= Date.now();
}

// ---------------------------------------------------------------------------
// Multiple-choice distractor selection (P14)
//
// docs/learning/2026-08-08-ux-pedagogy-red-lines.md, P14 (RED LINE):
// "Multiple-choice distractors must come from the same or an adjacent
// conjugation group as the target, and must be the same form. [...] a
// distractor must not be a correct form of the target verb in any other
// slot, or the card marks a learner wrong for a defensible answer."
//
// This lives here — next to item construction — rather than in the card,
// because a distractor a learner can eliminate by shape alone (wrong
// conjugation group) or that is secretly correct (a real form of the target
// verb in a different slot) reports a success to the scheduler that the
// learner did not earn. That is an SRS-quality bug, not a UI bug.
//
// Conjugation-group *adjacency* is a Swedish-grammar fact this module has no
// authority over — that belongs to swedish-linguist, and today no verb in
// src/data/verbData.ts even carries a group field. Rather than guess at
// Swedish morphology, this helper takes group identity and adjacency as
// inputs from the caller. The default (`isSameOrAdjacentGroup` unset) is the
// strictest reading of P14: exact group match only. Once swedish-linguist
// publishes group metadata and an adjacency rule, the caller can supply a
// looser predicate; the filtering logic itself does not need to change.

/** One other verb's value for the form currently being tested. */
export interface DistractorCandidate {
  /** Infinitive of the candidate verb — used only to exclude the target itself. */
  infinitive: string;
  /**
   * Conjugation-group identifier for the candidate verb (e.g. "1", "2a",
   * "2b", "3", "4"). Opaque to this module — see the adjacency note above.
   */
  conjugationGroup: string;
  /** The candidate's conjugated value for the form under test. May be empty/placeholder if unavailable. */
  value: string;
}

export interface SelectDistractorsParams {
  /** Infinitive of the verb being tested. */
  targetInfinitive: string;
  /** Conjugation-group identifier of the verb being tested. */
  targetGroup: string;
  /**
   * All known correct forms of the target verb (as many slots as are
   * available), used to reject any candidate value that is secretly correct
   * for the target in a different slot.
   */
  targetForms: Partial<Record<Form, string>>;
  /** Pool of other verbs' values for the same form as the target. */
  candidates: DistractorCandidate[];
  /** Maximum number of distractors to return. Default 3. */
  poolSize?: number;
  /** Sentinel value meaning "no data for this slot"; always excluded. Default `"(not available)"`. */
  placeholder?: string;
  /**
   * Returns true if `candidateGroup` is an acceptable source of distractors
   * for `targetGroup` (same group, or a group judged adjacent). Defaults to
   * exact match, which is always safe even without linguistic input.
   */
  isSameOrAdjacentGroup?: (targetGroup: string, candidateGroup: string) => boolean;
}

const DEFAULT_DISTRACTOR_PLACEHOLDER = '(not available)';

function exactGroupMatch(targetGroup: string, candidateGroup: string): boolean {
  return targetGroup === candidateGroup;
}

// Unbiased shuffle (matches useSrsProgress.ts and PracticeCard.tsx). Returns
// a new array; does not mutate the input.
function unbiasedShuffle<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Returns up to `poolSize` distractor values for a multiple-choice item,
 * already filtered per P14: same-or-adjacent conjugation group, same form
 * (structurally guaranteed — candidates are pre-computed for the tested form
 * only), never the target's own infinitive, never a correct form of the
 * target verb in any slot, no placeholders, no duplicates.
 *
 * Pure and bounded: iterates `candidates` at most once, never loops waiting
 * for enough distractors. If fewer than `poolSize` valid candidates exist,
 * the returned array is shorter — callers must not assume a fixed length.
 */
export function selectDistractors({
  targetInfinitive,
  targetGroup,
  targetForms,
  candidates,
  poolSize = 3,
  placeholder = DEFAULT_DISTRACTOR_PLACEHOLDER,
  isSameOrAdjacentGroup = exactGroupMatch,
}: SelectDistractorsParams): string[] {
  const targetCorrectValues = new Set(
    Object.values(targetForms).filter(
      (value): value is string => !!value && value !== placeholder
    )
  );

  const seen = new Set<string>();
  const pool: string[] = [];

  for (const candidate of unbiasedShuffle(candidates)) {
    if (pool.length >= poolSize) break;

    const { infinitive, conjugationGroup, value } = candidate;

    if (infinitive === targetInfinitive) continue; // never distract with the target verb itself
    if (!value || value === placeholder) continue; // no data for this candidate/form
    if (seen.has(value)) continue; // dedupe
    if (targetCorrectValues.has(value)) continue; // never a correct form of the target, any slot
    if (!isSameOrAdjacentGroup(targetGroup, conjugationGroup)) continue; // P14 group adjacency

    seen.add(value);
    pool.push(value);
  }

  return pool;
}
