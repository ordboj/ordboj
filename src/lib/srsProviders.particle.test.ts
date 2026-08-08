import { describe, it, expect, vi } from 'vitest';
import { createParticleProvider } from '@/lib/srsProviders';
import { conjugationItemId, particleItemId } from '@/lib/itemIds';
import { verbs } from '@/lib/verbs';
import { PARTICLE_VERB_DATA } from '@/data/particleVerbData';
import { getVerifiedParticleVerbs } from '@/lib/particleVerbs';
import type { SrsState } from '@/lib/srs';

// #262 flipped every previously-drafted verified:false entry to verified:true
// (their base verbs were appended to VERB_DATA), so the shipped
// PARTICLE_VERB_DATA no longer contains an unverified entry to exercise the
// "never enumerates an unverified entry" gate against. That gate is still a
// real contract (src/lib/srsProviders.ts enumerates via
// getVerifiedParticleVerbs(), which filters on `verified`), so this mocks
// the content module — a boundary this suite does not own the correctness
// of, not the module under test — to inject one unverified fixture entry
// back in for the duration of this file only.
vi.mock('@/data/particleVerbData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/data/particleVerbData')>();
  return {
    ...actual,
    PARTICLE_VERB_DATA: [
      ...actual.PARTICLE_VERB_DATA,
      {
        ...actual.PARTICLE_VERB_DATA[0],
        id: 'pv:test-unverified-fixture',
        baseInfinitive: 'tycka',
        verified: false,
        unverifiedReason: 'test fixture for the enumeration-gate regression test',
      },
    ],
  };
});

const NOW = new Date('2026-04-01T09:00:00.000Z').getTime();

function state(itemId: string, overrides: Partial<SrsState> = {}): SrsState {
  return {
    itemId,
    repetitions: 3,
    intervalDays: 10,
    easeFactor: 2.5,
    dueAt: NOW,
    ...overrides,
  };
}

function readyBase(infinitive: string): Record<string, SrsState> {
  const verbId = verbs.find((verb) => verb.infinitive === infinitive)!.id;
  const out: Record<string, SrsState> = {};
  for (const form of ['presens', 'preteritum'] as const) {
    const itemId = conjugationItemId(verbId, form);
    out[itemId] = state(itemId, { repetitions: 2 });
  }
  return out;
}

describe('particle provider', () => {
  it('initializes nothing eagerly', async () => {
    // The emptiness is the feature: eagerly creating ~80 items would make
    // every one of them due on release day.
    expect(await createParticleProvider({}).listEagerInitIds()).toEqual([]);
  });

  it('reports no available items for a learner with no particle state', async () => {
    const provider = createParticleProvider({});
    expect(await provider.listAvailableItems()).toEqual([]);
  });

  it('reports an item once its state exists', async () => {
    const clozeId = particleItemId('pv:tycka-om', 'cloze');
    const states = { [clozeId]: state(clozeId) };
    const items = await createParticleProvider(states).listAvailableItems();
    expect(items.map((item) => item.itemId)).toEqual([clozeId]);
    expect(items[0]!.kind).toBe('cloze');
    expect(items[0]!.particleVerbId).toBe('pv:tycka-om');
  });

  it('never enumerates an unverified entry, even with state present', async () => {
    // The verified gate has to hold at the enumeration boundary, not only in
    // the accessor: this is what stops drafted content reaching a learner.
    const unverified = PARTICLE_VERB_DATA.find((candidate) => !candidate.verified)!;
    const clozeId = particleItemId(unverified.id, 'cloze');
    const states = {
      ...readyBase('gå'),
      ...readyBase('tycka'),
      [clozeId]: state(clozeId),
    };
    const items = await createParticleProvider(states).listAvailableItems();
    expect(items.map((item) => item.particleVerbId)).not.toContain(unverified.id);
  });

  it('never enumerates a recall item for a reflexive verb', async () => {
    const recallId = particleItemId('pv:hora-av-sig', 'recall');
    const clozeId = particleItemId('pv:hora-av-sig', 'cloze');
    const states = {
      ...readyBase('höra'),
      [clozeId]: state(clozeId),
      // Even if a stray recall key existed, it is not this verb's to serve.
      [recallId]: state(recallId),
    };
    const items = await createParticleProvider(states).listAvailableItems();
    expect(items.map((item) => item.itemId)).toEqual([clozeId]);
  });

  it('enumerates both kinds for a non-reflexive verb that has both', async () => {
    const clozeId = particleItemId('pv:tycka-om', 'cloze');
    const recallId = particleItemId('pv:tycka-om', 'recall');
    const states = {
      ...readyBase('tycka'),
      [clozeId]: state(clozeId),
      [recallId]: state(recallId),
    };
    const items = await createParticleProvider(states).listAvailableItems();
    expect(items.map((item) => item.kind).sort()).toEqual(['cloze', 'recall']);
  });

  it('only ever produces pv:-prefixed ids', async () => {
    const states: Record<string, SrsState> = {};
    for (const entry of getVerifiedParticleVerbs()) {
      Object.assign(states, readyBase(entry.baseInfinitive));
      const clozeId = particleItemId(entry.id, 'cloze');
      states[clozeId] = state(clozeId);
    }
    const items = await createParticleProvider(states).listAvailableItems();
    expect(items.length).toBe(getVerifiedParticleVerbs().length);
    expect(items.every((item) => item.itemId.startsWith('pv:'))).toBe(true);
  });
});
