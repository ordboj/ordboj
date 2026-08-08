import { describe, it, expect, vi } from 'vitest';
import {
  conjugateVerb,
  generateVerbPattern,
  getAllConjugatedVerbs,
  getFormLabel,
  getFormHint,
  getVerbs,
  getVerbGrupp,
  verbHasImperativ,
  type Form,
} from '@/lib/verbs';
import { VERB_DATA } from '@/data/verbData';

const ALL_FORMS: Form[] = ['infinitive', 'presens', 'preteritum', 'supinum', 'imperativ'];

describe('conjugateVerb - known verb', () => {
  it('returns the conjugated forms and a 1-based, index-derived id for a verb that exists', async () => {
    const result = await conjugateVerb('vara');
    expect(result).toEqual({
      id: '1',
      infinitive: 'vara',
      presens: 'är',
      preteritum: 'var',
      supinum: 'varit',
      imperativ: 'var',
      cefr: 'A1',
    });
  });
});

describe('conjugateVerb - unknown verb fallback', () => {
  // Issue #124: the literal English placeholder string "(not available)" was
  // removed from conjugateVerb()'s output entirely. An unknown infinitive
  // now falls back to empty strings, which callers already treat as absent
  // (see useSrsProgress.getDueItems's falsy-form skip), instead of a string
  // that could be surfaced to the learner as if it were Swedish.
  it('falls back to id "unknown" and an empty string for every conjugated form', async () => {
    const result = await conjugateVerb('this-infinitive-does-not-exist');
    expect(result).toEqual({
      id: 'unknown',
      infinitive: 'this-infinitive-does-not-exist',
      presens: '',
      preteritum: '',
      supinum: '',
      imperativ: '',
    });
  });
});

describe('conjugateVerb - explicit noImperativ verb (modal/auxiliary)', () => {
  // "kunna" is a modal verb: Swedish has no natural imperativ for it. Issue
  // #124 added VerbData.noImperativ so an empty imperativ can mean "this
  // form does not exist" rather than "not filled in yet". Pin both halves
  // of that contract: the data flag and conjugateVerb()'s pass-through.
  it('reports an empty string (never the removed "(not available)" placeholder) for a verb flagged noImperativ', async () => {
    const source = VERB_DATA.find((v) => v.infinitive === 'kunna');
    expect(source?.imperativ).toBe(''); // pins the fixture assumption this test relies on
    expect(source?.noImperativ).toBe(true);

    const result = await conjugateVerb('kunna');
    expect(result.imperativ).toBe('');
    expect(result.imperativ).not.toBe('(not available)');
  });
});

describe('verbHasImperativ', () => {
  // Pins issue #124's public gate: callers must be able to tell "this verb
  // has no imperativ" (modal/auxiliary) apart from "this verb was not
  // found" or "this verb just has a normal imperativ".
  it.each(['kunna', 'få', 'vilja'])(
    'returns false for the modal verb "%s", which is flagged noImperativ',
    (infinitive) => {
      const row = VERB_DATA.find((v) => v.infinitive === infinitive);
      expect(row?.noImperativ).toBe(true); // fixture assumption this test relies on
      expect(verbHasImperativ(infinitive)).toBe(false);
    },
  );

  it('returns true for an ordinary verb that has a real imperativ', () => {
    expect(verbHasImperativ('vara')).toBe(true);
  });

  it('returns true (no basis to say otherwise) for an infinitive not present in VERB_DATA at all', () => {
    expect(verbHasImperativ('this-infinitive-does-not-exist')).toBe(true);
  });
});

describe('"(not available)" placeholder removal - issue #124', () => {
  // The literal string must never appear anywhere in conjugateVerb() or
  // getAllConjugatedVerbs() output: not for a real verb, not for a verb
  // missing a form, not for an unknown verb.
  it('never appears in conjugateVerb() output for any verb in VERB_DATA', async () => {
    for (const verb of VERB_DATA) {
      const result = await conjugateVerb(verb.infinitive);
      for (const form of ['presens', 'preteritum', 'supinum', 'imperativ'] as const) {
        expect(result[form]).not.toBe('(not available)');
      }
    }
  });

  it('never appears in getAllConjugatedVerbs() output', async () => {
    const all = await getAllConjugatedVerbs();
    for (const verb of all) {
      for (const form of ['presens', 'preteritum', 'supinum', 'imperativ'] as const) {
        expect(verb[form]).not.toBe('(not available)');
      }
    }
  });
});

