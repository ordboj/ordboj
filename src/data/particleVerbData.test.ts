import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
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
const here = dirname(fileURLToPath(import.meta.url));

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

  it('ORD-72: gives "låsa in" the digraph id pv:laasa-in on collision, leaving pv:lasa-in ("läsa in") untouched', () => {
    // Rule 2 at the `id` field (particleVerbData.ts header): a simple ASCII
    // fold of "låsa in" collides with the already-shipped "läsa in"
    // (pv:lasa-in, #336), so the later entry must fold with digraph
    // transliteration (å→aa) instead of stealing or mutating the incumbent's
    // id. This is the first entry to exercise that rule -- pinning it keeps
    // the precedent from silently regressing if the dataset is ever
    // reshuffled or re-slugged.
    const laasaIn = PARTICLE_VERB_DATA.find((entry) => entry.id === 'pv:laasa-in');
    expect(laasaIn).toBeDefined();
    expect(laasaIn?.baseInfinitive).toBe('låsa');
    expect(laasaIn?.lemma).toBe('låsa in');
    expect(laasaIn?.id).toMatch(/^pv:[a-z0-9]+(-[a-z0-9]+)*$/);

    const lasaIn = PARTICLE_VERB_DATA.find((entry) => entry.id === 'pv:lasa-in');
    expect(lasaIn).toBeDefined();
    expect(lasaIn?.baseInfinitive).toBe('läsa');
    expect(lasaIn?.lemma).toBe('läsa in');
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

describe('particle verb dataset - discrimination-variant gate depth (#386/#387/#389)', () => {
  // docs/learning/2026-08-12-sentence-completion-distractors.md, "Ambiguity"
  // item 4: "A frame qualifies as certified only when verified === true and
  // excludedParticles.length >= 2; the certified-frame count and the
  // distinct-base count are computed, not asserted by hand." This computes
  // both and pins the exact numbers, so a data change moves the gate on
  // purpose rather than by accident, and the build-gate floor from the same
  // note (>= 8 frames across >= 5 bases) is checked independently of the
  // exact pin.
  const CERTIFIED_DEPTH = 2;
  const BUILD_GATE_FRAMES = 8;
  const BUILD_GATE_BASES = 5;

  function certifiedFrames(): Array<{ id: string; base: string }> {
    const frames: Array<{ id: string; base: string }> = [];
    for (const entry of PARTICLE_VERB_DATA) {
      if (!entry.verified) continue;
      for (const example of entry.examples) {
        if ((example.excludedParticles?.length ?? 0) >= CERTIFIED_DEPTH) {
          frames.push({ id: entry.id, base: entry.baseInfinitive });
        }
      }
    }
    return frames;
  }

  it('certifies exactly 17 frames across exactly 6 distinct base verbs at the ruled 2-lure depth', () => {
    const frames = certifiedFrames();
    const distinctBases = new Set(frames.map((frame) => frame.base));
    expect(frames.length).toBe(17);
    expect(distinctBases.size).toBe(6);
  });

  it('clears the #386 build gate (at least 8 certified frames across at least 5 distinct bases)', () => {
    const frames = certifiedFrames();
    const distinctBases = new Set(frames.map((frame) => frame.base));
    expect(frames.length).toBeGreaterThanOrEqual(BUILD_GATE_FRAMES);
    expect(distinctBases.size).toBeGreaterThanOrEqual(BUILD_GATE_BASES);
  });
});

describe('particle verb dataset - discrimination answer key (#386/#389)', () => {
  // The rendered option set the ruling defines (docs/learning/
  // 2026-08-12-sentence-completion-distractors.md): acceptedParticles[0] —
  // the only accepted particle ever rendered as an option — plus 2 lures
  // taken from excludedParticles. It must intersect acceptedParticles in
  // exactly one member. A builder that instead rendered every accepted
  // spelling would put "lägga ner" and "lägga ned" on screen as two
  // separate options and mark one of them wrong; that is the failure this
  // check exists to catch.
  function optionSet(entry: (typeof PARTICLE_VERB_DATA)[number], excluded: string[]): string[] {
    return [entry.acceptedParticles[0]!, ...excluded.slice(0, 2)];
  }

  // Every 2-element combination of an example's excludedParticles, so a
  // rotating lure window (docs/learning/2026-08-12-sentence-completion-
  // distractors.md) is exercised, not only the first two entries in the
  // array. Today no frame carries more than 2 lures, so this is a forward
  // guard: it stays vacuous-safe (one combination) until a frame gets a
  // third lure, and then it is already checking every pair.
  function excludedPairs(excluded: string[]): Array<[string, string]> {
    const pairs: Array<[string, string]> = [];
    for (let i = 0; i < excluded.length; i++) {
      for (let j = i + 1; j < excluded.length; j++) {
        pairs.push([excluded[i]!, excluded[j]!]);
      }
    }
    return pairs;
  }

  it('intersects acceptedParticles in exactly one member for every certified frame', () => {
    const offenders: string[] = [];
    for (const entry of PARTICLE_VERB_DATA) {
      if (!entry.verified) continue;
      const accepted = new Set(entry.acceptedParticles.map((particle) => particle.toLowerCase()));
      for (const example of entry.examples) {
        const excluded = example.excludedParticles ?? [];
        if (excluded.length < 2) continue;
        for (const [first, second] of excludedPairs(excluded)) {
          const options = optionSet(entry, [first, second]);
          const hits = options.filter((option) => accepted.has(option.toLowerCase()));
          if (hits.length !== 1) {
            offenders.push(
              `${entry.id}: "${example.sv}" -> options ${JSON.stringify(options)} intersect acceptedParticles ${hits.length} times`,
            );
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('pins the lägga ner / lägga ned two-spelling case: the rendered options never include "ned"', () => {
    const entry = PARTICLE_VERB_DATA.find((candidate) => candidate.id === 'pv:lagga-ner')!;
    expect(entry.acceptedParticles).toEqual(['ner', 'ned']);
    const certifiedFrame = entry.examples.find(
      (example) => (example.excludedParticles?.length ?? 0) >= 2,
    )!;
    const options = optionSet(entry, certifiedFrame.excludedParticles!);
    expect(options).toEqual(['ner', 'in', 'upp']);
    expect(options).not.toContain('ned');
  });
});

describe('particle verb dataset - cross-entry excluded-particle hazard (#389)', () => {
  // Mechanical shadow of the "komma på" trap named in ticket #389: an
  // excludedParticles entry that happens to equal another same-base entry's
  // accepted particle is not automatically wrong on its own — komma ihåg
  // legitimately excludes "in" in its own frame even though komma in is a
  // real, different particle verb — but it is exactly the shape of mistake
  // that would teach a false negative if a future entry introduced it
  // without anyone noticing. This does not judge Swedish correctness, which
  // stays swedish-linguist's call; it only requires that every such case is
  // named in a comment, the same way every current one already is.
  const source = readFileSync(join(here, 'particleVerbData.ts'), 'utf-8');

  // Isolates one entry's own source text between its opening `  {` and
  // closing `  },`, so the comment search below never reads a neighbouring
  // entry's comment as this entry's justification. The dataset convention
  // writes a justification comment directly on the line(s) immediately
  // above the opening `  {`, so after locating the brace this also walks
  // backwards and folds in every contiguous `//` comment line above it.
  // It stops at the first non-comment line -- a blank line, or the
  // previous entry's `  },` -- so it never widens into a neighbour's body.
  function extractEntryBlock(text: string, id: string): string {
    const idIndex = text.indexOf(`id: '${id}',`);
    if (idIndex === -1) return '';
    const blockStart = text.lastIndexOf('\n  {\n', idIndex);
    const blockEnd = text.indexOf('\n  },\n', idIndex);
    if (blockStart === -1 || blockEnd === -1) return '';

    let extendedStart = blockStart;
    while (extendedStart > 0) {
      const lineStart = text.lastIndexOf('\n', extendedStart - 1) + 1;
      const line = text.slice(lineStart, extendedStart);
      if (!line.trim().startsWith('//')) break;
      extendedStart = lineStart === 0 ? 0 : lineStart - 1;
    }

    return text.slice(extendedStart, blockEnd);
  }

  // A justification is a `//` comment inside the entry's own block that
  // quotes the excluded particle, matching every hand-written comment
  // already in the dataset (e.g. `// "in" and "fram" excluded ...`).
  function hasJustifyingComment(block: string, particle: string): boolean {
    const commentText = block
      .split('\n')
      .filter((line) => line.trim().startsWith('//'))
      .join('\n');
    return commentText.includes(`"${particle}"`);
  }

  describe('extraction helpers, self-tested against a fixture before touching real data', () => {
    const fixture = [
      '',
      '  {',
      "    id: 'pv:fake-verb',",
      '    // "bort" excluded because reasons.',
      '    examples: [',
      "      { sv: 'x', blankIndex: 0, excludedParticles: ['bort'] },",
      '    ],',
      '  },',
      '  {',
      "    id: 'pv:fake-verb-2',",
      '    examples: [',
      "      { sv: 'y', blankIndex: 0, excludedParticles: ['ut'] },",
      '    ],',
      '  },',
      '  // "in" excluded because it lands on a same-base collision.',
      '  {',
      "    id: 'pv:fake-verb-3',",
      '    examples: [',
      "      { sv: 'z', blankIndex: 0, excludedParticles: ['in'] },",
      '    ],',
      '  },',
      '',
      '  // "ner" excluded, but separated from the entry by a blank line.',
      '',
      '  {',
      "    id: 'pv:fake-verb-4',",
      '    examples: [',
      "      { sv: 'w', blankIndex: 0, excludedParticles: ['ner'] },",
      '    ],',
      '  },',
      '',
    ].join('\n');

    it('extracts one entry block without bleeding into its neighbour', () => {
      const block = extractEntryBlock(fixture, 'pv:fake-verb');
      expect(block).toContain('pv:fake-verb');
      expect(block).not.toContain('pv:fake-verb-2');
    });

    it('finds a quoted justification comment when the entry carries one', () => {
      const block = extractEntryBlock(fixture, 'pv:fake-verb');
      expect(hasJustifyingComment(block, 'bort')).toBe(true);
    });

    it('reports no justification when the entry carries no matching comment', () => {
      const block = extractEntryBlock(fixture, 'pv:fake-verb-2');
      expect(hasJustifyingComment(block, 'ut')).toBe(false);
    });

    it("captures a comment written directly above the entry's opening brace", () => {
      // The dataset convention: the justification comment lives above `  {`,
      // not inside the block. pv:fake-verb-3's comment must be captured, and
      // it must not attach to pv:fake-verb-2 above it (stopped by that
      // entry's own `  },`).
      const block = extractEntryBlock(fixture, 'pv:fake-verb-3');
      expect(hasJustifyingComment(block, 'in')).toBe(true);
    });

    it('does not capture a comment separated from the entry by a blank line', () => {
      const block = extractEntryBlock(fixture, 'pv:fake-verb-4');
      expect(hasJustifyingComment(block, 'ner')).toBe(false);
    });

    it("does not let a comment leak forward across the previous entry's closing `  },`", () => {
      // pv:fake-verb-3's leading comment (quoting "in") sits directly above
      // its own brace, immediately after pv:fake-verb-2's `  },`. It must
      // not be read as justification for pv:fake-verb-2.
      const block = extractEntryBlock(fixture, 'pv:fake-verb-2');
      expect(hasJustifyingComment(block, 'in')).toBe(false);
      expect(block).not.toContain('same-base collision');
    });
  });

  // (base, particle) -> ids of the entries that accept it, so a hazard is
  // any excludedParticles entry landing on a pair some *other* same-base
  // entry accepts.
  const acceptedByBaseParticle = new Map<string, string[]>();
  for (const entry of PARTICLE_VERB_DATA) {
    for (const particle of entry.acceptedParticles) {
      const key = `${entry.baseInfinitive}|${particle.toLowerCase()}`;
      const ids = acceptedByBaseParticle.get(key) ?? [];
      ids.push(entry.id);
      acceptedByBaseParticle.set(key, ids);
    }
  }

  const hazards: Array<{ id: string; sv: string; particle: string }> = [];
  for (const entry of PARTICLE_VERB_DATA) {
    for (const example of entry.examples) {
      for (const excluded of example.excludedParticles ?? []) {
        const owners = (
          acceptedByBaseParticle.get(`${entry.baseInfinitive}|${excluded.toLowerCase()}`) ?? []
        ).filter((id) => id !== entry.id);
        if (owners.length > 0) {
          hazards.push({ id: entry.id, sv: example.sv, particle: excluded });
        }
      }
    }
  }

  // The dedupe key used to be `${id}|${particle}`, which discards the frame:
  // one comment on the entry justified every frame under it, so a mutation
  // that added a fresh hazard to an already-justified entry (e.g. #389's
  // pv:ge-upp regression) passed silently. This pins the exact 40 frame-level
  // hazard triples (14 distinct id/particle pairs) as of this commit. Adding
  // a new entry here needs a swedish-linguist review of that specific frame,
  // not only a comment naming the particle -- the review is what confirms
  // the exclusion is correct Swedish, this list only proves it was reviewed.
  const KNOWN_HAZARDS: readonly string[] = [
    'pv:bli-av | Festen blir av även om det regnar. | kvar',
    'pv:bli-av | Festen blir av även om det regnar. | över',
    'pv:bli-av | Mötet blir av på torsdag som planerat. | kvar',
    'pv:bli-av | Mötet blir av på torsdag som planerat. | över',
    'pv:bli-av | Resan blir av trots det dåliga vädret. | kvar',
    'pv:bli-av | Resan blir av trots det dåliga vädret. | över',
    'pv:ge-upp | Han ger upp efter tre timmar av hårt arbete. | bort',
    'pv:ge-upp | Han ger upp efter tre timmar av hårt arbete. | ut',
    'pv:ge-upp | Vi ger aldrig upp trots alla svåra problem. | bort',
    'pv:ge-upp | Vi ger aldrig upp trots alla svåra problem. | ut',
    'pv:komma-ihag | Han kommer ihåg alla telefonnummer utan att skriva. | fram',
    'pv:komma-ihag | Han kommer ihåg alla telefonnummer utan att skriva. | in',
    'pv:komma-ihag | Jag kommer ihåg hennes namn från förra året. | fram',
    'pv:komma-ihag | Jag kommer ihåg hennes namn från förra året. | in',
    'pv:komma-ihag | Vi kommer ihåg den dagen mycket tydligt. | fram',
    'pv:komma-ihag | Vi kommer ihåg den dagen mycket tydligt. | in',
    'pv:lagga-ner | De lägger ner projektet efter många problem. | in',
    'pv:lagga-ner | De lägger ner projektet efter många problem. | upp',
    'pv:lagga-ner | Företaget lägger ner fabriken i slutet av året. | in',
    'pv:lagga-ner | Företaget lägger ner fabriken i slutet av året. | upp',
    'pv:lagga-ner | Kommunen lägger ner två skolor nästa år. | in',
    'pv:lagga-ner | Kommunen lägger ner två skolor nästa år. | upp',
    'pv:plocka-undan | Barnen plockar undan efter middagen varje kväll. | bort',
    'pv:plocka-undan | Barnen plockar undan efter middagen varje kväll. | upp',
    'pv:plocka-undan | Hon plockar undan i köket medan kaffet kokar. | bort',
    'pv:plocka-undan | Hon plockar undan i köket medan kaffet kokar. | upp',
    'pv:plocka-undan | Jag plockar undan i vardagsrummet innan gästerna kommer. | bort',
    'pv:plocka-undan | Jag plockar undan i vardagsrummet innan gästerna kommer. | upp',
    'pv:se-om | Han ser om avsnittet en gång till. | ut',
    'pv:se-om | Jag ser om matchen på tv i kväll. | ut',
    'pv:se-om | Vi ser om filmen eftersom den var så bra. | ut',
    'pv:sta-till | Hur står det till med arbetet just nu? | upp',
    'pv:sta-till | Hur står det till med arbetet just nu? | ut',
    'pv:sta-till | Hur står det till med familjen i dag? | upp',
    'pv:sta-till | Hur står det till med familjen i dag? | ut',
    'pv:sta-till | Jag undrar hur det står till hemma hos er. | upp',
    'pv:sta-till | Jag undrar hur det står till hemma hos er. | ut',
    'pv:ta-slut | Filmen tar slut efter ungefär två timmar. | bort',
    'pv:ta-slut | Mjölken tar slut innan veckan är över. | bort',
    'pv:ta-slut | Pengarna tar slut i mitten av månaden. | bort',
  ];

  it('finds at least one cross-entry hazard, so the check below is not vacuous', () => {
    expect(hazards.length).toBeGreaterThan(0);
  });

  it('pins the exact cross-entry hazard set per frame, not merely per entry', () => {
    // A per-entry dedupe key hides a hazard on a second frame of an already
    // -commented entry. Pinning the exact frame-level set closes that gap:
    // any new or removed hazard, on any frame, moves this pin on purpose.
    const actual = hazards
      .map((hazard) => `${hazard.id} | ${hazard.sv} | ${hazard.particle}`)
      .sort();
    expect(actual).toEqual([...KNOWN_HAZARDS]);
  });

  it('gives every cross-entry hazard an explicit comment naming the particle', () => {
    const unjustified: string[] = [];
    const seen = new Set<string>();
    for (const hazard of hazards) {
      const key = `${hazard.id}|${hazard.particle}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const block = extractEntryBlock(source, hazard.id);
      if (!hasJustifyingComment(block, hazard.particle)) {
        unjustified.push(
          `${hazard.id}: excludes "${hazard.particle}", which another same-base entry accepts, with no comment naming it`,
        );
      }
    }
    expect(unjustified).toEqual([]);
  });

  it('regression #389: the third pv:ge-upp frame carries no excludedParticles', () => {
    // src/data/particleVerbData.ts documents, in the comment on the pv:ge-upp
    // entry, that this third frame ("Hon ger upp sin plats i tävlingen.")
    // must stay unannotated: "ge upp" and "ge bort" are both real, correct
    // Swedish for this sentence, so excluding "bort" here would mark a
    // correct answer wrong. A per-entry hazard guard cannot catch this,
    // because the entry's other two frames already carry a justifying
    // comment for "bort"/"ut" -- only a per-frame check (see the KNOWN_HAZARDS
    // pin above) fails when this frame picks up excludedParticles it must not
    // have.
    const entry = PARTICLE_VERB_DATA.find((candidate) => candidate.id === 'pv:ge-upp')!;
    const thirdFrame = entry.examples.find(
      (example) => example.sv === 'Hon ger upp sin plats i tävlingen.',
    )!;
    expect(thirdFrame).toBeDefined();
    expect(thirdFrame.excludedParticles ?? []).toEqual([]);
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

  // #441 human ruling: CSV wins over judgment. Of these five, pv:stiga-av and
  // pv:se-upp were pre-existing entries retagged from cefrEvidence 'judgment'
  // to 'svalex' with the SVALex CSV band, which moved them out of A1/A2 (to
  // B1 and B2 respectively). That is the ruling working as intended, not a
  // #359 regression, so they get an exact-band pin instead of the A1/A2
  // membership check; the other three #359 entries keep the original clause.
  const ISSUE_359_A1_A2_IDS = ['pv:ha-pa-sig', 'pv:ta-pa-sig', 'pv:ta-av-sig'];
  const ISSUE_359_RETAGGED_BANDS: Record<string, string> = {
    'pv:stiga-av': 'B1',
    'pv:se-upp': 'B2',
  };

  it('ships every #359 entry verified, with a base VERB_DATA already pinned', () => {
    for (const id of ISSUE_359_IDS) {
      const found = PARTICLE_VERB_DATA.find((entry) => entry.id === id);
      expect(found, `${id} missing from PARTICLE_VERB_DATA`).toBeDefined();
      expect(found!.verified, `${id} is not verified`).toBe(true);
      expect(
        BASE_INFINITIVES.has(found!.baseInfinitive),
        `${id} base "${found!.baseInfinitive}" does not resolve in VERB_DATA`,
      ).toBe(true);
    }
  });

  it('keeps the non-retagged #359 entries in A1/A2', () => {
    for (const id of ISSUE_359_A1_A2_IDS) {
      const found = PARTICLE_VERB_DATA.find((entry) => entry.id === id);
      expect(found, `${id} missing from PARTICLE_VERB_DATA`).toBeDefined();
      expect(['A1', 'A2'], `${id} cefr "${found!.cefr}" is not A1/A2`).toContain(found!.cefr);
    }
  });

  it('pins the #441 svalex-retagged bands for stiga-av and se-upp', () => {
    for (const [id, band] of Object.entries(ISSUE_359_RETAGGED_BANDS)) {
      const found = PARTICLE_VERB_DATA.find((entry) => entry.id === id);
      expect(found, `${id} missing from PARTICLE_VERB_DATA`).toBeDefined();
      expect(found!.cefr, `${id} cefr`).toBe(band);
      expect(found!.cefrEvidence, `${id} cefrEvidence`).toBe('svalex');
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
    expect(getParticleCoreSense('i')).toContain('often');
    expect(getParticleCoreSense('i')).not.toBeNull();
  });

  it('flags slå på as unstressed to distinguish it from the "strike/hit" sense (round 2)', () => {
    // Round 2 fix: slå på someone (stressed på, "to hit") is a different verb
    // from slå på something (unstressed på, "to switch on"). The contrast
    // note must say so, or a learner cannot tell the two senses apart.
    const entry = PARTICLE_VERB_DATA.find((e) => e.id === 'pv:sla-pa')!;
    expect(entry.contrast).toContain('unstressed');
  });

  it('accepts the cross-synonym recall pair for the two device on/off verb pairs (round 2)', () => {
    // sätta på/slå på are synonyms for "switch on" (same for stänga av/slå
    // av, "switch off"). Round 2 gave all four entries acceptedRecall so a
    // learner who types the synonym is not marked wrong for a collision the
    // dataset itself creates.
    const slaPa = PARTICLE_VERB_DATA.find((e) => e.id === 'pv:sla-pa')!;
    const sattaPa = PARTICLE_VERB_DATA.find((e) => e.id === 'pv:satta-pa')!;
    expect(isAcceptedRecall(slaPa, 'sätta på')).toBe(true);
    expect(isAcceptedRecall(sattaPa, 'slå på')).toBe(true);

    const slaAv = PARTICLE_VERB_DATA.find((e) => e.id === 'pv:sla-av')!;
    const stangaAv = PARTICLE_VERB_DATA.find((e) => e.id === 'pv:stanga-av')!;
    expect(isAcceptedRecall(slaAv, 'stänga av')).toBe(true);
    expect(isAcceptedRecall(stangaAv, 'slå av')).toBe(true);
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

describe('particle verb dataset - SVALex evidence integrity (#395 remediation item 4.1)', () => {
  // Parses the same CSV the file header cites as the source of `svalex`
  // cefrEvidence, and checks the dataset against it directly rather than
  // trusting the derivation was copied over correctly by hand.
  type SvalexCsvRow = { verb: string; particle: string; svalexFirstLevel: string };

  function parseSvalexCsv(): SvalexCsvRow[] {
    const csvPath = join(
      here,
      '..',
      '..',
      'docs',
      'research',
      'svalex',
      'partikelverb_cefr_draft.csv',
    );
    const csv = readFileSync(csvPath, 'utf-8');
    const lines = csv.split(/\r?\n/).filter(Boolean);
    return lines.slice(1).map((line) => {
      const [verb = '', particle = '', svalexFirstLevel = ''] = line.split(',');
      return { verb, particle, svalexFirstLevel };
    });
  }

  const csvRows = parseSvalexCsv();
  // Rows with an empty svalex_first_level are SweLLex-only (README: 28 of
  // 457) and carry no SVALex level to compare a dataset entry against, so
  // they are not part of this pin's domain.
  const csvLevelByPair = new Map<string, string>();
  for (const row of csvRows) {
    if (!row.svalexFirstLevel.trim()) continue;
    csvLevelByPair.set(`${row.verb}|${row.particle}`, row.svalexFirstLevel);
  }

  it('reads a non-empty CSV with at least one leveled row, so the check below is not vacuous', () => {
    expect(csvRows.length).toBeGreaterThan(0);
    expect(csvLevelByPair.size).toBeGreaterThan(0);
  });

  it("gives every non-reflexive entry whose base+particle has a SVALex row cefrEvidence 'svalex' and a matching cefr band", () => {
    // Reflexive entries (höra av sig, ge sig av, ha på sig, ta på sig, ta av
    // sig) are out of this pin's domain: the CSV's frequency counts are for
    // the bare verb+particle collocation ("ta av"), not the reflexive phrase
    // ("ta av sig"), which is a distinct lexical item the CSV never measured.
    const mismatches: string[] = [];
    for (const entryData of PARTICLE_VERB_DATA) {
      if (entryData.reflexive !== 'none') continue;
      const level = csvLevelByPair.get(`${entryData.baseInfinitive}|${entryData.particle}`);
      if (level === undefined) continue;
      const evidenceOk = entryData.cefrEvidence === 'svalex';
      const bandOk = entryData.cefr.toLowerCase() === level.toLowerCase();
      if (!evidenceOk || !bandOk) {
        mismatches.push(
          `${entryData.id}: cefr=${entryData.cefr} cefrEvidence=${entryData.cefrEvidence}, ` +
            `csv svalex_first_level=${level} for ${entryData.baseInfinitive}+${entryData.particle}`,
        );
      }
    }
    expect(mismatches).toEqual([]);
  });
});

describe('particle verb dataset - no repeated example sentences (#395 remediation item 4.2)', () => {
  it('never uses the same example sentence string twice anywhere in the dataset', () => {
    // A repeated sentence string across two different entries (or reused
    // within one entry's own frames) means one card's "frame rotation" is
    // silently thinner than it looks, or two different phrases are being
    // taught off the identical evidence sentence.
    const seen = new Map<string, string[]>();
    for (const entryData of PARTICLE_VERB_DATA) {
      for (const example of entryData.examples) {
        const ids = seen.get(example.sv) ?? [];
        ids.push(entryData.id);
        seen.set(example.sv, ids);
      }
    }
    const repeated = [...seen.entries()]
      .filter(([, ids]) => ids.length > 1)
      .map(([sv, ids]) => `"${sv}" used by ${ids.join(', ')}`);
    expect(repeated).toEqual([]);
  });
});
