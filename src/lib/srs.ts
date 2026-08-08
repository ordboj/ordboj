export interface SrsState {
  itemId: string;
  repetitions: number;
  intervalDays: number;
  easeFactor: number;
  dueAt: number;
  lastGrade?: number;
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
    easeFactor = Math.max(EASE_FLOOR, easeFactor + EASE_DELTA_WRONG);
    repetitions = 0;
    intervalDays = 1;
  } else {
    // Success: small capped reward. The ceiling is what stops runaway ease
    // growth on a long correct streak (previously uncapped).
    easeFactor = Math.min(EASE_CEILING, easeFactor + EASE_DELTA_CORRECT);
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

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

// Structural validator for one stored/imported item. Used by the import
// path, which is the only place untrusted data enters the store: the file
// comes off the user's disk and can be any JSON at all. Deliberately
// permissive about *values* (any positive finite easeFactor, any finite
// lastGrade) so that genuine older backups written by earlier versions of
// the scheduler are not rejected, and strict about *shape* so that a
// settings export or an unrelated JSON file cannot pass as progress.
export function isSrsState(value: unknown): value is SrsState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const state = value as Record<string, unknown>;
  if (typeof state.itemId !== 'string' || state.itemId.length === 0) return false;
  if (!isFiniteNumber(state.repetitions) || !Number.isInteger(state.repetitions)) return false;
  if (state.repetitions < 0) return false;
  if (!isFiniteNumber(state.intervalDays) || state.intervalDays < 0) return false;
  if (!isFiniteNumber(state.easeFactor) || state.easeFactor <= 0) return false;
  if (!isFiniteNumber(state.dueAt)) return false;
  if (state.lastGrade !== undefined && !isFiniteNumber(state.lastGrade)) return false;
  return true;
}
