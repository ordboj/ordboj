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

// [id, particle, acceptedParticles, acceptedRecall | undefined, own phrase]
// undefined acceptedRecall means "no widening": only the entry's own phrase.
type Row = readonly [string, string, readonly string[], readonly string[] | undefined, string];
const PAIRS: ReadonlyArray<Row> = [
  ['pv:ga-in', 'in', ['in'], ['gå in', 'komma in'], 'gå in'],
  ['pv:komma-in', 'in', ['in'], ['komma in', 'gå in'], 'komma in'],
  ['pv:komma-upp', 'upp', ['upp'], undefined, 'komma upp'],
  ['pv:ga-upp-stiga', 'upp', ['upp'], undefined, 'gå upp'],
  ['pv:plocka-bort-lista', 'bort', ['bort'], ['plocka bort', 'ta bort'], 'plocka bort'],
  ['pv:lamna-in', 'in', ['in'], undefined, 'lämna in'],
  ['pv:skicka-in', 'in', ['in'], undefined, 'skicka in'],
  ['pv:sla-in', 'in', ['in'], ['slå in', 'packa in'], 'slå in'],
  ['pv:packa-in', 'in', ['in'], ['packa in'], 'packa in'],
  ['pv:aka-bort', 'bort', ['bort'], ['åka bort', 'resa bort'], 'åka bort'],
  ['pv:resa-bort', 'bort', ['bort'], ['resa bort', 'åka bort'], 'resa bort'],
  ['pv:plocka-ihop', 'ihop', ['ihop'], ['plocka ihop', 'samla ihop'], 'plocka ihop'],
  ['pv:samla-ihop', 'ihop', ['ihop'], ['samla ihop', 'plocka ihop'], 'samla ihop'],
  [
    'pv:lamna-tillbaka',
    'tillbaka',
    ['tillbaka'],
    ['lämna tillbaka', 'ge tillbaka'],
    'lämna tillbaka',
  ],
  ['pv:ge-tillbaka', 'tillbaka', ['tillbaka'], ['ge tillbaka', 'lämna tillbaka'], 'ge tillbaka'],
  ['pv:tala-om', 'om', ['om'], ['tala om'], 'tala om'],
  ['pv:saga-till', 'till', ['till'], ['säga till', 'tala om'], 'säga till'],
  ['pv:veta-om', 'om', ['om'], undefined, 'veta om'],
  ['pv:kanna-till', 'till', ['till'], undefined, 'känna till'],
];

describe('ORD-125 sharpened glosses', () => {
  it('pv:ta-bort names an unwanted physical object', () => {
    expect(byId('pv:ta-bort').gloss.en).toBe('to clear a place of whatever covers or fills it');
  });
  it('pv:skicka-ut names a large group of recipients', () => {
    expect(byId('pv:skicka-ut').gloss.en).toBe('to send something to a large group of recipients');
  });
  it('pv:komma-upp names arriving at the top, the stage or the surface', () => {
    expect(byId('pv:komma-upp').gloss.en).toBe('to arrive at the top, the stage or the surface');
  });
  it('pv:lamna-in is a personal hand-over at an office', () => {
    expect(byId('pv:lamna-in').gloss.en).toBe(
      'to hand over a document or application personally at an office',
    );
  });
  it('pv:skicka-in is sending off by post or online', () => {
    expect(byId('pv:skicka-in').gloss.en).toBe(
      'to send off a form or an application by post or online',
    );
  });
  it('pv:ga-in and pv:komma-in glosses are unchanged', () => {
    expect(byId('pv:ga-in').gloss.en).toBe('to enter a room or building');
    expect(byId('pv:komma-in').gloss.en).toBe('to enter');
  });
});

describe('ORD-125 cross-listed recall alternatives', () => {
  it.each(PAIRS)('%s lists its phrases with own lemma first', (id, _p, _a, recall, own) => {
    const entry = byId(id);
    expect(entry.acceptedRecall).toEqual(recall);
    if (recall) expect(entry.acceptedRecall![0]).toBe(entry.lemma);
    expect(entry.lemma).toBe(own);
  });

  it.each(PAIRS)(
    '%s grader accepts every listed phrase, rejects unrelated',
    (id, _p, _a, recall, own) => {
      const entry = byId(id);
      const expected = recall ?? [own];
      for (const phrase of expected) {
        expect(isAcceptedRecall(entry, phrase)).toBe(true);
        expect(isAcceptedRecall(entry, `  ${phrase.toUpperCase()}  `)).toBe(true);
      }
      expect(getAcceptedRecallAnswers(entry)).toEqual(expected);
      expect(isAcceptedRecall(entry, 'äta upp')).toBe(false);
      expect(isAcceptedRecall(entry, 'ta med')).toBe(false);
    },
  );

  it('entries without acceptedRecall leave it undefined', () => {
    for (const id of [
      'pv:kanna-till',
      'pv:veta-om',
      'pv:komma-upp',
      'pv:ga-upp-stiga',
      'pv:lamna-in',
      'pv:skicka-in',
    ]) {
      expect(byId(id).acceptedRecall).toBeUndefined();
    }
  });

  it('plocka-bort-lista accepts ta bort, but ta-bort itself is not widened', () => {
    expect(isAcceptedRecall(byId('pv:plocka-bort-lista'), 'ta bort')).toBe(true);
    expect(byId('pv:ta-bort').acceptedRecall).toBeUndefined();
    expect(isAcceptedRecall(byId('pv:ta-bort'), 'plocka bort')).toBe(false);
  });

  it('keeps the one-way survivors', () => {
    expect(isAcceptedRecall(byId('pv:sla-in'), 'packa in')).toBe(true);
    expect(isAcceptedRecall(byId('pv:saga-till'), 'tala om')).toBe(true);
  });

  it.each([
    ['pv:packa-in', 'slå in'],
    ['pv:tala-om', 'säga till'],
    ['pv:kanna-till', 'veta om'],
    ['pv:veta-om', 'känna till'],
    ['pv:komma-upp', 'gå upp'],
    ['pv:ga-upp-stiga', 'komma upp'],
    ['pv:lamna-in', 'skicka in'],
    ['pv:skicka-in', 'lämna in'],
  ])('removed pair: %s does NOT accept %s', (id, phrase) => {
    expect(isAcceptedRecall(byId(id), phrase)).toBe(false);
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
