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

// In-session relearning queue policy (decision: docs/learning/lapse-handling.md,
// "Decision" and "Interaction with the sitting cap"). A lapsed item re-enters
// the current sitting rather than waiting until its normal `dueAt` (tomorrow
// at the earliest); these two constants are the whole of that policy's
// numbers. Queue insertion and per-item-per-day counting live in the sitting
// itself (Practice.tsx, frontend-expert) and in useSrsProgress.ts; this
// module owns only the pure threshold check so the policy has one source of
// truth instead of drifting between files.

// Minimum number of other items answered before a lapsed item may reappear
// in the same sitting. Enough to clear working memory; small enough that the
// correction still lands inside a 15-item sitting.
export const REQUEUE_GAP_ITEMS = 3;

// Cap on how many times a single item may be re-queued in one day, across
// sittings. On the (cap+1)th lapse the item is left at its normal `dueAt`
// (set by calculateNextReview, already tomorrow) instead of re-entering the
// sitting again, so one intractable verb cannot trap the learner.
export const MAX_REQUEUES_PER_DAY = 2;

// Pure eligibility check: does a lapsed item qualify to be re-inserted into
// the current sitting right now? `itemsSinceLapse` is the number of other
// items answered since this item's most recent lapse this sitting;
// `requeuesToday` is how many times this item has already been re-queued
// today, across sittings. Callers own tracking those two numbers (they are
// session/day bookkeeping, not part of the persisted SrsState); this
// function only encodes the threshold.
export function isEligibleForRequeue(itemsSinceLapse: number, requeuesToday: number): boolean {
  return itemsSinceLapse >= REQUEUE_GAP_ITEMS && requeuesToday < MAX_REQUEUES_PER_DAY;
}
