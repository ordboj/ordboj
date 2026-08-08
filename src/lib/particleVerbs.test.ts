import { describe, it, expect } from 'vitest';
import {
  findParticleVerb,
  getAcceptedParticlesDisclosure,
  getAcceptedRecallAnswers,
  getParticleCoreSense,
  getPhraseForms,
  getVerifiedParticleVerbs,
  hasRecallItem,
  isAcceptedParticle,
  isAcceptedRecall,
  renderCloze,
  renderLemma,
  renderReflexive,
  selectExample,
  type ReflexivePerson,
} from '@/lib/particleVerbs';
import { type ParticleVerbData } from '@/data/particleVerbData';

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
      { sv: 'På lördagar går de ut med sina vänner.', blankIndex: 4 },
    ],
    verified: true,
    ...overrides,
  };
}

describe('renderReflexive', () => {
  // The whole point of the helper: "sig" is correct in the third person and
  // wrong everywhere else. A learner who memorises the citation form says
  // *"jag hör av sig", so no rendering path may produce it.
  const expected: Array<[ReflexivePerson, string]> = [
    ['firstSingular', 'mig'],
    ['secondSingular', 'dig'],
    ['thirdSingular', 'sig'],
    ['firstPlural', 'oss'],
    ['secondPlural', 'er'],
    ['thirdPlural', 'sig'],
    ['imperativeSingular', 'dig'],
    ['imperativePlural', 'er'],
  ];

  it.each(expected)('renders %s as %s', (person, pronoun) => {
    expect(renderReflexive(person)).toBe(pronoun);
  });

  it('uses the second person for the imperative, because it addresses the listener', () => {
    expect(renderReflexive('imperativeSingular')).toBe(renderReflexive('secondSingular'));
    expect(renderReflexive('imperativePlural')).toBe(renderReflexive('secondPlural'));
  });
});

describe('renderLemma', () => {
  it('substitutes the placeholder after the particle for höra av sig', () => {
    const reflexive = entry({
      id: 'pv:hora-av-sig',
      baseInfinitive: 'höra',
      particle: 'av',
      acceptedParticles: ['av'],
      reflexive: 'afterParticle',
      lemma: 'höra av {refl}',
    });
    expect(renderLemma(reflexive, 'firstSingular')).toBe('höra av mig');
    expect(renderLemma(reflexive, 'secondSingular')).toBe('höra av dig');
    expect(renderLemma(reflexive, 'firstPlural')).toBe('höra av oss');
    expect(renderLemma(reflexive)).toBe('höra av sig');
  });

  it('substitutes the placeholder before the particle for ge sig av', () => {
    const reflexive = entry({
      id: 'pv:ge-sig-av',
      baseInfinitive: 'ge',
      particle: 'av',
      acceptedParticles: ['av'],
      reflexive: 'beforeParticle',
      lemma: 'ge {refl} av',
    });
    expect(renderLemma(reflexive, 'firstPlural')).toBe('ge oss av');
    expect(renderLemma(reflexive, 'secondSingular')).toBe('ge dig av');
    expect(renderLemma(reflexive)).toBe('ge sig av');
  });

  it('leaves a non-reflexive lemma untouched in every person', () => {
    const plain = entry({ id: 'pv:ga-ut' });
    expect(renderLemma(plain, 'firstSingular')).toBe('gå ut');
    expect(renderLemma(plain, 'thirdPlural')).toBe('gå ut');
  });

  it('never leaves an unsubstituted placeholder in any shipped entry', () => {
    for (const shipped of getVerifiedParticleVerbs()) {
      expect(renderLemma(shipped)).not.toContain('{refl}');
    }
  });
});

