import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  buildFreeParticlePractice,
  buildParticleSitting,
  countParticleReviewsDue,
  isBaseRecentlyUsed,
  isBaseStarted,
  orderForIntroduction,
  particleNewAllowedToday,
  particleNewCardsPerDay,
  MAX_NEW_PER_PARTICLE_PER_SITTING,
} from '@/lib/particleQueue';
import { conjugationItemId, particleItemId } from '@/lib/itemIds';
import { getVerifiedParticleVerbs } from '@/lib/particleVerbs';
import { verbs } from '@/lib/verbs';
import type { SrsState } from '@/lib/srs';
import type { ParticleVerbData } from '@/data/particleVerbData';

const NOW = new Date('2026-03-10T12:00:00.000Z').getTime();
const DAY = 24 * 60 * 60 * 1000;

// Identity shuffle: the queue's only nondeterminism is injected, so every
// assertion below is about the rules rather than about a seed.
const noShuffle = <T>(items: T[]): T[] => items;

function state(overrides: Partial<SrsState> & { itemId: string }): SrsState {
  return {
    repetitions: 0,
    intervalDays: 0,
    easeFactor: 2.5,
    dueAt: NOW,
    ...overrides,
  };
}

// A base verb the gate accepts: repetitions >= 2 on presens and preteritum.
function readyBase(infinitive: string): Record<string, SrsState> {
  const verbId = verbs.find((verb) => verb.infinitive === infinitive)?.id;
  if (!verbId) throw new Error(`fixture error: ${infinitive} is not in VERB_DATA`);
  const out: Record<string, SrsState> = {};
  for (const form of ['presens', 'preteritum'] as const) {
    const itemId = conjugationItemId(verbId, form);
    out[itemId] = state({ itemId, repetitions: 2, intervalDays: 6, dueAt: NOW + 6 * DAY });
  }
  return out;
}

function entry(overrides: Partial<ParticleVerbData> & { id: string }): ParticleVerbData {
  return {
    cefr: 'A1',
    cefrEvidence: 'svalex',
    baseInfinitive: 'gå',
    particle: 'ut',
    reflexive: 'none',
    lemma: 'gå ut',
    gloss: { en: 'a gloss' },
    transparency: 'literal',
    acceptedParticles: ['ut'],
    examples: [
      { sv: 'Vi går ut och äter middag varje fredag.', blankIndex: 2 },
      { sv: 'Hon går ut genom dörren utan ett ord.', blankIndex: 2 },
    ],
    verified: true,
    ...overrides,
  };
}

describe('new-card arithmetic', () => {
  it('gives 3 new cards a day at the default goal of 12', () => {
    expect(particleNewCardsPerDay(12)).toBe(3);
  });

  it('has a floor of 1, not 2, so a four-card goal still makes progress', () => {
    // The floor of 2 was written when the goal was a slice of a larger
    // budget; on a standalone goal of 4 it would starve reviews.
    expect(particleNewCardsPerDay(4)).toBe(1);
  });

  it('caps at 10 however large the goal is', () => {
    expect(particleNewCardsPerDay(60)).toBe(10);
    expect(particleNewCardsPerDay(1000)).toBe(10);
  });

  it('spends the whole allowance when nothing is due', () => {
    expect(particleNewAllowedToday(12, 0)).toBe(3);
  });

  it('allows no new cards when reviews already fill the goal', () => {
    expect(particleNewAllowedToday(12, 12)).toBe(0);
    expect(particleNewAllowedToday(12, 40)).toBe(0);
  });

  it('gates new cards at four reviews of capacity each', () => {
    expect(particleNewAllowedToday(12, 4)).toBe(2);
    expect(particleNewAllowedToday(12, 8)).toBe(1);
    expect(particleNewAllowedToday(12, 9)).toBe(0);
  });
});

// Issue #315: buildParticleSitting used to filter every entry through
// isBaseVerbReady before it ever looked at due dates, so a review that was
// genuinely overdue silently vanished from the sitting whenever the base
// verb's conjugation progress lapsed or was never recorded. That is a
// schedule drifting wrong with no error and no visible symptom — exactly
// the silent-failure shape this suite exists to catch. isBaseVerbReady and
// the base-verb gate are deleted; a due pv: item now depends only on its
// own SRS schedule.
describe('issue #315: a due review is never hidden by the conjugation store', () => {
  it('serves a due cloze whose base verb has no conjugation progress at all', () => {
    const target = entry({ id: 'pv:test-ut' });
    const clozeId = particleItemId(target.id, 'cloze');
    const sitting = buildParticleSitting({
      srsStates: {
        [clozeId]: state({ itemId: clozeId, repetitions: 3, dueAt: NOW - DAY }),
      },
      particleDailyGoal: 12,
      now: NOW,
      shuffle: noShuffle,
      entries: [target],
    });
    expect(sitting.cards.map((card) => card.itemId)).toContain(clozeId);
  });

  it('serves a due cloze whose base verb just lapsed (repetitions 0)', () => {
    const target = entry({ id: 'pv:test-ut' });
    const clozeId = particleItemId(target.id, 'cloze');
    const verbId = verbs.find((verb) => verb.infinitive === 'gå')!.id;
    const presensId = conjugationItemId(verbId, 'presens');
    const sitting = buildParticleSitting({
      srsStates: {
        // A lapse: the base verb was known and just got answered wrong.
        [presensId]: state({ itemId: presensId, repetitions: 0, dueAt: NOW }),
        [clozeId]: state({ itemId: clozeId, repetitions: 3, dueAt: NOW - DAY }),
      },
      particleDailyGoal: 12,
      now: NOW,
      shuffle: noShuffle,
      entries: [target],
    });
    expect(sitting.cards.map((card) => card.itemId)).toContain(clozeId);
  });
});