describe('getVerbs - id scheme', () => {
  it('assigns ids as String(index + 1), matching VERB_DATA order', async () => {
    const verbs = await getVerbs();
    expect(verbs[0]).toEqual({
      id: '1',
      infinitive: VERB_DATA[0].infinitive,
      cefr: VERB_DATA[0].cefr,
    });
    expect(verbs[1]).toEqual({
      id: '2',
      infinitive: VERB_DATA[1].infinitive,
      cefr: VERB_DATA[1].cefr,
    });
    expect(verbs[verbs.length - 1].id).toBe(String(VERB_DATA.length));
  });

  // KNOWN ISSUE (see CLAUDE.md "Known issues"): ids are positional, not
  // content-derived. Any reorder or insertion in VERB_DATA silently
  // reassigns every id after the change point, and therefore reassigns
  // every SRS item keyed on `${verbId}-${form}` in a user's stored progress
  // to a *different verb* without any migration or warning.
  // Owner: swedish-linguist (src/data/verbData.ts, src/lib/verbs.ts).
  it('documents that ids are unstable under reordering of VERB_DATA (fragility, not a passing contract)', async () => {
    vi.resetModules();
    vi.doMock('@/data/verbData', () => ({
      VERB_DATA: [
        {
          cefr: 'A1',
          infinitive: 'alpha',
          imperativ: 'a',
          presens: 'a',
          preteritum: 'a',
          supinum: 'a',
        },
        {
          cefr: 'A1',
          infinitive: 'beta',
          imperativ: 'b',
          presens: 'b',
          preteritum: 'b',
          supinum: 'b',
        },
      ],
    }));
    const { getVerbs: getVerbsWithOriginalOrder } = await import('@/lib/verbs');
    const originalOrder = await getVerbsWithOriginalOrder();
    expect(originalOrder.find((v) => v.infinitive === 'beta')?.id).toBe('2');

    vi.resetModules();
    vi.doMock('@/data/verbData', () => ({
      VERB_DATA: [
        {
          cefr: 'A1',
          infinitive: 'beta',
          imperativ: 'b',
          presens: 'b',
          preteritum: 'b',
          supinum: 'b',
        },
        {
          cefr: 'A1',
          infinitive: 'alpha',
          imperativ: 'a',
          presens: 'a',
          preteritum: 'a',
          supinum: 'a',
        },
      ],
    }));
    const { getVerbs: getVerbsReordered } = await import('@/lib/verbs');
    const reordered = await getVerbsReordered();

    // Same verb, same SRS itemId prefix would now point at a different id
    // once its position in VERB_DATA changes.
    expect(reordered.find((v) => v.infinitive === 'beta')?.id).toBe('1');

    vi.resetModules();
    vi.doUnmock('@/data/verbData');
  });
});

describe('generateVerbPattern - imperativ special case', () => {
  it('uses the "Command form of ..." display and a single two-part pattern', async () => {
    const pattern = await generateVerbPattern('gå', 'imperativ');
    expect(pattern.missingForm).toBe('imperativ');
    expect(pattern.display).toBe('Command form of "gå"');
    expect(pattern.patternParts).toEqual([
      { form: 'infinitive', text: 'gå', isMissing: false },
      { form: 'imperativ', text: '_____', isMissing: true },
    ]);
  });
});

describe('generateVerbPattern - 4-slot pattern', () => {
  it('fills infinitive/presens/preteritum/supinum with exactly one blank at the target form', async () => {
    const pattern = await generateVerbPattern('vara', 'presens');
    expect(pattern.missingForm).toBe('presens');
    expect(pattern.patternParts.map((p) => p.form)).toEqual([
      'infinitive',
      'presens',
      'preteritum',
      'supinum',
    ]);

    const blanks = pattern.patternParts.filter((p) => p.isMissing);
    expect(blanks).toHaveLength(1);
    expect(blanks[0].form).toBe('presens');
    expect(blanks[0].text).toBe('_____');

    expect(pattern.patternParts.find((p) => p.form === 'infinitive')?.text).toBe('vara');
    expect(pattern.patternParts.find((p) => p.form === 'preteritum')?.text).toBe('var');
    expect(pattern.patternParts.find((p) => p.form === 'supinum')?.text).toBe('varit');

    expect(pattern.display).toBe('vara – _____ – var – varit');
  });

  it('places the blank at preteritum when that is the target form, leaving the rest filled', async () => {
    const pattern = await generateVerbPattern('ha', 'preteritum');
    expect(pattern.display).toBe('ha – har – _____ – haft');
    expect(pattern.patternParts.filter((p) => p.isMissing)).toEqual([
      { form: 'preteritum', text: '_____', isMissing: true },
    ]);
  });
});

describe('getVerbGrupp', () => {
  it('returns the stored grupp for a verb that has one assigned', () => {
    const withGrupp = VERB_DATA.find((v) => v.grupp !== undefined);
    expect(withGrupp).toBeDefined();
    expect(getVerbGrupp(withGrupp!.infinitive)).toBe(withGrupp!.grupp);
  });

  it('returns undefined ("unknown") for a verb not present in VERB_DATA at all (lookup miss)', () => {
    expect(getVerbGrupp('this-infinitive-does-not-exist')).toBeUndefined();
  });

  // Regression: "vända", "söka" and "lägga" were previously flagged NEEDS
  // HUMAN REVIEW and returned undefined here. Their forms were corrected
  // and a real grupp assigned (issue #34, PR #85); the public API must now
  // surface that real grupp rather than the stale "flagged" undefined.
  it.each([
    ['vända', '2a'],
    ['söka', '2b'],
    ['lägga', '4'],
  ])(
    'returns the corrected grupp "%s" -> "%s", no longer flagged for review',
    (infinitive, grupp) => {
      expect(VERB_DATA.some((v) => v.infinitive === infinitive)).toBe(true);
      expect(getVerbGrupp(infinitive)).toBe(grupp);
    },
  );

  it('returns one of the five valid conjugation classes for every verb that has a grupp assigned', () => {
    const valid = new Set(['1', '2a', '2b', '3', '4']);
    for (const verb of VERB_DATA) {
      if (verb.grupp !== undefined) {
        expect(valid.has(getVerbGrupp(verb.infinitive)!)).toBe(true);
      }
    }
  });
});

describe('getFormLabel / getFormHint', () => {
  it('returns a non-empty label and hint for every Form', () => {
    for (const form of ALL_FORMS) {
      expect(getFormLabel(form)).toEqual(expect.any(String));
      expect(getFormLabel(form).length).toBeGreaterThan(0);
      expect(getFormHint(form)).toEqual(expect.any(String));
      expect(getFormHint(form).length).toBeGreaterThan(0);
    }
  });

  it('gives each form a distinct label (no accidental duplicate mapping)', () => {
    const labels = ALL_FORMS.map(getFormLabel);
    expect(new Set(labels).size).toBe(ALL_FORMS.length);
  });
});
