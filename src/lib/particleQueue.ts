import { isDue, localCalendarDaysBetween, type SrsState } from '@/lib/srs';
import { conjugationItemId, particleItemId } from '@/lib/itemIds';
import { verbs, type Form } from '@/lib/verbs';
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
  // #350 / docs/learning/2026-08-09-particle-cefr-majority-decision.md,
  // "The residual risk, named": applies only to introduction candidates.
  // Same semantics as useSrsProgress's conjugation filter — `undefined` is
  // "no filter, all bands in scope"; any array, including `[]`, is honored
  // exactly. Due reviews and recall unlocks are never filtered: they are
  // schedules for verbs the learner already met, and filtering them would
  // orphan items the learner has a schedule for.
  cefrLevels?: string[];
}

function fisherYates<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = copy[i];
    const b = copy[j];
    // i and j are always in [0, length); the guard only satisfies
    // noUncheckedIndexedAccess without a non-null assertion.
    if (a === undefined || b === undefined) continue;
    copy[i] = b;
    copy[j] = a;
  }
  return copy;
}

const verbIdByInfinitive = new Map(verbs.map((verb) => [verb.infinitive, verb.id]));

// Issue #316: soft introduction ordering. The hard base-verb gate was
// removed by issue #315 — this never gates, it only decides what order
// today's introductions come in.
const CONJUGATION_FORMS_FOR_PRIORITY: readonly Form[] = [
  'presens',
  'preteritum',
  'supinum',
  'imperativ',
];

// CEFR band, ascending. The only thing the ordering rule is allowed to touch
// first: nothing below can ever move an entry out of the position its own
// band gives it.
const CEFR_BAND_ORDER: Record<ParticleVerbData['cefr'], number> = {
  A1: 0,
  A2: 1,
  B1: 2,
  B2: 3,
  C1: 4,
};

// Soft signal, deliberately weaker than the hard gate #315 removed
// (repetitions >= 2 on two forms): "has the learner started this base at
// all" — any one
// conjugation item at repetitions >= 1. An unresolvable baseInfinitive (or a
// base nothing has been answered on yet) reads as "not started", never as an
// error; the caller only ever uses this to order, not to exclude.
export function isBaseStarted(
  entry: ParticleVerbData,
  srsStates: Record<string, SrsState>,
): boolean {
  const verbId = verbIdByInfinitive.get(entry.baseInfinitive);
  if (!verbId) return false;
  return CONJUGATION_FORMS_FOR_PRIORITY.some(
    (form) => (srsStates[conjugationItemId(verbId, form)]?.repetitions ?? 0) >= 1,
  );
}

// docs/learning/particle-verb-practice.md, "Progression, and what CEFR can
// and cannot do": CEFR band ascending; within a band, a base the learner has
// started before one they have not; then transparency, literal before
// idiomatic; then corpus frequency. The fourth key is never compared
// explicitly — PARTICLE_VERB_DATA is already frequency-ordered within a band
// by the linguist, and Array.prototype.sort is a stable sort in every engine
// this project targets, so two entries tied on every rule above simply keep
// the relative order they arrived in.
//
// Each comparison returns as soon as it finds a difference, so a
// lower-priority key (started, transparency) can never reach far enough to
// move an entry across a band boundary — the band term dominates.
function compareForIntroduction(
  a: ParticleVerbData,
  b: ParticleVerbData,
  srsStates: Record<string, SrsState>,
): number {
  const bandDiff = CEFR_BAND_ORDER[a.cefr] - CEFR_BAND_ORDER[b.cefr];
  if (bandDiff !== 0) return bandDiff;

  const startedDiff = Number(isBaseStarted(b, srsStates)) - Number(isBaseStarted(a, srsStates));
  if (startedDiff !== 0) return startedDiff;

  return Number(a.transparency === 'idiomatic') - Number(b.transparency === 'idiomatic');
}

// Reorders introduction candidates only. Never called for due reviews or
// recall unlocks — see buildParticleSitting, where only the introductions
// loop reads from this. A verb with an unknown or unstarted base is never
// dropped here, only sorted later within its own band.
export function orderForIntroduction(
  entries: ParticleVerbData[],
  srsStates: Record<string, SrsState>,
): ParticleVerbData[] {
  return [...entries].sort((a, b) => compareForIntroduction(a, b, srsStates));
}

