import { describe, it, expect } from 'vitest';
import { PARTICLE_VERB_DATA } from '@/data/particleVerbData';
import { VERB_DATA } from '@/data/verbData';
import {
  getVerifiedParticleVerbs,
  renderLemma,
  getPhraseForms,
  isAcceptedRecall,
  getParticleCoreSense,
} from '@/lib/particleVerbs';
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

describe('particle verb dataset - baseInfinitive format (#317)', () => {
  // #317: VERB_DATA membership stopped being a validity constraint on
  // baseInfinitive (that gate was already dead code after #315). What still
  // matters is the field's own shape, since the 7-day same-base rule in
  // particleQueue.ts joins entries to each other on this exact string, never
  // on VERB_DATA. Every current entry proves every assertion below; a
  // future authoring mistake reports here instead of only showing up as a
  // silently disabled interference rule.
  it('is non-empty, matches the lemma head, is NFC, and is one string per base', () => {
    const untrimmed: string[] = [];
    const detachedFromLemma: string[] = [];
    const notNfc: string[] = [];
    const groups = new Map<string, Set<string>>();

    for (const entry of PARTICLE_VERB_DATA) {
      const base = entry.baseInfinitive;

      if (base.length === 0 || base !== base.trim()) {
        untrimmed.push(entry.id);
      }
      if (entry.lemma.split(' ')[0] !== base) {
        detachedFromLemma.push(`${entry.id}: lemma "${entry.lemma}" vs base "${base}"`);
      }
      if (base !== base.normalize('NFC')) {
        notNfc.push(entry.id);
      }

      const key = base.normalize('NFC').toLowerCase();
      const raw = groups.get(key) ?? new Set<string>();
      raw.add(base);
      groups.set(key, raw);
    }

    const inconsistentGroups = [...groups.entries()]
      .filter(([, raw]) => raw.size > 1)
      .map(([key, raw]) => `${key}: ${[...raw].join(' / ')}`);

    expect(untrimmed).toEqual([]);
    expect(detachedFromLemma).toEqual([]);
    expect(notNfc).toEqual([]);
    expect(inconsistentGroups).toEqual([]);
  });
});