describe('introductions', () => {
  it('introduces a new verb once its base verb is ready', () => {
    const target = entry({ id: 'pv:test-ut' });
    const sitting = buildParticleSitting({
      srsStates: readyBase('gå'),
      particleDailyGoal: 12,
      now: NOW,
      shuffle: noShuffle,
      entries: [target],
    });
    expect(sitting.cards.map((card) => card.kind)).toEqual(['introduction']);
  });

  it('puts introductions at the top of the sitting', () => {
    const states = {
      ...readyBase('gå'),
      ...readyBase('ta'),
      // A due review, so the sitting has a middle.
      [particleItemId('pv:due-one', 'cloze')]: state({
        itemId: particleItemId('pv:due-one', 'cloze'),
        repetitions: 3,
        dueAt: NOW - DAY,
      }),
    };
    const sitting = buildParticleSitting({
      srsStates: states,
      particleDailyGoal: 12,
      now: NOW,
      shuffle: noShuffle,
      entries: [
        entry({ id: 'pv:due-one', baseInfinitive: 'gå' }),
        entry({
          id: 'pv:new-one',
          baseInfinitive: 'ta',
          particle: 'med',
          acceptedParticles: ['med'],
        }),
      ],
    });
    expect(sitting.cards[0]!.kind).toBe('introduction');
    expect(sitting.cards[0]!.entry.id).toBe('pv:new-one');
  });

  it('never introduces two verbs sharing a base verb in one sitting', () => {
    const entries = [
      entry({ id: 'pv:ga-ut' }),
      entry({ id: 'pv:ga-in', particle: 'in', acceptedParticles: ['in'] }),
    ];
    const sitting = buildParticleSitting({
      srsStates: readyBase('gå'),
      particleDailyGoal: 60,
      now: NOW,
      shuffle: noShuffle,
      entries,
    });
    const introduced = sitting.cards.filter((card) => card.kind === 'introduction');
    expect(introduced).toHaveLength(1);
  });

  it('holds a sibling back while the first one is still young (fallback proxy: no firstSeenAt on the sibling state)', () => {
    // bygga upp / bygga ut is the interference case; here it is gå ut / gå in.
    // `state()` below sets no firstSeenAt, so this exercises the pre-ORD-88
    // fallback proxy (repetitions < RECALL_UNLOCK_REPETITIONS) that
    // isBaseRecentlyUsed still uses for a sibling state written without the
    // stamp (e2e seeds, hand edits) — see the dedicated firstSeenAt-window
    // suite below for the exact 7-day-window behavior this proxy approximates.
    const first = entry({ id: 'pv:ga-ut' });
    const second = entry({ id: 'pv:ga-in', particle: 'in', acceptedParticles: ['in'] });
    const clozeId = particleItemId(first.id, 'cloze');
    const states = {
      ...readyBase('gå'),
      [clozeId]: state({ itemId: clozeId, repetitions: 1, dueAt: NOW + DAY }),
    };
    expect(isBaseRecentlyUsed(second, states, [first, second])).toBe(true);

    const sitting = buildParticleSitting({
      srsStates: states,
      particleDailyGoal: 60,
      now: NOW,
      shuffle: noShuffle,
      entries: [first, second],
    });
    expect(sitting.cards.filter((card) => card.kind === 'introduction')).toEqual([]);
  });

  it('releases the sibling once the first one is about a week old (fallback proxy: no firstSeenAt on the sibling state)', () => {
    const first = entry({ id: 'pv:ga-ut' });
    const second = entry({ id: 'pv:ga-in', particle: 'in', acceptedParticles: ['in'] });
    const clozeId = particleItemId(first.id, 'cloze');
    const states = {
      ...readyBase('gå'),
      // repetitions 2 means the 1-day and 6-day intervals have both passed.
      [clozeId]: state({ itemId: clozeId, repetitions: 2, dueAt: NOW + 6 * DAY }),
    };
    expect(isBaseRecentlyUsed(second, states, [first, second])).toBe(false);
  });

  it('caps new verbs sharing one particle', () => {
    const entries = ['ta', 'se', 'ge', 'stå'].map((base, index) =>
      entry({ id: `pv:${base}-ut-${index}`, baseInfinitive: base }),
    );
    const states = {
      ...readyBase('ta'),
      ...readyBase('se'),
      ...readyBase('ge'),
      ...readyBase('stå'),
    };
    const sitting = buildParticleSitting({
      srsStates: states,
      particleDailyGoal: 60,
      now: NOW,
      shuffle: noShuffle,
      entries,
    });
    expect(sitting.cards.filter((card) => card.kind === 'introduction')).toHaveLength(
      MAX_NEW_PER_PARTICLE_PER_SITTING,
    );
  });
});

// ORD-88 decision 2: isBaseRecentlyUsed's primary rule is now the sibling
// cloze's firstSeenAt, not its current mastery — exact 7 calendar days from
// first exposure, day-boundary semantics (localCalendarDaysBetween in
// srs.ts), never raw millisecond arithmetic. The fallback proxy tests above
// cover the pre-stamp path; these cover the stamped path the fix is actually
// for.
describe('isBaseRecentlyUsed - 7-day first-exposure window (ORD-88 decision 2)', () => {
  it('blocks the base on days D through D+6 from the sibling\'s first exposure, and frees it on day D+7', () => {
    const first = entry({ id: 'pv:ga-ut' });
    const second = entry({ id: 'pv:ga-in', particle: 'in', acceptedParticles: ['in'] });
    const clozeId = particleItemId(first.id, 'cloze');
    const firstSeenAt = NOW; // day D
    const states = {
      [clozeId]: state({
        itemId: clozeId,
        repetitions: 5,
        dueAt: NOW + 60 * DAY,
        firstSeenAt,
      }),
    };

    for (let day = 0; day <= 6; day++) {
      expect(isBaseRecentlyUsed(second, states, [first, second], NOW + day * DAY)).toBe(true);
    }
    expect(isBaseRecentlyUsed(second, states, [first, second], NOW + 7 * DAY)).toBe(false);
  });

  it('does not block on a mature sibling that just lapsed if it was first seen more than 7 days ago (the ~22% over-block case decision 2 fixes)', () => {
    // Under the old repetitions-based proxy this sibling (repetitions reset
    // to 0 by the lapse) would still block: repetitions < 2. The fix
    // measures recency of first exposure instead of current mastery, so a
    // sibling met 10 days ago no longer blocks just because it lapsed
    // yesterday.
    const first = entry({ id: 'pv:ta-fram', baseInfinitive: 'ta' });
    const second = entry({
      id: 'pv:ta-itu-med',
      baseInfinitive: 'ta',
      particle: 'itu med',
      acceptedParticles: ['itu med'],
    });
    const clozeId = particleItemId(first.id, 'cloze');
    const states = {
      [clozeId]: state({
        itemId: clozeId,
        repetitions: 0,
        intervalDays: 1,
        lastGrade: 0,
        dueAt: NOW + DAY,
        firstSeenAt: NOW - 10 * DAY,
      }),
    };

    expect(isBaseRecentlyUsed(second, states, [first, second], NOW)).toBe(false);
  });

  it('still blocks a sibling that lapsed inside the 7-day window (the fix narrows the rule, it does not disable it)', () => {
    const first = entry({ id: 'pv:ta-fram', baseInfinitive: 'ta' });
    const second = entry({
      id: 'pv:ta-itu-med',
      baseInfinitive: 'ta',
      particle: 'itu med',
      acceptedParticles: ['itu med'],
    });
    const clozeId = particleItemId(first.id, 'cloze');
    const states = {
      [clozeId]: state({
        itemId: clozeId,
        repetitions: 0,
        intervalDays: 1,
        lastGrade: 0,
        dueAt: NOW + DAY,
        firstSeenAt: NOW - 2 * DAY,
      }),
    };

    expect(isBaseRecentlyUsed(second, states, [first, second], NOW)).toBe(true);
  });
});

