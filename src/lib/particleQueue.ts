import { isDue, type SrsState } from '@/lib/srs';
import { conjugationItemId, particleItemId } from '@/lib/itemIds';
import { verbs } from '@/lib/verbs';
import { getVerifiedParticleVerbs, hasRecallItem } from '@/lib/particleVerbs';
import type { ParticleVerbData } from '@/data/particleVerbData';

// Every number in this file comes from docs/learning/particle-verb-practice.md.
// They are principled in direction and admittedly arbitrary in size; the note
// says which ones to move first if the observed data disagrees.

// Planning constant only — the learner reads a 6-10 word sentence plus a
// feedback panel, so a particle card is slower than a conjugation card (5).
export const PARTICLE_ITEMS_PER_MINUTE = 3;

// Capacity gate: how many reviews the day must have room for per new card.
// Higher than conjugation's 3 because a particle is arbitrary rather than
// derivable — there is no partial knowledge to fall back on when it lapses.
export const REVIEWS_PER_NEW_CARD = 4;

// The recall item unlocks once its sibling cloze has been answered correctly
// this many times. Before that, a production prompt has nothing to retrieve
// and degrades into a reveal.
export const RECALL_UNLOCK_REPETITIONS = 2;

// A particle verb is only introduced once its base verb is genuinely known:
// this many correct answers on presens *and* preteritum.
export const BASE_VERB_GATE_REPETITIONS = 2;

// Items that must fall between a verb's introduction card and its first
// cloze. Six is the preference; two is the floor, below which the pair is an
// adjacent reveal-then-ask — a familiarity check that reports a success to
// the scheduler the learner did not earn.
export const PREFERRED_INTERVENING_BEFORE_FIRST_CLOZE = 6;
export const MIN_INTERVENING_BEFORE_FIRST_CLOZE = 2;

// Same particle, different base verbs is a weak interference risk; cap and
// stop worrying.
export const MAX_NEW_PER_PARTICLE_PER_SITTING = 2;

export const PARTICLE_DAILY_GOAL_MIN = 4;
export const PARTICLE_DAILY_GOAL_MAX = 60;
export const PARTICLE_DAILY_GOAL_DEFAULT = 12;

function clamp(min: number, max: number, value: number): number {
  return Math.min(max, Math.max(min, value));
}

// clamp(1, 10, round(goal / 4)) — 3 at the default goal of 12. The floor is
// 1, not 2: on a standalone goal of 4 a floor of 2 would spend half the day
// on new material and starve reviews.
export function particleNewCardsPerDay(particleDailyGoal: number): number {
  return clamp(1, 10, Math.round(particleDailyGoal / REVIEWS_PER_NEW_CARD));
}

// New cards are what the day's budget has room for after reviews are paid
// for, at four reviews per new card.
export function particleNewAllowedToday(
  particleDailyGoal: number,
  particleReviewsDue: number,
): number {
  const spentOnReviews = Math.min(particleReviewsDue, particleDailyGoal);
  return clamp(
    0,
    particleNewCardsPerDay(particleDailyGoal),
    Math.floor((particleDailyGoal - spentOnReviews) / REVIEWS_PER_NEW_CARD),
  );
}

export type ParticleCardKind = 'introduction' | 'cloze' | 'recall';

export interface ParticleSittingCard {
  kind: ParticleCardKind;
  entry: ParticleVerbData;
  // Null for an introduction card: it is shown, not tested, so it has no
  // schedule and no SRS state of its own.
  itemId: string | null;
  // Introductions and a newly introduced verb's first cloze are both
  // excluded from the goal, the same treatment a lapse re-queue gets.
  countsTowardGoal: boolean;
}

export interface ParticleSitting {
  cards: ParticleSittingCard[];
  reviewsDue: number;
  newAllowedToday: number;
  // Verbs introduced this sitting whose first cloze could not be placed with
  // enough distance and was held over. See the short-sitting fallback.
  deferredFirstClozes: string[];
}

interface BuildOptions {
  srsStates: Record<string, SrsState>;
  particleDailyGoal: number;
  now?: number;
  // Injected so tests are deterministic. Defaults to Fisher-Yates.
  shuffle?: <T>(items: T[]) => T[];
  entries?: ParticleVerbData[];
}

function fisherYates<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const verbIdByInfinitive = new Map(verbs.map((verb) => [verb.infinitive, verb.id]));