describe('particle verb dataset - #262 base verb unlock', () => {
  // #262: stänga, sätta, stiga, hälsa, bygga, ställa were appended to
  // VERB_DATA specifically to unlock these six particle verbs, which had
  // been drafted verified:false because their base was unresolvable. Pins
  // the acceptance criteria directly rather than relying only on the
  // generic "every verified entry resolves" checks above, so a partial
  // flip (e.g. one entry left at verified:false, or a base typo that
  // happens to still resolve to some other row) reports by name.
  const ISSUE_262_IDS = [
    'pv:stanga-av',
    'pv:satta-pa',
    'pv:stiga-upp',
    'pv:halsa-pa',
    'pv:bygga-ut',
    'pv:stalla-in',
  ];

  it('flips every #262 particle verb to verified, with a resolvable base and a second frame', () => {
    for (const id of ISSUE_262_IDS) {
      const found = PARTICLE_VERB_DATA.find((entry) => entry.id === id);
      expect(found, `${id} missing from PARTICLE_VERB_DATA`).toBeDefined();
      expect(found!.verified, `${id} is still not verified`).toBe(true);
      expect(
        BASE_INFINITIVES.has(found!.baseInfinitive),
        `${id} base "${found!.baseInfinitive}" does not resolve in VERB_DATA`,
      ).toBe(true);
      expect(found!.examples.length, `${id} has fewer than two frames`).toBeGreaterThanOrEqual(2);
    }
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

describe('particle verb dataset - embedded reference forms (#318)', () => {
  // #318: the reference line renders from forms embedded on the data row,
  // never from a VERB_DATA join at render time. That only holds if every
  // verified entry actually carries the three forms — a verified entry
  // missing `forms` would (per lib/particleVerbs.getPhraseForms) render no
  // reference line at all, silently.
  it('gives every verified entry non-empty embedded presens/preteritum/supinum forms', () => {
    const missing = VERIFIED.filter(
      (entry) =>
        !entry.forms ||
        !entry.forms.presens?.trim() ||
        !entry.forms.preteritum?.trim() ||
        !entry.forms.supinum?.trim(),
    );
    expect(missing.map((entry) => entry.id)).toEqual([]);
  });

  it('keeps every embedded form in step with its VERB_DATA base', () => {
    // Guards against a future VERB_DATA correction silently diverging from
    // the embedded presens/preteritum/supinum copies in particleVerbData.ts.
    const drift: string[] = [];
    for (const entry of VERIFIED) {
      const base = VERB_DATA.find((verb) => verb.infinitive === entry.baseInfinitive);
      if (!entry.forms) continue;
      if (!base) {
        // #317: an absent base is coverage, not drift. The embedded `forms`
        // (#318) are the authoritative, linguist-verified strings; the
        // VERB_DATA comparison below is an opportunistic cross-check that
        // only applies where a base row exists.
        continue;
      }
      const tail = renderLemma(entry).slice(entry.baseInfinitive.length);
      const expected = {
        presens: base.presens + tail,
        preteritum: base.preteritum + tail,
        supinum: base.supinum + tail,
      };
      for (const key of ['presens', 'preteritum', 'supinum'] as const) {
        if (entry.forms[key] !== expected[key]) {
          drift.push(`${entry.id} ${key}: "${entry.forms[key]}" vs VERB_DATA "${expected[key]}"`);
        }
      }
    }
    expect(drift).toEqual([]);
  });
});

describe('particle verb dataset - excludedParticles (#318)', () => {
  it('ships excludedParticles annotations, and none of them overlaps acceptedParticles for the same frame', () => {
    // A single assertion on purpose: an empty-overlaps check alone would
    // pass vacuously on a dataset that ships no excludedParticles data at
    // all (as pre-#318 data did), which would prove nothing. Requiring at
    // least one annotated frame makes the "no overlap" half meaningful.
    const annotatedIds: string[] = [];
    const overlaps: string[] = [];
    const unknownParticles: string[] = [];
    const knownParticles = new Set(PARTICLE_VERB_DATA.map((entry) => entry.particle.toLowerCase()));
    for (const entry of PARTICLE_VERB_DATA) {
      const accepted = new Set(entry.acceptedParticles.map((particle) => particle.toLowerCase()));
      for (const example of entry.examples) {
        if (!example.excludedParticles || example.excludedParticles.length === 0) continue;
        annotatedIds.push(entry.id);
        for (const excluded of example.excludedParticles) {
          if (accepted.has(excluded.toLowerCase())) {
            overlaps.push(`${entry.id}: "${excluded}" is both accepted and excluded`);
          }
          if (!knownParticles.has(excluded.toLowerCase())) {
            unknownParticles.push(`${entry.id}: "${excluded}" is not any entry's particle`);
          }
        }
      }
    }
    expect(annotatedIds.length).toBeGreaterThan(0);
    expect(unknownParticles).toEqual([]);
    expect(overlaps).toEqual([]);
  });

  it('pins the #318 exclusions for komma ihåg, tala om, and ta slut', () => {
    // Named regression fixture: the general check above would also catch a
    // dropped or corrupted annotation, but this names exactly which entries
    // and values #318 introduced, so a partial revert reports by name.
    const expectations: Array<[string, string[]]> = [
      ['pv:komma-ihag', ['in', 'fram']],
      ['pv:tala-om', ['till']],
      ['pv:ta-slut', ['bort']],
    ];
    for (const [id, particles] of expectations) {
      const found = PARTICLE_VERB_DATA.find((entry) => entry.id === id);
      expect(found, `${id} missing from PARTICLE_VERB_DATA`).toBeDefined();
      for (const example of found!.examples) {
        expect(example.excludedParticles, `${id}: "${example.sv}"`).toEqual(particles);
      }
    }
  });
});

describe('particle verb dataset - CEFR', () => {
  it('records where every band came from', () => {
    for (const entry of PARTICLE_VERB_DATA) {
      expect(['svalex', 'judgment']).toContain(entry.cefrEvidence);
    }
  });

  const MIN_VERIFIED_A1_A2 = 60;

  it('keeps the beginner runway: at least 60 verified A1/A2 entries (#359)', () => {
    // Not a majority (see docs/learning/2026-08-09-particle-cefr-majority-decision.md).
    // A1+A2 is 22% of SVALex, so a proportional rule is an intake ratio the corpus
    // cannot supply. What the learner meets first is decided by CEFR_BAND_ORDER in
    // particleQueue.ts; this floor only guarantees there is enough A1/A2 material to
    // fill the first ~30 days of default-paced introductions. #359 raised the floor
    // from 45 to 60 as its stated backlog target (band-6 operational particle verbs).
    const early = VERIFIED.filter((entry) => entry.cefr === 'A1' || entry.cefr === 'A2').length;
    expect(early).toBeGreaterThanOrEqual(MIN_VERIFIED_A1_A2);
  });
});

describe('particle verb dataset - #359 band-6 operational particle verbs', () => {
  // Pins the acceptance criteria of #359 by name: each entry resolves to a
  // VERB_DATA base that was already pinned before this ticket (ha, ta, stiga,
  // se — no cross-owner VERB_DATA edit was in scope), ships verified:true,
  // and lands in A1/A2 so it actually counts toward the runway target above.
  // A partial land (e.g. one entry left verified:false, or a base typo) would
  // still pass the aggregate floor check by coincidence on some other entry;
  // this reports the specific #359 rows by id instead.
  const ISSUE_359_IDS = [
    'pv:ha-pa-sig',
    'pv:ta-pa-sig',
    'pv:ta-av-sig',
    'pv:stiga-av',
    'pv:se-upp',
  ];

  it('ships every #359 entry verified, in A1/A2, with a base VERB_DATA already pinned', () => {
    for (const id of ISSUE_359_IDS) {
      const found = PARTICLE_VERB_DATA.find((entry) => entry.id === id);
      expect(found, `${id} missing from PARTICLE_VERB_DATA`).toBeDefined();
      expect(found!.verified, `${id} is not verified`).toBe(true);
      expect(['A1', 'A2'], `${id} cefr "${found!.cefr}" is not A1/A2`).toContain(found!.cefr);
      expect(
        BASE_INFINITIVES.has(found!.baseInfinitive),
        `${id} base "${found!.baseInfinitive}" does not resolve in VERB_DATA`,
      ).toBe(true);
    }
  });

  it('gives the three reflexive-clothing entries (ha på sig / ta på sig / ta av sig) distinct glosses', () => {
    // #359's authoring note leans on "getting dressed/undressed" as the
    // justification for three very similar entries built on the same
    // particle+reflexive shape. A copy-paste that left two of them with the
    // same gloss would make the recall direction unanswerable (see the
    // generic duplicate-gloss check above) but this names which three ids
    // must be mutually distinguishable so a regression reports here first.
    const ids = ['pv:ha-pa-sig', 'pv:ta-pa-sig', 'pv:ta-av-sig'];
    const glosses = ids.map((id) => {
      const found = PARTICLE_VERB_DATA.find((entry) => entry.id === id);
      expect(found, `${id} missing from PARTICLE_VERB_DATA`).toBeDefined();
      return found!.gloss.en.toLowerCase();
    });
    expect(new Set(glosses).size).toBe(glosses.length);
  });
});

describe('particle verb dataset - #372 remaining #359 band-6 particle verbs', () => {
  // Pins the eight remaining #359 band-6 entries #372 authored: each entry
  // resolves to a VERB_DATA base row, ships verified:true, and lands in
  // A1/A2 so it counts toward the runway target above, the same shape as
  // the #359 block pins its five entries by id.
  const ISSUE_372_IDS = [
    'pv:sla-pa',
    'pv:sla-av',
    'pv:folja-med',
    'pv:flytta-in',
    'pv:checka-in',
    'pv:torka-av',
    'pv:stada-upp',
    'pv:fylla-i',
  ];

  it('ships every #372 entry verified, in A1/A2, with a base VERB_DATA already pinned', () => {
    for (const id of ISSUE_372_IDS) {
      const found = PARTICLE_VERB_DATA.find((entry) => entry.id === id);
      expect(found, `${id} missing from PARTICLE_VERB_DATA`).toBeDefined();
      expect(found!.verified, `${id} is not verified`).toBe(true);
      expect(['A1', 'A2'], `${id} cefr "${found!.cefr}" is not A1/A2`).toContain(found!.cefr);
      expect(
        BASE_INFINITIVES.has(found!.baseInfinitive),
        `${id} base "${found!.baseInfinitive}" does not resolve in VERB_DATA`,
      ).toBe(true);
    }
  });

  it('gives the "i" particle a core sense for fylla i (#372)', () => {
    // #372 added the "i" entry to PARTICLE_CORE_SENSE to unblock "fylla i";
    // a missing or empty core sense would leave that particle's reference
    // hint unrenderable in the UI.
    expect(getParticleCoreSense('i')).toEqual(expect.any(String));
    expect(getParticleCoreSense('i')).not.toBeNull();
  });
});

describe('particle verb dataset - obligatory trailing preposition (#357/#376)', () => {
  // #357 decision: an entry whose phrase never occurs without a trailing
  // preposition stores it in `preposition` and folds it into `lemma`. This
  // block is the acceptance criterion from section 4 of
  // docs/product/2026-08-12-fragment-lemma-preposition-decision.md, checked
  // against every entry that carries the field.
  const WITH_PREPOSITION = PARTICLE_VERB_DATA.filter((entry) => entry.preposition !== undefined);

  it('has at least one entry carrying preposition, so the checks below are not vacuous', () => {
    expect(WITH_PREPOSITION.length).toBeGreaterThan(0);
  });

  it('gives every preposition a clean, single-token, lowercase, NFC value on a non-reflexive entry', () => {
    const offenders: string[] = [];
    for (const entry of WITH_PREPOSITION) {
      const prep = entry.preposition!;
      const ok =
        prep.length > 0 &&
        prep === prep.trim() &&
        prep === prep.normalize('NFC') &&
        prep === prep.toLowerCase() &&
        !prep.includes(' ') &&
        entry.reflexive === 'none';
      if (!ok) offenders.push(`${entry.id}: "${prep}"`);
    }
    expect(offenders).toEqual([]);
  });

  it('builds lemma as `${baseInfinitive} ${particle} ${preposition}`', () => {
    const mismatches: string[] = [];
    for (const entry of WITH_PREPOSITION) {
      const expected = `${entry.baseInfinitive} ${entry.particle} ${entry.preposition}`;
      if (entry.lemma !== expected) {
        mismatches.push(`${entry.id}: lemma "${entry.lemma}" vs expected "${expected}"`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('never lets the preposition itself be the cloze answer', () => {
    const offenders: string[] = [];
    for (const entry of WITH_PREPOSITION) {
      const prep = entry.preposition!;
      const accepted = entry.acceptedParticles.map((particle) => particle.toLowerCase());
      if (accepted.includes(prep.toLowerCase())) {
        offenders.push(`${entry.id}: "${prep}" is in acceptedParticles`);
      }
      for (const example of entry.examples) {
        const tokens = example.sv.split(' ');
        const blanked = tokens[example.blankIndex];
        if (blanked?.toLowerCase() === prep.toLowerCase()) {
          offenders.push(
            `${entry.id}: blankIndex ${example.blankIndex} blanks the preposition in "${example.sv}"`,
          );
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('shows the preposition right after the particle in every frame', () => {
    const offenders: string[] = [];
    for (const entry of WITH_PREPOSITION) {
      const prep = entry.preposition!;
      for (const example of entry.examples) {
        const tokens = example.sv.split(' ');
        const afterBlank = tokens[example.blankIndex + 1];
        if (afterBlank?.toLowerCase() !== prep.toLowerCase()) {
          offenders.push(
            `${entry.id}: token after blankIndex ${example.blankIndex} is "${afterBlank}", expected "${prep}" in "${example.sv}"`,
          );
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('renders all four reference lines ending with the preposition', () => {
    const offenders: string[] = [];
    for (const entry of WITH_PREPOSITION) {
      const forms = getPhraseForms(entry);
      if (!forms) {
        offenders.push(`${entry.id}: getPhraseForms returned null`);
        continue;
      }
      const lines = [forms.infinitive, forms.presens, forms.preteritum, forms.supinum];
      for (const line of lines) {
        if (!line.endsWith(` ${entry.preposition}`)) {
          offenders.push(
            `${entry.id}: reference line "${line}" does not end with " ${entry.preposition}"`,
          );
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('accepts the full phrase on recall and rejects the bare fragment', () => {
    const offenders: string[] = [];
    for (const entry of WITH_PREPOSITION) {
      const full = renderLemma(entry);
      const fragment = `${entry.baseInfinitive} ${entry.particle}`;
      if (!isAcceptedRecall(entry, full)) {
        offenders.push(`${entry.id}: full phrase "${full}" was not accepted`);
      }
      if (isAcceptedRecall(entry, fragment)) {
        offenders.push(`${entry.id}: fragment "${fragment}" was wrongly accepted`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('pins se fram emot, gå miste om and ta itu med as verified with a preposition (#376)', () => {
    // Named regression fixture, #262-style: the three entries this decision
    // unblocked. A partial land (one entry still verified:false, or a
    // dropped preposition field) reports here by name.
    const ISSUE_376_IDS = ['pv:se-fram', 'pv:ga-miste', 'pv:ta-itu'];
    for (const id of ISSUE_376_IDS) {
      const found = PARTICLE_VERB_DATA.find((entry) => entry.id === id);
      expect(found, `${id} missing from PARTICLE_VERB_DATA`).toBeDefined();
      expect(found!.verified, `${id} is not verified`).toBe(true);
      expect(found!.preposition, `${id} has no preposition`).toBeTruthy();
    }
  });
});
