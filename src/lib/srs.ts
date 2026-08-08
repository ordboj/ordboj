export interface SrsState {
  repetitions: number;
  intervalDays: number;
  easeFactor: number;
  dueAt: number;
  lastGrade?: number;
  // Legacy field. Storage versions 1 and 2 duplicated the store key inside
  // the value (`"12-presens": { "itemId": "12-presens", ... }`), ~25 of the
  // ~130 bytes per item. Version 3 never writes it — the key *is* the id —
  // but v1/v2 payloads read from localStorage or an old export file still
  // carry it, so the field stays typed (and optional) rather than being
  // silently untyped extra data. See useSrsProgress.ts (STORAGE_VERSION).
  itemId?: string;
}

// The UI (PracticeCard.tsx) only ever emits a binary correct/incorrect
// signal: `isCorrect ? 5 : 0`. The old 0-5 type implied a self-rated
// six-point grader that never existed in this app; narrowed here to the
// two literal values actually produced. See
// docs/learning/lapse-handling.md for the decision and rationale
// (learning-designer). A third value for hinted answers is proposed there
// but requires a frontend-owned change to the onAnswer payload and is
// tracked as a separate piece of work.
export type Grade = 0 | 5; // 0 = wrong, 5 = correct

const EASE_CEILING = 2.8;
const EASE_FLOOR = 1.3;
const EASE_DELTA_CORRECT = 0.05;
const EASE_DELTA_WRONG = -0.2;

// Ease factor of a never-reviewed item.
export const INITIAL_EASE_FACTOR = 2.5;

// Two decimals is the full precision the flat +0.05 / -0.20 deltas can ever
// produce; everything past that is IEEE-754 drift that only costs bytes in
// localStorage (2.5 - 0.2 - 0.1 stores as "2.1999999999999997": 18 chars
// instead of 4) and makes stored progress unreadable when inspected by hand.
// Rounding here, not at the storage boundary, keeps the in-memory state and
// the persisted state byte-identical, which is what makes "re-read what was
// written, verbatim" a checkable invariant.
export function roundEase(easeFactor: number): number {
  return Math.round(easeFactor * 100) / 100;
}

// Hard ceiling on any single interval. Even at the 2.8 ease ceiling an
// item's schedule cannot leave the app's one-year horizon.
export const MAX_INTERVAL_DAYS = 365;

// SM-2-derived scheduler, but with flat ease deltas instead of the
// textbook graded-ease formula. The textbook formula assumes a self-rated
// 0-5 input; fed a binary correct/wrong signal it produced a -0.80/+0.10
// asymmetry (every miss cost 0.8 ease, every hit gained 0.1), which drove
// ease to the floor after two early misses ("ease hell") while also
// letting a long correct streak inflate ease and therefore intervals
// without bound. Flat -0.20/+0.05 deltas, floored at 1.3 and now also
// ceilinged at 2.8, keep ease as a meaningful per-item difficulty signal
// without either failure mode.
export function calculateNextReview(state: SrsState, grade: Grade): SrsState {
  let { repetitions, intervalDays, easeFactor } = state;

  // Exact match, not >= 3: Grade is 0 | 5 today, and a future hinted
  // grade must force an explicit branch here rather than silently
  // counting as correct.
  const isCorrect = grade === 5;

  if (!isCorrect) {
    // Lapse: flat penalty, reset progress. No longer runs the SM-2 formula
    // before resetting, so the penalty is bounded and predictable.
    easeFactor = roundEase(Math.max(EASE_FLOOR, easeFactor + EASE_DELTA_WRONG));
    repetitions = 0;
    intervalDays = 1;
  } else {
    // Success: small capped reward. The ceiling is what stops runaway ease
    // growth on a long correct streak (previously uncapped).
    easeFactor = roundEase(Math.min(EASE_CEILING, easeFactor + EASE_DELTA_CORRECT));
    repetitions += 1;
    if (repetitions === 1) {
      intervalDays = 1;
    } else if (repetitions === 2) {
      intervalDays = 6;
    } else {
      intervalDays = Math.min(MAX_INTERVAL_DAYS, Math.round(intervalDays * easeFactor));
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

// Initialize new SRS item.
//
// `legacyItemId` is accepted and ignored: since storage version 3 the item id
// is the map key in the store, never a field of the value (see SrsState.itemId
// and useSrsProgress.ts). The parameter is kept so callers written against the
// version-2 signature keep compiling; new callers should pass nothing.
//
// A state produced here is fully derivable from the id alone, which is why the
// store no longer persists untouched items at all: an absent key means
// "new, due now", exactly what this returns.
export function initializeSrsState(legacyItemId?: string): SrsState {
  void legacyItemId;
  return {
    repetitions: 0,
    intervalDays: 0,
    easeFactor: INITIAL_EASE_FACTOR,
    dueAt: Date.now(),
  };
}

// Check if item is due
export function isDue(state: SrsState): boolean {
  return state.dueAt <= Date.now();
}
