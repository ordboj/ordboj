import { describe, it, expect } from 'vitest';
import {
  buildFreeParticlePractice,
  buildParticleSitting,
  countParticleReviewsDue,
  isBaseRecentlyUsed,
  isBaseVerbReady,
  particleNewAllowedToday,
  particleNewCardsPerDay,
  MAX_NEW_PER_PARTICLE_PER_SITTING,
} from '@/lib/particleQueue';
import { conjugationItemId, particleItemId } from '@/lib/itemIds';
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

describe('base verb eligibility gate', () => {
  const target = entry({ id: 'pv:test-ut' });

  it('rejects a base verb with no conjugation progress', () => {
    expect(isBaseVerbReady(target, {})).toBe(false);
  });

  it('rejects a base verb known in presens only', () => {
    const verbId = verbs.find((verb) => verb.infinitive === 'gå')!.id;
    const presens = conjugationItemId(verbId, 'presens');
    expect(isBaseVerbReady(target, { [presens]: state({ itemId: presens, repetitions: 5 }) })).toBe(
      false,
    );
  });

  it('accepts a base verb at repetitions 2 on both forms', () => {
    expect(isBaseVerbReady(target, readyBase('gå'))).toBe(true);
  });

  it('rejects a base verb that is not in VERB_DATA at all', () => {
    // This is the dead-content case the dataset test refuses to let ship.
    const orphan = entry({ id: 'pv:orphan', baseInfinitive: 'stänga' });
    expect(isBaseVerbReady(orphan, readyBase('gå'))).toBe(false);
  });

  it('keeps an ineligible verb out of the sitting entirely', () => {
    const sitting = buildParticleSitting({
      srsStates: {},
      particleDailyGoal: 12,
      now: NOW,
      shuffle: noShuffle,
      entries: [target],
    });
    expect(sitting.cards).toEqual([]);
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
    expect(sitting.cards[0].kind).toBe('introduction');
    expect(sitting.cards[0].entry.id).toBe('pv:new-one');
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

  it('holds a sibling back while the first one is still young', () => {
    // bygga upp / bygga ut is the interference case; here it is gå ut / gå in.
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

  it('releases the sibling once the first one is about a week old', () => {
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
    expect(sitting.cards[sitting.cards.length - 1].entry.id).toBe('pv:new-one');
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
    expect(sitting.cards[sitting.cards.length - 1].kind).toBe('cloze');
  });

  it('defers the first cloze when fewer than two items would intervene', () => {
    // An adjacent reveal-then-ask is a familiarity check, not a retrieval,
    // and would report a success the learner did not earn.
    const sitting = sittingWithReviews(1, 12);
    expect(sitting.deferredFirstClozes).toEqual(['pv:new-one']);
    expect(sitting.cards.filter((card) => card.kind === 'cloze')).toHaveLength(1);
    expect(sitting.cards.filter((card) => card.kind === 'cloze')[0].entry.id).toBe('pv:review-0');
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
    expect(sitting.cards[0].itemId).toBe(recallId);
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
    expect(sitting.cards[0].itemId).toBe(clozeId);
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