// process.env.TZ = 'Europe/Stockholm', same convention as
// src/lib/srs.test.ts's DST suite: the window is computed through
// localCalendarDaysBetween, so a bug there (raw ms-diff instead of local
// calendar days) would show up as an off-by-one exactly on a DST day, not on
// an ordinary one.
describe('isBaseRecentlyUsed - 7-day window across a DST transition (Europe/Stockholm)', () => {
  const originalTz = process.env.TZ;

  beforeEach(() => {
    process.env.TZ = 'Europe/Stockholm';
  });

  afterEach(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it('still frees the base at exactly day 7 when the window spans the spring-forward day (2026-03-29, 23-hour day)', () => {
    const first = entry({ id: 'pv:ga-ut' });
    const second = entry({ id: 'pv:ga-in', particle: 'in', acceptedParticles: ['in'] });
    const clozeId = particleItemId(first.id, 'cloze');
    const firstSeenAt = new Date(2026, 2, 25, 9, 0, 0, 0).getTime(); // March 25, local
    const states = {
      [clozeId]: state({
        itemId: clozeId,
        repetitions: 5,
        dueAt: firstSeenAt + 60 * DAY,
        firstSeenAt,
      }),
    };
    const dayPlus6 = new Date(2026, 2, 31, 9, 0, 0, 0).getTime(); // March 31
    const dayPlus7 = new Date(2026, 3, 1, 9, 0, 0, 0).getTime(); // April 1

    expect(isBaseRecentlyUsed(second, states, [first, second], dayPlus6)).toBe(true);
    expect(isBaseRecentlyUsed(second, states, [first, second], dayPlus7)).toBe(false);
  });

  it('still frees the base at exactly day 7 when the window spans the fall-back day (2026-10-25, 25-hour day)', () => {
    const first = entry({ id: 'pv:ga-ut' });
    const second = entry({ id: 'pv:ga-in', particle: 'in', acceptedParticles: ['in'] });
    const clozeId = particleItemId(first.id, 'cloze');
    const firstSeenAt = new Date(2026, 9, 21, 9, 0, 0, 0).getTime(); // Oct 21, local
    const states = {
      [clozeId]: state({
        itemId: clozeId,
        repetitions: 5,
        dueAt: firstSeenAt + 60 * DAY,
        firstSeenAt,
      }),
    };
    const dayPlus6 = new Date(2026, 9, 27, 9, 0, 0, 0).getTime(); // Oct 27
    const dayPlus7 = new Date(2026, 9, 28, 9, 0, 0, 0).getTime(); // Oct 28

    expect(isBaseRecentlyUsed(second, states, [first, second], dayPlus6)).toBe(true);
    expect(isBaseRecentlyUsed(second, states, [first, second], dayPlus7)).toBe(false);
  });
});

describe('introduction ordering (issue #316)', () => {
  describe('isBaseStarted', () => {
    it('is false when the base has no conjugation progress at all', () => {
      const target = entry({ id: 'pv:test-ut', baseInfinitive: 'gå' });
      expect(isBaseStarted(target, {})).toBe(false);
    });

    it('is false when the base verb does not resolve in VERB_DATA', () => {
      const orphan = entry({ id: 'pv:orphan', baseInfinitive: 'zzz-not-a-verb' });
      expect(isBaseStarted(orphan, readyBase('gå'))).toBe(false);
    });

    it('is true from repetitions 1, weaker than the repetitions-2 hard gate', () => {
      const target = entry({ id: 'pv:test-ut', baseInfinitive: 'gå' });
      const presensId = conjugationItemId('gå', 'presens');
      const states = { [presensId]: state({ itemId: presensId, repetitions: 1 }) };
      expect(isBaseStarted(target, states)).toBe(true);
    });

    it('counts supinum or imperativ progress, not only presens/preteritum', () => {
      const target = entry({ id: 'pv:test-ut', baseInfinitive: 'ta' });
      const supinumId = conjugationItemId('ta', 'supinum');
      expect(
        isBaseStarted(target, { [supinumId]: state({ itemId: supinumId, repetitions: 1 }) }),
      ).toBe(true);

      const imperativId = conjugationItemId('ta', 'imperativ');
      expect(
        isBaseStarted(target, { [imperativId]: state({ itemId: imperativId, repetitions: 3 }) }),
      ).toBe(true);
    });
  });

  describe('orderForIntroduction', () => {
    it('never lets a band-B verb precede a band-A verb, regardless of tiebreaks', () => {
      // bandB gets every tiebreak advantage (started base, literal); bandA
      // gets every tiebreak disadvantage (unresolvable base, idiomatic). The
      // band term must still dominate.
      const bandB = entry({
        id: 'pv:band-b',
        cefr: 'B1',
        baseInfinitive: 'ta',
        transparency: 'literal',
      });
      const bandA = entry({
        id: 'pv:band-a',
        cefr: 'A2',
        baseInfinitive: 'zzz-not-a-verb',
        transparency: 'idiomatic',
      });
      const ordered = orderForIntroduction([bandB, bandA], readyBase('ta'));
      expect(ordered.map((e) => e.id)).toEqual(['pv:band-a', 'pv:band-b']);
    });

    it('orders a started base ahead of an unstarted one within the same band', () => {
      const started = entry({ id: 'pv:started', baseInfinitive: 'gå' });
      const notStarted = entry({ id: 'pv:not-started', baseInfinitive: 'ta' });
      const imperativId = conjugationItemId('gå', 'imperativ');
      const states = { [imperativId]: state({ itemId: imperativId, repetitions: 1 }) };
      const ordered = orderForIntroduction([notStarted, started], states);
      expect(ordered.map((e) => e.id)).toEqual(['pv:started', 'pv:not-started']);
    });

    it('orders literal ahead of idiomatic within the same band and started tier', () => {
      const idiomatic = entry({
        id: 'pv:idiomatic',
        transparency: 'idiomatic',
        baseInfinitive: 'gå',
      });
      const literal = entry({ id: 'pv:literal', transparency: 'literal', baseInfinitive: 'ta' });
      const ordered = orderForIntroduction([idiomatic, literal], {});
      expect(ordered.map((e) => e.id)).toEqual(['pv:literal', 'pv:idiomatic']);
    });

    it('preserves corpus order for entries tied on every rule (stable sort)', () => {
      const entries = [
        entry({ id: 'pv:tie-1', baseInfinitive: 'gå' }),
        entry({ id: 'pv:tie-2', baseInfinitive: 'ta' }),
        entry({ id: 'pv:tie-3', baseInfinitive: 'se' }),
        entry({ id: 'pv:tie-4', baseInfinitive: 'ge' }),
      ];
      const ordered = orderForIntroduction(entries, {});
      expect(ordered.map((e) => e.id)).toEqual(['pv:tie-1', 'pv:tie-2', 'pv:tie-3', 'pv:tie-4']);
    });

    it('never drops a verb whose base is unresolvable — worst case is last in its band', () => {
      const orphan = entry({ id: 'pv:orphan', baseInfinitive: 'zzz-not-a-verb', cefr: 'A1' });
      const known = entry({ id: 'pv:known', baseInfinitive: 'gå', cefr: 'A1' });
      const imperativId = conjugationItemId('gå', 'imperativ');
      const states = { [imperativId]: state({ itemId: imperativId, repetitions: 1 }) };
      const ordered = orderForIntroduction([orphan, known], states);
      expect(ordered).toHaveLength(2);
      expect(ordered.map((e) => e.id)).toEqual(['pv:known', 'pv:orphan']);
    });

    it('gives identical output for identical input across repeated calls (determinism)', () => {
      const entries = [
        entry({ id: 'pv:a', cefr: 'B1', baseInfinitive: 'gå' }),
        entry({ id: 'pv:b', cefr: 'A1', baseInfinitive: 'ta', transparency: 'idiomatic' }),
        entry({ id: 'pv:c', cefr: 'A1', baseInfinitive: 'se', transparency: 'literal' }),
        entry({ id: 'pv:d', cefr: 'A2', baseInfinitive: 'ge' }),
      ];
      const states = readyBase('se');
      const first = orderForIntroduction(entries, states).map((e) => e.id);
      const second = orderForIntroduction(entries, states).map((e) => e.id);
      expect(second).toEqual(first);
    });

    it('does not mutate its input array', () => {
      const entries = [entry({ id: 'pv:b', cefr: 'B1' }), entry({ id: 'pv:a', cefr: 'A1' })];
      const before = entries.map((e) => e.id);
      orderForIntroduction(entries, {});
      expect(entries.map((e) => e.id)).toEqual(before);
    });

    it('introduces 30 verbs before it leaves A1/A2', () => {
      const first30 = orderForIntroduction(getVerifiedParticleVerbs(), {}).slice(0, 30);
      const late = first30.filter((entry) => entry.cefr !== 'A1' && entry.cefr !== 'A2');
      expect(late.map((entry) => entry.id)).toEqual([]);
    });
  });

  describe('applied inside buildParticleSitting', () => {
    it('serves introductions in band order even when the corpus order is scrambled', () => {
      const bandB = entry({
        id: 'pv:band-b',
        cefr: 'B1',
        baseInfinitive: 'se',
        particle: 'igen',
        acceptedParticles: ['igen'],
      });
      const bandA1 = entry({ id: 'pv:band-a1', cefr: 'A1', baseInfinitive: 'gå' });
      const bandA2 = entry({
        id: 'pv:band-a2',
        cefr: 'A2',
        baseInfinitive: 'ta',
        particle: 'med',
        acceptedParticles: ['med'],
      });
      const states = { ...readyBase('gå'), ...readyBase('ta'), ...readyBase('se') };
      const sitting = buildParticleSitting({
        srsStates: states,
        particleDailyGoal: 60,
        now: NOW,
        shuffle: noShuffle,
        // Fed in reverse-band order on purpose.
        entries: [bandB, bandA2, bandA1],
      });
      expect(
        sitting.cards.filter((card) => card.kind === 'introduction').map((card) => card.entry.id),
      ).toEqual(['pv:band-a1', 'pv:band-a2', 'pv:band-b']);
    });

    it('leaves due-review order untouched by the new ordering signal (no regression on #315)', () => {
      // Reviews are selected and ordered by dueAt alone, never by
      // orderForIntroduction. moreOverdue is band B1 and corpus-order-last;
      // lessOverdue is band A1 and corpus-order-first. If review selection
      // were ever routed through the introduction ordering, band or corpus
      // order would win and flip this result; only dueAt is allowed to.
      const moreOverdue = entry({ id: 'pv:review-more-overdue', cefr: 'B1', baseInfinitive: 'ta' });
      const lessOverdue = entry({ id: 'pv:review-less-overdue', cefr: 'A1', baseInfinitive: 'gå' });
      const moreOverdueClozeId = particleItemId(moreOverdue.id, 'cloze');
      const lessOverdueClozeId = particleItemId(lessOverdue.id, 'cloze');
      const states = {
        ...readyBase('gå'),
        ...readyBase('ta'),
        [moreOverdueClozeId]: state({
          itemId: moreOverdueClozeId,
          repetitions: 3,
          dueAt: NOW - 2 * DAY,
        }),
        [lessOverdueClozeId]: state({
          itemId: lessOverdueClozeId,
          repetitions: 3,
          dueAt: NOW - DAY,
        }),
      };
      const sitting = buildParticleSitting({
        srsStates: states,
        particleDailyGoal: 12,
        now: NOW,
        shuffle: noShuffle,
        // Corpus order puts the A1/less-overdue entry first; dueAt says the
        // opposite must win.
        entries: [lessOverdue, moreOverdue],
      });
      expect(sitting.cards.map((card) => card.entry.id)).toEqual([
        'pv:review-more-overdue',
        'pv:review-less-overdue',
      ]);
    });
  });
});

// #350 / docs/learning/2026-08-09-particle-cefr-majority-decision.md, "The
// residual risk, named": cefrLevels scopes introduction candidates only.
// Due reviews and recall unlocks must never be filtered — they are
// schedules for verbs the learner already met, and filtering them would
// orphan items with an existing schedule.
describe('#350: cefrLevels scopes introductions only', () => {
  it('never offers an introduction outside cefrLevels, even with room in the allowance', () => {
    const inBand = entry({ id: 'pv:a1-intro', cefr: 'A1', baseInfinitive: 'gå' });
    const outOfBand = entry({
      id: 'pv:b1-intro',
      cefr: 'B1',
      baseInfinitive: 'ta',
      particle: 'med',
      acceptedParticles: ['med'],
    });
    const sitting = buildParticleSitting({
      srsStates: {},
      particleDailyGoal: 60,
      now: NOW,
      shuffle: noShuffle,
      entries: [inBand, outOfBand],
      cefrLevels: ['A1'],
    });
    const introducedIds = sitting.cards
      .filter((card) => card.kind === 'introduction')
      .map((card) => card.entry.id);
    expect(introducedIds).toEqual(['pv:a1-intro']);
    expect(introducedIds).not.toContain('pv:b1-intro');
  });

  it('still serves a due review outside cefrLevels', () => {
    const outOfBand = entry({ id: 'pv:b1-due', cefr: 'B1', baseInfinitive: 'ta' });
    const clozeId = particleItemId(outOfBand.id, 'cloze');
    const sitting = buildParticleSitting({
      srsStates: {
        [clozeId]: state({ itemId: clozeId, repetitions: 3, dueAt: NOW - DAY }),
      },
      particleDailyGoal: 12,
      now: NOW,
      shuffle: noShuffle,
      entries: [outOfBand],
      cefrLevels: ['A1'],
    });
    expect(sitting.reviewsDue).toBe(1);
    expect(sitting.cards.map((card) => card.kind)).toEqual(['cloze']);
    expect(sitting.cards[0]!.entry.id).toBe('pv:b1-due');
  });

  it('still serves a recall unlock outside cefrLevels', () => {
    const outOfBand = entry({ id: 'pv:b1-unlock', cefr: 'B1', baseInfinitive: 'ta' });
    const clozeId = particleItemId(outOfBand.id, 'cloze');
    const sitting = buildParticleSitting({
      srsStates: {
        [clozeId]: state({ itemId: clozeId, repetitions: 2, dueAt: NOW + 6 * DAY }),
      },
      particleDailyGoal: 12,
      now: NOW,
      shuffle: noShuffle,
      entries: [outOfBand],
      cefrLevels: ['A1'],
    });
    expect(sitting.cards.map((card) => card.kind)).toEqual(['recall']);
    expect(sitting.cards[0]!.entry.id).toBe('pv:b1-unlock');
  });

  it('treats undefined cefrLevels as no filter, matching pre-#350 behavior', () => {
    const a1 = entry({ id: 'pv:a1', cefr: 'A1', baseInfinitive: 'gå' });
    const b1 = entry({
      id: 'pv:b1',
      cefr: 'B1',
      baseInfinitive: 'ta',
      particle: 'med',
      acceptedParticles: ['med'],
    });
    const sitting = buildParticleSitting({
      srsStates: {},
      particleDailyGoal: 60,
      now: NOW,
      shuffle: noShuffle,
      entries: [a1, b1],
      // cefrLevels omitted entirely.
    });
    const introducedIds = sitting.cards
      .filter((card) => card.kind === 'introduction')
      .map((card) => card.entry.id);
    expect(introducedIds).toEqual(['pv:a1', 'pv:b1']);
  });

  it('honors an explicit empty cefrLevels array as "no introductions", not as "no filter"', () => {
    // Same contract as issue #137 on the conjugation side: [] must never be
    // silently widened back to "all bands in scope".
    const a1 = entry({ id: 'pv:a1-empty', cefr: 'A1', baseInfinitive: 'gå' });
    const sitting = buildParticleSitting({
      srsStates: {},
      particleDailyGoal: 60,
      now: NOW,
      shuffle: noShuffle,
      entries: [a1],
      cefrLevels: [],
    });
    expect(sitting.cards.filter((card) => card.kind === 'introduction')).toEqual([]);
  });

  it('still blocks an in-band introduction whose sibling base is recently used out-of-band', () => {
    // isBaseRecentlyUsed must check the full corpus, not the cefrLevels-
    // narrowed candidate list: interference is a fact about the whole
    // corpus, not about what is currently offered.
    const outOfBandSibling = entry({
      id: 'pv:b1-sibling',
      cefr: 'B1',
      baseInfinitive: 'ta',
      particle: 'emot',
      acceptedParticles: ['emot'],
    });
    const inBandCandidate = entry({
      id: 'pv:a1-candidate',
      cefr: 'A1',
      baseInfinitive: 'ta',
      particle: 'med',
      acceptedParticles: ['med'],
    });
    const siblingClozeId = particleItemId(outOfBandSibling.id, 'cloze');
    const sitting = buildParticleSitting({
      srsStates: {
        // repetitions < RECALL_UNLOCK_REPETITIONS (2) means "recently used".
        [siblingClozeId]: state({ itemId: siblingClozeId, repetitions: 1, dueAt: NOW + DAY }),
      },
      particleDailyGoal: 60,
      now: NOW,
      shuffle: noShuffle,
      entries: [outOfBandSibling, inBandCandidate],
      cefrLevels: ['A1'],
    });
    expect(sitting.cards.filter((card) => card.kind === 'introduction')).toEqual([]);
  });
});

describe('first cloze placement', () => {
  function sittingWithReviews(reviewCount: number, goal: number) {
    const entries: ParticleVerbData[] = [
      entry({
        id: 'pv:new-one',
        baseInfinitive: 'ta',
        particle: 'med',
        acceptedParticles: ['med'],
      }),
    ];
    const states: Record<string, SrsState> = { ...readyBase('gå'), ...readyBase('ta') };
    for (let i = 0; i < reviewCount; i++) {
      const id = `pv:review-${i}`;
      entries.push(entry({ id, baseInfinitive: 'gå' }));
      const itemId = particleItemId(id, 'cloze');
      states[itemId] = state({ itemId, repetitions: 3, dueAt: NOW - DAY });
    }
    return buildParticleSitting({
      srsStates: states,
      particleDailyGoal: goal,
      now: NOW,
      shuffle: noShuffle,
      entries,
    });
  }

  it('places the first cloze last in the sitting, after the reviews', () => {
    const sitting = sittingWithReviews(6, 12);
    const kinds = sitting.cards.map((card) => card.kind);
    expect(kinds[0]).toBe('introduction');
    expect(kinds[kinds.length - 1]).toBe('cloze');
    expect(sitting.cards[sitting.cards.length - 1]!.entry.id).toBe('pv:new-one');
    expect(sitting.deferredFirstClozes).toEqual([]);
  });

  it('does not count the introduction or the first cloze toward the goal', () => {
    const sitting = sittingWithReviews(6, 12);
    const uncounted = sitting.cards.filter((card) => !card.countsTowardGoal);
    expect(uncounted.map((card) => card.kind)).toEqual(['introduction', 'cloze']);
  });

  it('accepts a gap smaller than the preferred six when the sitting is short', () => {
    // Two intervening items is the floor, and it is satisfied here.
    const sitting = sittingWithReviews(2, 12);
    expect(sitting.deferredFirstClozes).toEqual([]);
    expect(sitting.cards[sitting.cards.length - 1]!.kind).toBe('cloze');
  });

  it('defers the first cloze when fewer than two items would intervene', () => {
    // An adjacent reveal-then-ask is a familiarity check, not a retrieval,
    // and would report a success the learner did not earn.
    const sitting = sittingWithReviews(1, 12);
    expect(sitting.deferredFirstClozes).toEqual(['pv:new-one']);
    expect(sitting.cards.filter((card) => card.kind === 'cloze')).toHaveLength(1);
    expect(sitting.cards.filter((card) => card.kind === 'cloze')[0]!.entry.id).toBe('pv:review-0');
  });

  it('defers the first cloze of a lone introduction with no reviews at all', () => {
    const sitting = sittingWithReviews(0, 4);
    expect(sitting.cards.map((card) => card.kind)).toEqual(['introduction']);
    expect(sitting.deferredFirstClozes).toEqual(['pv:new-one']);
  });
});

describe('recall items', () => {
  const target = entry({ id: 'pv:test-ut' });
  const clozeId = particleItemId(target.id, 'cloze');
  const recallId = particleItemId(target.id, 'recall');

  it('stays locked while the sibling cloze is below two repetitions', () => {
    const states = {
      ...readyBase('gå'),
      [clozeId]: state({ itemId: clozeId, repetitions: 1, dueAt: NOW + DAY }),
    };
    const sitting = buildParticleSitting({
      srsStates: states,
      particleDailyGoal: 12,
      now: NOW,
      shuffle: noShuffle,
      entries: [target],
    });
    expect(sitting.cards.filter((card) => card.kind === 'recall')).toEqual([]);
  });

  it('unlocks once the sibling cloze reaches two repetitions', () => {
    const states = {
      ...readyBase('gå'),
      [clozeId]: state({ itemId: clozeId, repetitions: 2, dueAt: NOW + 6 * DAY }),
    };
    const sitting = buildParticleSitting({
      srsStates: states,
      particleDailyGoal: 12,
      now: NOW,
      shuffle: noShuffle,
      entries: [target],
    });
    expect(sitting.cards.map((card) => card.kind)).toEqual(['recall']);
    expect(sitting.cards[0]!.itemId).toBe(recallId);
  });

  it('never gives a reflexive verb a recall item', () => {
    // A recall card asks for the citation form, whose pronoun is wrong in
    // two persons out of three.
    const reflexive = entry({
      id: 'pv:hora-av-sig',
      baseInfinitive: 'höra',
      particle: 'av',
      acceptedParticles: ['av'],
      reflexive: 'afterParticle',
      lemma: 'höra av {refl}',
    });
    const reflexiveCloze = particleItemId(reflexive.id, 'cloze');
    const states = {
      ...readyBase('höra'),
      [reflexiveCloze]: state({ itemId: reflexiveCloze, repetitions: 5, dueAt: NOW + 30 * DAY }),
    };
    const sitting = buildParticleSitting({
      srsStates: states,
      particleDailyGoal: 12,
      now: NOW,
      shuffle: noShuffle,
      entries: [reflexive],
    });
    expect(sitting.cards).toEqual([]);
  });

  it('takes priority over a new verb introduction inside the allowance', () => {
    // Allowance of 1: the unlock is material the learner has already met, so
    // it goes ahead of a verb they have never seen.
    const unlockable = entry({ id: 'pv:unlockable' });
    const brandNew = entry({
      id: 'pv:brand-new',
      baseInfinitive: 'ta',
      particle: 'med',
      acceptedParticles: ['med'],
    });
    const unlockableCloze = particleItemId(unlockable.id, 'cloze');
    const states = {
      ...readyBase('gå'),
      ...readyBase('ta'),
      [unlockableCloze]: state({
        itemId: unlockableCloze,
        repetitions: 2,
        dueAt: NOW + 6 * DAY,
      }),
    };
    const sitting = buildParticleSitting({
      srsStates: states,
      // Goal 4 gives an allowance of exactly 1.
      particleDailyGoal: 4,
      now: NOW,
      shuffle: noShuffle,
      entries: [brandNew, unlockable],
    });
    expect(sitting.newAllowedToday).toBe(1);
    expect(sitting.cards.map((card) => card.kind)).toEqual(['recall']);
  });
});

describe('sibling separation', () => {
  const target = entry({ id: 'pv:test-ut' });
  const clozeId = particleItemId(target.id, 'cloze');
  const recallId = particleItemId(target.id, 'recall');

  it('serves the cloze and holds the recall when both are due', () => {
    // The cloze feedback screen shows the phrase in full, so a recall card
    // later in the same sitting is answered from short-term memory.
    const states = {
      ...readyBase('gå'),
      [clozeId]: state({ itemId: clozeId, repetitions: 4, dueAt: NOW - 2 * DAY }),
      [recallId]: state({ itemId: recallId, repetitions: 3, dueAt: NOW - 3 * DAY }),
    };
    const sitting = buildParticleSitting({
      srsStates: states,
      particleDailyGoal: 12,
      now: NOW,
      shuffle: noShuffle,
      entries: [target],
    });
    expect(sitting.cards).toHaveLength(1);
    expect(sitting.cards[0]!.itemId).toBe(clozeId);
  });

  it('serves the recall alone when only it is due', () => {
    const states = {
      ...readyBase('gå'),
      [clozeId]: state({ itemId: clozeId, repetitions: 4, dueAt: NOW + 10 * DAY }),
      [recallId]: state({ itemId: recallId, repetitions: 3, dueAt: NOW - DAY }),
    };
    const sitting = buildParticleSitting({
      srsStates: states,
      particleDailyGoal: 12,
      now: NOW,
      shuffle: noShuffle,
      entries: [target],
    });
    expect(sitting.cards.map((card) => card.itemId)).toEqual([recallId]);
  });
});

describe('review ordering and caps', () => {
  function dueEntries(count: number) {
    const entries: ParticleVerbData[] = [];
    const states: Record<string, SrsState> = { ...readyBase('gå') };
    for (let i = 0; i < count; i++) {
      const id = `pv:review-${i}`;
      entries.push(entry({ id }));
      const itemId = particleItemId(id, 'cloze');
      // Later index = more overdue, so corpus order is the reverse of the
      // order the sitting should produce.
      states[itemId] = state({ itemId, repetitions: 3, dueAt: NOW - i * DAY });
    }
    return { entries, states };
  }

  it('serves the most overdue review first', () => {
    const { entries, states } = dueEntries(4);
    const sitting = buildParticleSitting({
      srsStates: states,
      particleDailyGoal: 12,
      now: NOW,
      shuffle: noShuffle,
      entries,
    });
    expect(sitting.cards.map((card) => card.entry.id)).toEqual([
      'pv:review-3',
      'pv:review-2',
      'pv:review-1',
      'pv:review-0',
    ]);
  });

  it('caps the served reviews at the daily goal while still reporting the true backlog', () => {
    const { entries, states } = dueEntries(20);
    const sitting = buildParticleSitting({
      srsStates: states,
      particleDailyGoal: 12,
      now: NOW,
      shuffle: noShuffle,
      entries,
    });
    expect(sitting.cards.filter((card) => card.countsTowardGoal)).toHaveLength(12);
    // The backlog is reported honestly even though only 12 are served, so
    // the new-card arithmetic sees the real pressure.
    expect(sitting.reviewsDue).toBe(20);
    expect(sitting.newAllowedToday).toBe(0);
  });

  it('never serves an item that is not yet due', () => {
    const target = entry({ id: 'pv:test-ut' });
    const clozeId = particleItemId(target.id, 'cloze');
    const states = {
      ...readyBase('gå'),
      // Below the recall unlock threshold on purpose, so the only thing that
      // could put a card in this sitting is the future-dated cloze itself.
      [clozeId]: state({ itemId: clozeId, repetitions: 1, dueAt: NOW + 5 * DAY }),
    };
    const sitting = buildParticleSitting({
      srsStates: states,
      particleDailyGoal: 12,
      now: NOW,
      shuffle: noShuffle,
      entries: [target],
    });
    expect(sitting.cards).toEqual([]);
  });
});

// Decision 2, rule 3 of docs/learning/2026-08-17-reflexive-only-verbs-and-entries-per-base.md:
// no two cards sharing a baseInfinitive may be adjacent within a sitting.
// separateSameBaseNeighbors (particleQueue.ts) is not exported; pinned here
// through buildParticleSitting's cards output, same as every other rule in
// this file.
describe('no-adjacent-same-base reordering within a sitting (decision 2, rule 3)', () => {
  function dueReviewFixture(entries: ParticleVerbData[]): Record<string, SrsState> {
    const states: Record<string, SrsState> = {};
    for (const e of entries) {
      const clozeId = particleItemId(e.id, 'cloze');
      states[clozeId] = state({ itemId: clozeId, repetitions: 3, dueAt: NOW - DAY });
    }
    return states;
  }

  it('never drops a due review to satisfy the rule, even when every due card shares one base', () => {
    // Five due reviews, one base, zero spacers: adjacency is unavoidable.
    // The rule reorders; it must not drop a card to get there.
    const entries = Array.from({ length: 5 }, (_, i) =>
      entry({
        id: `pv:ta-${i}`,
        baseInfinitive: 'ta',
        particle: `p${i}`,
        acceptedParticles: [`p${i}`],
      }),
    );
    const states = dueReviewFixture(entries);

    const sitting = buildParticleSitting({
      srsStates: states,
      particleDailyGoal: 60,
      now: NOW,
      shuffle: noShuffle,
      entries,
    });

    expect(sitting.cards).toHaveLength(5);
    expect(sitting.reviewsDue).toBe(5);
    expect(new Set(sitting.cards.map((card) => card.entry.id)).size).toBe(5);
  });

  it('minimizes same-base adjacency on a 6-ta + 3-other-base sitting: no more forced pairs than the 3 spacers cannot avoid', () => {
    // 6 same-base cards need 5 internal gaps to be fully separated; only 3
    // differently-based spacers exist, so at least 5 - 3 = 2 adjacent
    // same-base pairs are mathematically unavoidable. The reorder must not
    // produce more than that minimum.
    const taEntries = Array.from({ length: 6 }, (_, i) =>
      entry({
        id: `pv:ta-${i}`,
        baseInfinitive: 'ta',
        particle: `p${i}`,
        acceptedParticles: [`p${i}`],
      }),
    );
    const otherEntries = ['gå', 'komma', 'sätta'].map((base, i) =>
      entry({
        id: `pv:${base}-x`,
        baseInfinitive: base,
        particle: `q${i}`,
        acceptedParticles: [`q${i}`],
      }),
    );
    const entries = [...taEntries, ...otherEntries];
    const states = dueReviewFixture(entries);

    const sitting = buildParticleSitting({
      srsStates: states,
      particleDailyGoal: 60,
      now: NOW,
      shuffle: noShuffle,
      entries,
    });

    // Never drops: all 9 due reviews are present, unique.
    expect(sitting.cards).toHaveLength(9);
    expect(sitting.reviewsDue).toBe(9);
    expect(new Set(sitting.cards.map((card) => card.entry.id)).size).toBe(9);

    let adjacentSameBasePairs = 0;
    for (let i = 1; i < sitting.cards.length; i++) {
      if (sitting.cards[i]!.entry.baseInfinitive === sitting.cards[i - 1]!.entry.baseInfinitive) {
        adjacentSameBasePairs++;
      }
    }
    // Exactly the unavoidable minimum: never more (a regression in the
    // greedy separation), never fewer (impossible with only 3 spacers for 5
    // internal gaps, so a lower count would mean the count assertions above
    // were wrong, not that separation improved).
    expect(adjacentSameBasePairs).toBe(2);
  });
});

describe('countParticleReviewsDue', () => {
  it('counts due reviews and ignores introductions', () => {
    const target = entry({ id: 'pv:test-ut' });
    const clozeId = particleItemId(target.id, 'cloze');
    const brandNew = entry({
      id: 'pv:brand-new',
      baseInfinitive: 'ta',
      particle: 'med',
      acceptedParticles: ['med'],
    });
    const states = {
      ...readyBase('gå'),
      ...readyBase('ta'),
      [clozeId]: state({ itemId: clozeId, repetitions: 3, dueAt: NOW - DAY }),
    };
    expect(countParticleReviewsDue(states, NOW, [target, brandNew])).toBe(1);
  });

  it('is zero for a learner who has never opened the mode', () => {
    expect(countParticleReviewsDue({}, NOW, [entry({ id: 'pv:test-ut' })])).toBe(0);
  });
});

describe('free practice pool', () => {
  const target = entry({ id: 'pv:test-ut' });
  const clozeId = particleItemId(target.id, 'cloze');
  const recallId = particleItemId(target.id, 'recall');

  it('draws only items the learner has met that are not yet due', () => {
    const other = entry({ id: 'pv:other-ut', baseInfinitive: 'ta' });
    const otherCloze = particleItemId(other.id, 'cloze');
    const states = {
      ...readyBase('gå'),
      ...readyBase('ta'),
      [clozeId]: state({ itemId: clozeId, repetitions: 4, dueAt: NOW + 10 * DAY }),
      // Due, so it belongs in the scheduled queue, not the free pool.
      [otherCloze]: state({ itemId: otherCloze, repetitions: 4, dueAt: NOW - DAY }),
    };
    const pool = buildFreeParticlePractice(states, NOW, [target, other]);
    expect(pool.map((card) => card.itemId)).toEqual([clozeId]);
  });

  it('never counts a free card toward the goal', () => {
    const states = {
      ...readyBase('gå'),
      [clozeId]: state({ itemId: clozeId, repetitions: 4, dueAt: NOW + 10 * DAY }),
    };
    expect(buildFreeParticlePractice(states, NOW, [target]).every((c) => !c.countsTowardGoal)).toBe(
      true,
    );
  });

  it('serves at most one item per verb, nearest due first', () => {
    // Pairing a cloze with its own recall card makes the second card a
    // reading exercise, since the first one displayed the whole phrase.
    const states = {
      ...readyBase('gå'),
      [clozeId]: state({ itemId: clozeId, repetitions: 4, dueAt: NOW + 20 * DAY }),
      [recallId]: state({ itemId: recallId, repetitions: 3, dueAt: NOW + 5 * DAY }),
    };
    const pool = buildFreeParticlePractice(states, NOW, [target]);
    expect(pool.map((card) => card.itemId)).toEqual([recallId]);
  });

  it('is empty for a learner who has met nothing', () => {
    expect(buildFreeParticlePractice(readyBase('gå'), NOW, [target])).toEqual([]);
  });
});

describe('storage shape', () => {
  it('only ever reads and writes pv:-prefixed keys for particle items', () => {
    const target = entry({ id: 'pv:test-ut' });
    expect(particleItemId(target.id, 'cloze')).toBe('pv:test-ut:cloze');
    expect(particleItemId(target.id, 'recall')).toBe('pv:test-ut:recall');
    // Disjoint from the conjugation namespace, which is what makes the whole
    // feature additive: no version bump, no existing key touched.
    expect(particleItemId(target.id, 'cloze')).not.toMatch(/^\d+-/);
  });
});