// The base verb must be known before its particle verb is introduced:
// repetitions >= 2 on both presens and preteritum. A base that does not
// resolve in VERB_DATA can never pass, which is why the dataset test refuses
// to let a verified entry have one.
export function isBaseVerbReady(
  entry: ParticleVerbData,
  srsStates: Record<string, SrsState>,
): boolean {
  const verbId = verbIdByInfinitive.get(entry.baseInfinitive);
  if (!verbId) return false;
  return (['presens', 'preteritum'] as const).every((form) => {
    const state = srsStates[conjugationItemId(verbId, form)];
    return (state?.repetitions ?? 0) >= BASE_VERB_GATE_REPETITIONS;
  });
}

// "Never introduce two particle verbs sharing a base verb within a week"
// (semantic-set interference; bygga upp / bygga ut is the case it guards).
//
// Derived from the sibling's own schedule rather than from a stored
// introduction date, so the rule costs no new storage: a cloze at
// repetitions 0 or 1 is at most a day or so old, and reaching repetitions 2
// takes the 1-day and then 6-day intervals — about a week. The known
// inaccuracy is that a lapse resets repetitions and re-blocks the base; that
// errs towards spacing things further apart, never towards introducing an
// interfering pair, so it fails in the safe direction.
export function isBaseRecentlyUsed(
  entry: ParticleVerbData,
  srsStates: Record<string, SrsState>,
  entries: ParticleVerbData[],
): boolean {
  return entries.some((other) => {
    if (other.id === entry.id) return false;
    if (other.baseInfinitive !== entry.baseInfinitive) return false;
    const state = srsStates[particleItemId(other.id, 'cloze')];
    return state !== undefined && state.repetitions < RECALL_UNLOCK_REPETITIONS;
  });
}

// Builds one particle sitting.
//
// Order (docs/learning/particle-verb-practice.md, "Ordering within a
// particle sitting"):
//   1. introduction cards for today's new verbs — first exposure gets the
//      attention available at the start, and they are not tests
//   2. due reviews, most overdue first
//   3. recall unlocks, which are new cards but scheduled ones
//   4. the first cloze of each verb introduced in step 1, at the end
export function buildParticleSitting({
  srsStates,
  particleDailyGoal,
  now = Date.now(),
  shuffle = fisherYates,
  entries = getVerifiedParticleVerbs(),
}: BuildOptions): ParticleSitting {
  const eligible = entries.filter((entry) => isBaseVerbReady(entry, srsStates));

  // --- due reviews -------------------------------------------------------
  // The two items of one verb never share a sitting: the cloze feedback
  // screen shows the phrase in full, so a recall card later in the same
  // sitting is answered from short-term memory and reports a success the
  // learner did not earn. When both are due, the cloze wins and the recall
  // waits for the next sitting.
  const dueCards: Array<{ card: ParticleSittingCard; dueAt: number }> = [];
  for (const entry of eligible) {
    const clozeId = particleItemId(entry.id, 'cloze');
    const clozeState = srsStates[clozeId];
    if (clozeState && isDue(clozeState, now)) {
      dueCards.push({
        card: { kind: 'cloze', entry, itemId: clozeId, countsTowardGoal: true },
        dueAt: clozeState.dueAt,
      });
      continue;
    }
    if (!hasRecallItem(entry)) continue;
    const recallId = particleItemId(entry.id, 'recall');
    const recallState = srsStates[recallId];
    if (recallState && isDue(recallState, now)) {
      dueCards.push({
        card: { kind: 'recall', entry, itemId: recallId, countsTowardGoal: true },
        dueAt: recallState.dueAt,
      });
    }
  }

  // Most overdue first, with ties interleaved rather than left in corpus
  // order — otherwise every sitting opens with the same base verbs.
  const reviews = shuffle(dueCards)
    .sort((a, b) => a.dueAt - b.dueAt)
    .map(({ card }) => card)
    .slice(0, particleDailyGoal);

  const reviewsDue = dueCards.length;
  const newAllowedToday = particleNewAllowedToday(particleDailyGoal, reviewsDue);

  // --- new cards: recall unlocks first, then introductions ----------------
  // A recall unlock is material the learner has already met, so it earns its
  // place in the allowance ahead of a verb they have never seen.
  let remaining = newAllowedToday;

  const recallUnlocks: ParticleSittingCard[] = [];
  for (const entry of eligible) {
    if (remaining <= 0) break;
    if (!hasRecallItem(entry)) continue;
    const recallId = particleItemId(entry.id, 'recall');
    if (srsStates[recallId]) continue;
    const clozeState = srsStates[particleItemId(entry.id, 'cloze')];
    if (!clozeState || clozeState.repetitions < RECALL_UNLOCK_REPETITIONS) continue;
    // Sibling separation again: an unlock is not served in a sitting that
    // already contains this verb's cloze.
    if (reviews.some((card) => card.entry.id === entry.id)) continue;
    recallUnlocks.push({ kind: 'recall', entry, itemId: recallId, countsTowardGoal: true });
    remaining -= 1;
  }

  const introductions: ParticleSittingCard[] = [];
  const newPerParticle = new Map<string, number>();
  for (const entry of eligible) {
    if (remaining <= 0) break;
    if (srsStates[particleItemId(entry.id, 'cloze')]) continue;
    if (isBaseRecentlyUsed(entry, srsStates, entries)) continue;
    // A base verb introduced earlier in *this* sitting blocks its siblings
    // too; the stored-state check above cannot see it yet.
    if (introductions.some((card) => card.entry.baseInfinitive === entry.baseInfinitive)) continue;
    const perParticle = newPerParticle.get(entry.particle) ?? 0;
    if (perParticle >= MAX_NEW_PER_PARTICLE_PER_SITTING) continue;

    introductions.push({ kind: 'introduction', entry, itemId: null, countsTowardGoal: false });
    newPerParticle.set(entry.particle, perParticle + 1);
    remaining -= 1;
  }

  // --- first clozes, at the end, with the gap rule ------------------------
  // Preferred gap is six intervening items; the floor is two. Below the
  // floor the cloze is held over rather than asked adjacent to its own
  // answer — on a four-card goal that means it is often deferred, which is
  // the honest cost of a four-card day rather than a defect.
  const firstClozes: ParticleSittingCard[] = [];
  const deferredFirstClozes: string[] = [];
  const middleLength = reviews.length + recallUnlocks.length;
  introductions.forEach((intro, index) => {
    // Items between this introduction and its cloze: the introductions after
    // it, everything in the middle, and the first clozes already placed.
    const intervening = introductions.length - 1 - index + middleLength + firstClozes.length;
    if (intervening < MIN_INTERVENING_BEFORE_FIRST_CLOZE) {
      deferredFirstClozes.push(intro.entry.id);
      return;
    }
    firstClozes.push({
      kind: 'cloze',
      entry: intro.entry,
      itemId: particleItemId(intro.entry.id, 'cloze'),
      countsTowardGoal: false,
    });
  });

  return {
    cards: [...introductions, ...reviews, ...recallUnlocks, ...firstClozes],
    reviewsDue,
    newAllowedToday,
    deferredFirstClozes,
  };
}