describe('cloze grading', () => {
  it('accepts the primary particle', () => {
    expect(isAcceptedParticle(entry({ id: 'pv:ga-ut' }), 'ut')).toBe(true);
  });

  it('normalizes case and surrounding whitespace, and nothing else', () => {
    const target = entry({ id: 'pv:ga-ut' });
    expect(isAcceptedParticle(target, '  UT ')).toBe(true);
    expect(isAcceptedParticle(target, 'Ut')).toBe(true);
  });

  it('does not fold diacritics: "over" is not "över"', () => {
    // Normalization is lowercase and trim only (alternate-answers P2).
    // Accepting "over" would tell the learner ö and o are interchangeable.
    const over = entry({ id: 'pv:ga-over', particle: 'över', acceptedParticles: ['över'] });
    expect(isAcceptedParticle(over, 'över')).toBe(true);
    expect(isAcceptedParticle(over, 'over')).toBe(false);
  });

  it('accepts every listed alternative when a frame is genuinely ambiguous', () => {
    // skriva ner / ned / upp all mean "note down" in these frames. Marking
    // any of them wrong would be marking correct Swedish wrong.
    const skrivaNer = findParticleVerb('pv:skriva-ner');
    expect(skrivaNer).toBeDefined();
    for (const particle of ['ner', 'ned', 'upp']) {
      expect(isAcceptedParticle(skrivaNer!, particle)).toBe(true);
    }
    expect(isAcceptedParticle(skrivaNer!, 'bort')).toBe(false);
  });

  it('rejects a wrong particle and an empty answer', () => {
    const target = entry({ id: 'pv:ga-ut' });
    expect(isAcceptedParticle(target, 'in')).toBe(false);
    expect(isAcceptedParticle(target, '')).toBe(false);
  });
});

describe('recall grading', () => {
  it('accepts the rendered lemma', () => {
    expect(isAcceptedRecall(entry({ id: 'pv:ga-ut' }), 'gå ut')).toBe(true);
  });

  it('accepts an optional leading "att"', () => {
    expect(isAcceptedRecall(entry({ id: 'pv:ga-ut' }), 'att gå ut')).toBe(true);
  });

  it('collapses runs of internal whitespace, which are typos not answers', () => {
    expect(isAcceptedRecall(entry({ id: 'pv:ga-ut' }), 'gå   ut')).toBe(true);
  });

  it('accepts every listed phrase when the gloss cannot select just one', () => {
    const skrivaNer = findParticleVerb('pv:skriva-ner')!;
    expect(getAcceptedRecallAnswers(skrivaNer)).toEqual(['skriva ner', 'skriva ned', 'skriva upp']);
    expect(isAcceptedRecall(skrivaNer, 'skriva upp')).toBe(true);
    expect(isAcceptedRecall(skrivaNer, 'skriva ned')).toBe(true);
  });

  it('rejects the base verb alone and the wrong particle', () => {
    const target = entry({ id: 'pv:ga-ut' });
    expect(isAcceptedRecall(target, 'gå')).toBe(false);
    expect(isAcceptedRecall(target, 'gå in')).toBe(false);
  });

  it('defaults the accepted set to the lemma when no override is given', () => {
    expect(getAcceptedRecallAnswers(entry({ id: 'pv:ga-ut' }))).toEqual(['gå ut']);
  });
});

describe('accepted-answer disclosure', () => {
  it('says nothing when there is only one accepted particle', () => {
    expect(getAcceptedParticlesDisclosure(entry({ id: 'pv:ga-ut' }))).toBeNull();
  });

  it('names both when there are two', () => {
    const both = entry({ id: 'pv:ga-ner', particle: 'ner', acceptedParticles: ['ner', 'ned'] });
    expect(getAcceptedParticlesDisclosure(both)).toBe('Both ner and ned are correct here.');
  });

  it('names all of them when there are three, without an empty slot', () => {
    // The 3+ branch exists so a third accepted form cannot silently produce
    // "ner, ned and are correct".
    const three = findParticleVerb('pv:skriva-ner')!;
    expect(getAcceptedParticlesDisclosure(three)).toBe('ner, ned and upp are all correct here.');
  });
});

describe('cloze rendering', () => {
  it('splits the sentence around the blanked token', () => {
    const rendered = renderCloze({
      sv: 'Vi går ut och äter middag varje fredag.',
      blankIndex: 2,
    });
    expect(rendered.before).toEqual(['Vi', 'går']);
    expect(rendered.answer).toBe('ut');
    expect(rendered.after).toEqual(['och', 'äter', 'middag', 'varje', 'fredag.']);
  });

  it('blanks the trailing particle in a split word order, not the adjective', () => {
    // "Du ser trött ut" is where Swedish word order differs most from
    // English, and where an implicit "find the particle" search would be
    // most tempting to get wrong.
    const seUt = findParticleVerb('pv:se-ut')!;
    const rendered = renderCloze(seUt.examples[0]);
    expect(rendered.answer).toBe('ut');
    expect(rendered.before).toEqual(['Du', 'ser', 'trött']);
  });

  it('reassembles into the original sentence', () => {
    for (const shipped of getVerifiedParticleVerbs()) {
      for (const example of shipped.examples) {
        const rendered = renderCloze(example);
        expect([...rendered.before, rendered.answer, ...rendered.after].join(' ')).toBe(example.sv);
      }
    }
  });
});

