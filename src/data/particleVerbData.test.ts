import { describe, it, expect } from 'vitest';
import { PARTICLE_VERB_DATA } from '@/data/particleVerbData';
import { VERB_DATA } from '@/data/verbData';
import { getVerifiedParticleVerbs, renderLemma } from '@/lib/particleVerbs';
import { PARTICLE_ID_PREFIX } from '@/lib/itemIds';

const VERIFIED = PARTICLE_VERB_DATA.filter((entry) => entry.verified);
const BASE_INFINITIVES = new Set(VERB_DATA.map((verb) => verb.infinitive));

describe('particle verb dataset - ids', () => {
  it('has no duplicate ids', () => {
    const ids = PARTICLE_VERB_DATA.map((entry) => entry.id);
    const duplicated = ids.filter((id, index) => ids.indexOf(id) !== index);
    expect(duplicated).toEqual([]);
  });

  it('uses only ASCII-folded slugs', () => {
    // Ids become localStorage keys. Swedish letters would put å/ä/ö in a key
    // that a browser or an export/import round trip may normalize to a
    // different Unicode form (NFC vs NFD), which silently orphans the
    // progress stored under the other spelling. Display strings keep their
    // diacritics; ids never do.
    const offenders = PARTICLE_VERB_DATA.filter(
      (entry) => !/^pv:[a-z0-9]+(-[a-z0-9]+)*$/.test(entry.id),
    );
    expect(offenders.map((entry) => entry.id)).toEqual([]);
  });

  it('puts every id in the pv: namespace, disjoint from conjugation keys', () => {
    // Disjointness is what makes the whole feature additive to the progress
    // store: conjugation keys are `<digits>-<form>`.
    for (const entry of PARTICLE_VERB_DATA) {
      expect(entry.id.startsWith(PARTICLE_ID_PREFIX)).toBe(true);
      expect(/^\d+-/.test(entry.id)).toBe(false);
    }
  });
});

describe('particle verb dataset - the verified gate', () => {
  it('ships a starter set of roughly forty entries', () => {
    expect(VERIFIED.length).toBeGreaterThanOrEqual(40);
  });

  it('resolves every verified entry base verb in VERB_DATA', () => {
    // The introduction gate joins on the base verb's conjugation progress.
    // An unresolvable base is not a cosmetic defect: it is content no
    // learner can ever reach, sitting in the dataset looking shipped.
    const unresolvable = VERIFIED.filter((entry) => !BASE_INFINITIVES.has(entry.baseInfinitive));
    expect(unresolvable.map((entry) => `${entry.id} -> ${entry.baseInfinitive}`)).toEqual([]);
  });

  it('marks every entry with an unresolvable base as unverified', () => {
    // The contrapositive of the rule above, stated so that the fix for a
    // missing base is never "quietly ship it anyway".
    const wronglyVerified = PARTICLE_VERB_DATA.filter(
      (entry) => !BASE_INFINITIVES.has(entry.baseInfinitive) && entry.verified,
    );
    expect(wronglyVerified.map((entry) => entry.id)).toEqual([]);
  });

  it('gives every unverified entry a stated reason', () => {
    const unexplained = PARTICLE_VERB_DATA.filter(
      (entry) => !entry.verified && !entry.unverifiedReason?.trim(),
    );
    expect(unexplained.map((entry) => entry.id)).toEqual([]);
  });

  it('never exposes an unverified entry through the shipping accessor', () => {
    expect(getVerifiedParticleVerbs().every((entry) => entry.verified)).toBe(true);
    expect(getVerifiedParticleVerbs().length).toBe(VERIFIED.length);
  });
});

describe('particle verb dataset - answers', () => {
  it('lists the entry particle first in acceptedParticles', () => {
    // What the card displays as the answer and what it grades against are
    // the same string, by construction.
    for (const entry of PARTICLE_VERB_DATA) {
      expect(entry.acceptedParticles[0]).toBe(entry.particle);
    }
  });

  it('never has an empty or duplicated accepted set', () => {
    for (const entry of PARTICLE_VERB_DATA) {
      expect(entry.acceptedParticles.length).toBeGreaterThan(0);
      expect(new Set(entry.acceptedParticles).size).toBe(entry.acceptedParticles.length);
    }
  });

  it('includes the primary lemma when an entry overrides accepted recall answers', () => {
    for (const entry of PARTICLE_VERB_DATA) {
      if (!entry.acceptedRecall) continue;
      expect(entry.acceptedRecall[0]).toBe(renderLemma(entry));
    }
  });
});