// How many not-yet-due items a "keep practising" round draws.
export const FREE_PARTICLE_PRACTICE_SIZE = 5;

// Items the learner has met that are NOT yet due, nearest future due date
// first. Reads state and never writes it, so drawing this pool — or drawing
// it repeatedly — cannot disturb a single real interval.
export function buildFreeParticlePractice(
  srsStates: Record<string, SrsState>,
  now: number = Date.now(),
  entries: ParticleVerbData[] = getVerifiedParticleVerbs(),
): ParticleSittingCard[] {
  const candidates: Array<{ card: ParticleSittingCard; dueAt: number }> = [];
  for (const entry of entries) {
    const kinds: ParticleCardKind[] = hasRecallItem(entry) ? ['cloze', 'recall'] : ['cloze'];
    for (const kind of kinds) {
      if (kind === 'introduction') continue;
      const itemId = particleItemId(entry.id, kind === 'recall' ? 'recall' : 'cloze');
      const state = srsStates[itemId];
      if (!state || state.dueAt <= now) continue;
      candidates.push({
        card: { kind, entry, itemId, countsTowardGoal: false },
        dueAt: state.dueAt,
      });
    }
  }
  return candidates
    .sort((a, b) => a.dueAt - b.dueAt)
    .slice(0, FREE_PARTICLE_PRACTICE_SIZE)
    .map(({ card }) => card);
}

// Count for the Home entry point. Reviews only: introductions and first
// clozes are not "due" in any sense the learner would recognise, and a badge
// that counts them would never reach zero.
export function countParticleReviewsDue(
  srsStates: Record<string, SrsState>,
  now: number = Date.now(),
  entries: ParticleVerbData[] = getVerifiedParticleVerbs(),
): number {
  return buildParticleSitting({
    srsStates,
    particleDailyGoal: PARTICLE_DAILY_GOAL_MAX,
    now,
    shuffle: (items) => items,
    entries,
  }).reviewsDue;
}