describe('frame rotation', () => {
  it('rotates deterministically through the frames by repetition count', () => {
    const target = entry({ id: 'pv:ga-ut' });
    expect(selectExample(target, 0).sv).toBe(target.examples[0].sv);
    expect(selectExample(target, 1).sv).toBe(target.examples[1].sv);
    expect(selectExample(target, 2).sv).toBe(target.examples[2].sv);
    // Wraps rather than running off the end.
    expect(selectExample(target, 3).sv).toBe(target.examples[0].sv);
    expect(selectExample(target, 99).sv).toBe(target.examples[99 % 3].sv);
  });

  it('always returns a frame for every shipped entry at any repetition count', () => {
    for (const shipped of getVerifiedParticleVerbs()) {
      for (const repetitions of [0, 1, 2, 7, 40]) {
        expect(selectExample(shipped, repetitions)).toBeDefined();
      }
    }
  });
});

describe('the four-form reference line', () => {
  it('appends the particle to each of the base verb human-verified forms', () => {
    // Nothing is derived by rule: the base forms come from VERB_DATA.
    const gaUt = findParticleVerb('pv:ga-ut')!;
    expect(getPhraseForms(gaUt)).toEqual({
      infinitive: 'gå ut',
      presens: 'går ut',
      preteritum: 'gick ut',
      supinum: 'gått ut',
    });
  });

  it('keeps the reflexive pronoun in place across all four forms', () => {
    const horaAvSig = findParticleVerb('pv:hora-av-sig')!;
    expect(getPhraseForms(horaAvSig)).toEqual({
      infinitive: 'höra av sig',
      presens: 'hör av sig',
      preteritum: 'hörde av sig',
      supinum: 'hört av sig',
    });
  });

  it('handles a reflexive whose pronoun precedes the particle', () => {
    const geSigAv = findParticleVerb('pv:ge-sig-av')!;
    expect(getPhraseForms(geSigAv)).toEqual({
      infinitive: 'ge sig av',
      presens: 'ger sig av',
      preteritum: 'gav sig av',
      supinum: 'gett sig av',
    });
  });

  it('returns null rather than a guess when the base verb is not in VERB_DATA', () => {
    // Regression fixture for #262: previously this asserted against a real
    // verified:false PARTICLE_VERB_DATA entry (its base was missing from
    // VERB_DATA). #262 appended all six such bases to VERB_DATA and flipped
    // their entries to verified:true, so no orphan remains in the shipped
    // data. The contract getPhraseForms must uphold — never guess a form for
    // an unresolvable base — still needs a fixture, so this constructs one
    // directly with a baseInfinitive guaranteed absent from VERB_DATA.
    const orphan = entry({ id: 'pv:test-orphan', baseInfinitive: 'zzznotarealverb' });
    expect(getPhraseForms(orphan)).toBeNull();
  });

  it('produces a form line for every shipped entry', () => {
    for (const shipped of getVerifiedParticleVerbs()) {
      expect(getPhraseForms(shipped)).not.toBeNull();
    }
  });
});

describe('particle core-sense lines', () => {
  it('hedges rather than asserting a rule', () => {
    // A particle verb's meaning is not reliably compositional; the copy must
    // not claim otherwise.
    expect(getParticleCoreSense('upp')).toContain('often');
  });

  it('returns null for a particle with no confident line, rather than inventing one', () => {
    expect(getParticleCoreSense('zzz')).toBeNull();
  });

  it('has a line for every particle that actually ships', () => {
    const missing = getVerifiedParticleVerbs()
      .filter((shipped) => getParticleCoreSense(shipped.particle) === null)
      .map((shipped) => shipped.particle);
    expect(missing).toEqual([]);
  });
});

describe('recall eligibility', () => {
  it('excludes reflexives and includes everything else', () => {
    for (const shipped of getVerifiedParticleVerbs()) {
      expect(hasRecallItem(shipped)).toBe(shipped.reflexive === 'none');
    }
  });
});