// "Never introduce two particle verbs sharing a base verb within a week"
// (semantic-set interference; bygga upp / bygga ut is the case it guards).
//
// Decision 2 of
// docs/learning/2026-08-17-reflexive-only-verbs-and-entries-per-base.md,
// with the human rulings applied: the window is exactly 7 calendar days,
// measured from the sibling's *first exposure* (`firstSeenAt`, stamped on
// the sibling cloze's first recorded answer), not from its current mastery.
// The previous proxy — sibling cloze at repetitions < 2 blocks the base —
// measured mastery where the rule means recency, so every lapse on a met
// sibling re-blocked its base (~22% of days on an 18-entry base like `ta`)
// while a sibling stuck at repetitions 1 blocked forever.
//
// Day arithmetic is calendar-local (localCalendarDaysBetween in srs.ts, the
// same local-day convention as isDue's end-of-day boundary), so DST days
// and the exact time of day cannot shift the window: a sibling first seen
// on local day D blocks its base on days D..D+6 and frees it on D+7.
//
// The repetitions fallback survives only for a sibling state that carries
// no firstSeenAt. Post-migration (useSrsProgress backfills the field on
// read) that is limited to states injected without it — e2e seeds, hand
// edits — and for those the old proxy still fails in the safe direction.
export const BASE_INTRODUCTION_WINDOW_DAYS = 7;

export function isBaseRecentlyUsed(
  entry: ParticleVerbData,
  srsStates: Record<string, SrsState>,
  entries: ParticleVerbData[],
  now: number = Date.now(),
): boolean {
  return entries.some((other) => {
    if (other.id === entry.id) return false;
    if (other.baseInfinitive !== entry.baseInfinitive) return false;
    const state = srsStates[particleItemId(other.id, 'cloze')];
    if (state === undefined) return false;
    if (state.firstSeenAt === undefined) {
      return state.repetitions < RECALL_UNLOCK_REPETITIONS;
    }
    return localCalendarDaysBetween(state.firstSeenAt, now) < BASE_INTRODUCTION_WINDOW_DAYS;
  });
}