describe('particle verb dataset - sentences', () => {
  it('gives every verified entry at least two frames', () => {
    // One frame per entry teaches the sentence rather than the verb.
    const thin = VERIFIED.filter((entry) => entry.examples.length < 2);
    expect(thin.map((entry) => entry.id)).toEqual([]);
  });

  it('blanks a token that is actually an accepted answer', () => {
    // The single most damaging data defect available here: an off-by-one
    // blankIndex would ask the learner to supply a word that is not the
    // particle and mark their correct particle wrong.
    const mismatches: string[] = [];
    for (const entry of PARTICLE_VERB_DATA) {
      for (const example of entry.examples) {
        const tokens = example.sv.split(' ');
        const blanked = tokens[example.blankIndex];
        const accepted = entry.acceptedParticles.map((particle) => particle.toLowerCase());
        if (blanked === undefined || !accepted.includes(blanked.toLowerCase())) {
          mismatches.push(
            `${entry.id}: index ${example.blankIndex} of "${example.sv}" is "${blanked}"`,
          );
        }
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('keeps every frame within the 6-10 word band', () => {
    const outOfBand: string[] = [];
    for (const entry of VERIFIED) {
      for (const example of entry.examples) {
        const words = example.sv.split(' ').length;
        if (words < 6 || words > 10) {
          outOfBand.push(`${entry.id}: ${words} words - "${example.sv}"`);
        }
      }
    }
    expect(outOfBand).toEqual([]);
  });

  it('never blanks a sentence-final token', () => {
    // A blank at the end of the sentence takes the full stop with it and
    // reads as a truncated sentence rather than a gap.
    for (const entry of PARTICLE_VERB_DATA) {
      for (const example of entry.examples) {
        expect(example.blankIndex).toBeLessThan(example.sv.split(' ').length - 1);
      }
    }
  });
});

describe('particle verb dataset - reflexives', () => {
  const reflexives = PARTICLE_VERB_DATA.filter((entry) => entry.reflexive !== 'none');

  it('has reflexive entries in v1', () => {
    expect(reflexives.length).toBeGreaterThan(0);
  });

  it('uses the {refl} placeholder rather than a literal sig', () => {
    // A literal "sig" in the lemma is the defect that teaches *"jag hör av
    // sig". The placeholder makes the pronoun a rendering decision.
    for (const entry of reflexives) {
      expect(entry.lemma).toContain('{refl}');
      expect(entry.lemma.split(' ')).not.toContain('sig');
    }
  });

  it('has no placeholder in a non-reflexive lemma', () => {
    for (const entry of PARTICLE_VERB_DATA.filter((e) => e.reflexive === 'none')) {
      expect(entry.lemma).not.toContain('{refl}');
    }
  });

  it('gives every reflexive at least one non-third-person frame', () => {
    // Three frames all showing "sig" and the learner generalises it to every
    // person, which is exactly what the cloze-only rule exists to prevent.
    for (const entry of reflexives) {
      const hasNonThird = entry.examples.some((example) => /\b(mig|dig|oss|er)\b/.test(example.sv));
      expect(hasNonThird, `${entry.id} shows only third-person frames`).toBe(true);
    }
  });

  it('places the pronoun where the entry says it does', () => {
    for (const entry of reflexives) {
      const lemmaTokens = renderLemma(entry).split(' ');
      const pronounAt = lemmaTokens.findIndex((token) => token === 'sig');
      const particleAt = lemmaTokens.indexOf(entry.particle);
      expect(pronounAt).toBeGreaterThan(-1);
      expect(particleAt).toBeGreaterThan(-1);
      if (entry.reflexive === 'afterParticle') {
        expect(pronounAt).toBeGreaterThan(particleAt);
      } else {
        expect(pronounAt).toBeLessThan(particleAt);
      }
    }
  });
});

describe('particle verb dataset - glosses', () => {
  // A gloss that contains the English cognate of its own particle hands the
  // answer over: "to look up" as a gloss for `slå upp` is not a test of
  // anything. Only the directional and aspectual particles are listed —
  // `till` and `om` map to English function words too common to screen on.
  const COGNATES: Record<string, string[]> = {
    ut: ['out'],
    upp: ['up'],
    in: ['in'],
    ner: ['down'],
    ned: ['down'],
    av: ['off'],
    på: ['on'],
    bort: ['away'],
    fram: ['forward'],
    tillbaka: ['back'],
    igen: ['again'],
    över: ['over'],
    med: ['with'],
    efter: ['after'],
    igenom: ['through'],
  };

  it('never hands the particle over in its own gloss', () => {
    const leaks: string[] = [];
    for (const entry of PARTICLE_VERB_DATA) {
      for (const cognate of COGNATES[entry.particle] ?? []) {
        if (new RegExp(`\\b${cognate}\\b`, 'i').test(entry.gloss.en)) {
          leaks.push(`${entry.id}: "${entry.gloss.en}" contains "${cognate}"`);
        }
      }
    }
    expect(leaks).toEqual([]);
  });

  it('gives every entry a non-empty English gloss', () => {
    for (const entry of PARTICLE_VERB_DATA) {
      expect(entry.gloss.en.trim().length).toBeGreaterThan(0);
    }
  });

  it('does not let two verified entries share a gloss', () => {
    // Identical glosses make the recall direction unanswerable: the learner
    // is asked to pick one of two phrases from a prompt that fits both.
    const glosses = VERIFIED.map((entry) => entry.gloss.en.toLowerCase());
    const duplicated = glosses.filter((gloss, index) => glosses.indexOf(gloss) !== index);
    expect(duplicated).toEqual([]);
  });
});

describe('particle verb dataset - CEFR', () => {
  it('records where every band came from', () => {
    for (const entry of PARTICLE_VERB_DATA) {
      expect(['svalex', 'judgment']).toContain(entry.cefrEvidence);
    }
  });

  it('leads with A1 and A2 core material', () => {
    const early = VERIFIED.filter((entry) => entry.cefr === 'A1' || entry.cefr === 'A2').length;
    expect(early).toBeGreaterThan(VERIFIED.length / 2);
  });
});
