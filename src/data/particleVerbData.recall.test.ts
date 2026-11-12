import { describe, expect, it } from 'vitest';
import { PARTICLE_VERB_DATA } from './particleVerbData';
import {
  getAcceptedRecallAnswers,
  getVerifiedParticleVerbs,
  isAcceptedRecall,
} from '@/lib/particleVerbs';

// ORD-125: near-duplicate particle entries must leave exactly one defensible
// recall answer per gloss, or list every defensible phrase (own lemma first).

const byId = (id: string) => {
  const entry = PARTICLE_VERB_DATA.find((e) => e.id === id);
  if (!entry) throw new Error(`missing entry ${id}`);
  return entry;
};

// [id, particle, acceptedParticles, acceptedRecall]
const PAIRS: ReadonlyArray<readonly [string, string, readonly string[], readonly string[]]> = [
  ['pv:ga-in', 'in', ['in'], ['gå in', 'komma in']],
  ['pv:komma-in', 'in', ['in'], ['komma in', 'gå in']],
  ['pv:komma-upp', 'upp', ['upp'], ['komma upp', 'gå upp']],
  ['pv:ga-upp-stiga', 'upp', ['upp'], ['gå upp', 'komma upp']],
  ['pv:plocka-bort-lista', 'bort', ['bort'], ['plocka bort', 'ta bort']],
  ['pv:lamna-in', 'in', ['in'], ['lämna in', 'skicka in']],
  ['pv:skicka-in', 'in', ['in'], ['skicka in', 'lämna in']],
  ['pv:sla-in', 'in', ['in'], ['slå in', 'packa in']],
  ['pv:packa-in', 'in', ['in'], ['packa in', 'slå in']],
  ['pv:aka-bort', 'bort', ['bort'], ['åka bort', 'resa bort']],
  ['pv:resa-bort', 'bort', ['bort'], ['resa bort', 'åka bort']],
  ['pv:plocka-ihop', 'ihop', ['ihop'], ['plocka ihop', 'samla ihop']],
  ['pv:samla-ihop', 'ihop', ['ihop'], ['samla ihop', 'plocka ihop']],
  ['pv:lamna-tillbaka', 'tillbaka', ['tillbaka'], ['lämna tillbaka', 'ge tillbaka']],
  ['pv:ge-tillbaka', 'tillbaka', ['tillbaka'], ['ge tillbaka', 'lämna tillbaka']],
  ['pv:tala-om', 'om', ['om'], ['tala om', 'säga till']],
  ['pv:saga-till', 'till', ['till'], ['säga till', 'tala om']],
  ['pv:veta-om', 'om', ['om'], ['veta om', 'känna till']],
  ['pv:kanna-till', 'till', ['till'], ['känna till', 'veta om']],
];

describe('ORD-125 sharpened glosses', () => {
  it('pv:ta-bort names an unwanted physical object', () => {
    expect(byId('pv:ta-bort').gloss.en).toBe('to remove an unwanted object from a place');
  });
  it('pv:skicka-ut names a large group of recipients', () => {
    expect(byId('pv:skicka-ut').gloss.en).toBe('to send something to a large group of recipients');
  });
});

describe('ORD-125 cross-listed recall alternatives', () => {
  it.each(PAIRS)('%s lists its phrases with own lemma first', (id, _p, _a, recall) => {
    const entry = byId(id);
    expect(entry.acceptedRecall).toEqual(recall);
    expect(entry.acceptedRecall![0]).toBe(entry.lemma);
  });

  it.each(PAIRS)(
    '%s grader accepts every listed phrase, rejects unrelated',
    (id, _p, _a, recall) => {
      const entry = byId(id);
      for (const phrase of recall) {
        expect(isAcceptedRecall(entry, phrase)).toBe(true);
        expect(isAcceptedRecall(entry, `  ${phrase.toUpperCase()}  `)).toBe(true);
      }
      expect(getAcceptedRecallAnswers(entry)).toEqual(recall);
      expect(isAcceptedRecall(entry, 'äta upp')).toBe(false);
      expect(isAcceptedRecall(entry, 'ta med')).toBe(false);
    },
  );

  it('plocka-bort-lista accepts ta bort, but ta-bort itself is not widened', () => {
    expect(isAcceptedRecall(byId('pv:plocka-bort-lista'), 'ta bort')).toBe(true);
    expect(byId('pv:ta-bort').acceptedRecall).toBeUndefined();
    expect(isAcceptedRecall(byId('pv:ta-bort'), 'plocka bort')).toBe(false);
  });

  it('does not accept sibling lemmas that were not cross-listed', () => {
    expect(isAcceptedRecall(byId('pv:ga-in'), 'lämna in')).toBe(false);
    expect(isAcceptedRecall(byId('pv:lamna-in'), 'slå in')).toBe(false);
    expect(isAcceptedRecall(byId('pv:komma-in-antagning'), 'gå in')).toBe(false);
  });
});

describe('ORD-125 graded cloze answers unchanged (guard)', () => {
  it.each(PAIRS)('%s keeps particle and acceptedParticles', (id, particle, accepted) => {
    const entry = byId(id);
    expect(entry.particle).toBe(particle);
    expect(entry.acceptedParticles).toEqual(accepted);
  });
  it('ta-bort and skicka-ut keep particle/acceptedParticles', () => {
    expect(byId('pv:ta-bort').acceptedParticles).toEqual(['bort']);
    expect(byId('pv:skicka-ut').acceptedParticles).toEqual(['ut']);
  });
});

describe('recall gloss uniqueness (guard)', () => {
  it('no two verified entries share an identical English gloss', () => {
    const seen = new Map<string, string>();
    const dupes: string[] = [];
    for (const e of getVerifiedParticleVerbs()) {
      const key = e.gloss.en.trim().toLowerCase();
      const prior = seen.get(key);
      if (prior) dupes.push(`${prior} / ${e.id}: ${key}`);
      else seen.set(key, e.id);
    }
    expect(dupes).toEqual([]);
  });
});