// Decision 2, rule 3 ("Within a sitting"): no two cards sharing a
// baseInfinitive may be adjacent; reorder to satisfy it, never drop a card.
//
// Greedy separation over one segment of the sitting. At each position it
// takes the earliest card whose base differs from the previous card's,
// preferring the most frequent remaining base — pulling the dense base
// (e.g. an all-`ta` review pile) forward is what leaves enough spacers to
// finish without a forced adjacency, and when all counts are 1 the earliest
// card wins, so a segment with no repeated bases keeps its original order.
// When every remaining card shares the previous base the adjacency is
// unsatisfiable (e.g. three due `ta` reviews and one other) and the card is
// served anyway: the rule reorders, it never drops a due review.
function separateSameBaseNeighbors(
  cards: ParticleSittingCard[],
  previousBase: string | undefined,
): ParticleSittingCard[] {
  const remaining = [...cards];
  const ordered: ParticleSittingCard[] = [];
  let prev = previousBase;
  while (remaining.length > 0) {
    const counts = new Map<string, number>();
    for (const card of remaining) {
      const base = card.entry.baseInfinitive;
      counts.set(base, (counts.get(base) ?? 0) + 1);
    }
    let pick = -1;
    let pickCount = -1;
    for (let i = 0; i < remaining.length; i++) {
      const card = remaining[i];
      if (card === undefined) continue;
      const base = card.entry.baseInfinitive;
      if (base === prev) continue;
      const count = counts.get(base) ?? 0;
      // Strict >: the earliest card among the most frequent bases wins.
      if (count > pickCount) {
        pick = i;
        pickCount = count;
      }
    }
    if (pick === -1) pick = 0;
    const [card] = remaining.splice(pick, 1);
    if (card === undefined) break;
    ordered.push(card);
    prev = card.entry.baseInfinitive;
  }
  return ordered;
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
  cefrLevels,
}: BuildOptions): ParticleSitting {
  // Due reviews are never gated on the conjugation store: once an item has
  // been introduced, its schedule is the only thing that decides whether it
  // is due. See docs/superpowers/specs/2026-08-08-partikelverb-design.md.
  //
  // --- due reviews -------------------------------------------------------
  // The two items of one verb never share a sitting: the cloze feedback
  // screen shows the phrase in full, so a recall card later in the same
  // sitting is answered from short-term memory and reports a success the
  // learner did not earn. When both are due, the cloze wins and the recall
  // waits for the next sitting.
  const dueCards: Array<{ card: ParticleSittingCard; dueAt: number }> = [];
  for (const entry of entries) {
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
  for (const entry of entries) {
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
  // #350: the cefrLevels setting narrows which *new* verbs are offered, so a
  // learner who wants to stay at a level never meets a higher band as an
  // introduction. `isBaseRecentlyUsed` below still checks against the full
  // `entries`, not this narrowed list: interference is a fact about the
  // whole corpus, not about what is currently offered.
  const introductionCandidates =
    cefrLevels === undefined ? entries : entries.filter((entry) => cefrLevels.includes(entry.cefr));
  // Issue #316: introduction order only. Due reviews and recall unlocks
  // above still iterate `entries` in its own (corpus) order, untouched.
  for (const entry of orderForIntroduction(introductionCandidates, srsStates)) {
    if (remaining <= 0) break;
    if (srsStates[particleItemId(entry.id, 'cloze')]) continue;
    if (isBaseRecentlyUsed(entry, srsStates, entries, now)) continue;
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

  // --- no-adjacent-same-base ordering (decision 2, rule 3) ----------------
  // Segments that cannot contain an internal same-base pair are left alone:
  // introductions and first clozes each carry pairwise-distinct bases by
  // construction (the same-sitting base block in the introductions loop
  // above). The middle — reviews plus recall unlocks — can repeat a base, so
  // it is reordered, seeded with the last introduction's base to cover the
  // introductions→middle boundary. Reorder only: the same cards, so
  // reviewsDue, the goal accounting and the intervening-item counts (which
  // use middle *length*, not order) are all untouched.
  const lastIntroBase = introductions[introductions.length - 1]?.entry.baseInfinitive;
  const middle = separateSameBaseNeighbors([...reviews, ...recallUnlocks], lastIntroBase);

  // The middle→first-cloze boundary. firstClozes cannot be permuted — each
  // one's position carries the intervening-item floor checked at placement,
  // and its own introduction's index feeds that count — so when the middle
  // ends on the first cloze's base, swap that last middle card with an
  // earlier one, provided the swap creates no new adjacency at either
  // position. If no candidate fits, the adjacency stands: never drop.
  const firstClozeBase = firstClozes[0]?.entry.baseInfinitive;
  const last = middle.length - 1;
  if (firstClozeBase !== undefined && middle[last]?.entry.baseInfinitive === firstClozeBase) {
    const baseAt = (index: number): string | undefined =>
      index === -1 ? lastIntroBase : middle[index]?.entry.baseInfinitive;
    for (let k = last - 1; k >= 0; k--) {
      const candidate = middle[k];
      const lastCard = middle[last];
      if (candidate === undefined || lastCard === undefined) break;
      const candidateBase = candidate.entry.baseInfinitive;
      const movedBase = lastCard.entry.baseInfinitive;
      if (candidateBase === firstClozeBase) continue;
      // Neighbours as they will stand after the swap; an adjacent swap
      // (k === last - 1) makes the two swapped cards each other's neighbour.
      const adjacentSwap = k === last - 1;
      const leftOfLastAfter = adjacentSwap ? movedBase : baseAt(last - 1);
      const rightOfKAfter = adjacentSwap ? candidateBase : baseAt(k + 1);
      if (candidateBase === leftOfLastAfter) continue;
      if (movedBase === baseAt(k - 1) || movedBase === rightOfKAfter) continue;
      middle[k] = lastCard;
      middle[last] = candidate;
      break;
    }
  }

  return {
    cards: [...introductions, ...middle, ...firstClozes],
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
  // One item per verb, same sibling-separation reasoning as a scheduled
  // sitting: a cloze feedback screen shows the phrase in full, so pairing it
  // with its own recall card makes the second card a reading exercise. A free
  // round records nothing, so no false success reaches the scheduler, but the
  // round is worth less and there is no reason to build it that way.
  const seenVerbs = new Set<string>();
  return candidates
    .sort((a, b) => a.dueAt - b.dueAt)
    .filter(({ card }) => {
      if (seenVerbs.has(card.entry.id)) return false;
      seenVerbs.add(card.entry.id);
      return true;
    })
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
