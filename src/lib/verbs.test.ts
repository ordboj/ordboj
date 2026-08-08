import { describe, it, expect, vi } from 'vitest';
import {
  conjugateVerb,
  generateVerbPattern,
  getFormLabel,
  getFormHint,
  getExampleSentence,
  getVerbs,
  getVerbGrupp,
  getAlternateForms,
  getAcceptedAnswers,
  getAlternatesDisclosure,
  isAcceptedAnswer,
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
  it('falls back to id "unknown" and "(not available)" for every conjugated form', async () => {
    const result = await conjugateVerb('this-infinitive-does-not-exist');
    expect(result).toEqual({
      id: 'unknown',
      infinitive: 'this-infinitive-does-not-exist',
      presens: '(not available)',
      preteritum: '(not available)',
      supinum: '(not available)',
      imperativ: '(not available)',
    });
  });
});

describe('conjugateVerb - "(not available)" fallback for a known verb missing one form', () => {
  it('reports "(not available)" for a verb whose imperativ is an empty string in VERB_DATA', async () => {
    const source = VERB_DATA.find((v) => v.infinitive === 'kunna');
    expect(source?.imperativ).toBe(''); // pins the fixture assumption this test relies on

    const result = await conjugateVerb('kunna');
    expect(result.imperativ).toBe('(not available)');
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

  // Tickets #229/#44: labels are the Swedish grammar terms a learner meets in
  // class, not the old English words ("Infinitive", "Present", "Past",
  // "Supine", "Imperative"). Pinned exactly so a future change to the label
  // set is loud, not a silent drift back to English or to "Imperfekt" (the
  // older, no-longer-taught name for the simple past).
  it('returns the exact Swedish term for every form', () => {
    expect(getFormLabel('infinitive')).toBe('Infinitiv');
    expect(getFormLabel('presens')).toBe('Presens');
    expect(getFormLabel('preteritum')).toBe('Preteritum');
    expect(getFormLabel('supinum')).toBe('Supinum');
    expect(getFormLabel('imperativ')).toBe('Imperativ');
  });

  it('never labels preteritum (or any other form) "Imperfekt"', () => {
    for (const form of ALL_FORMS) {
      expect(getFormLabel(form)).not.toBe('Imperfekt');
    }
  });

  // The Swedish term must lead the hint (not just appear somewhere in it),
  // with the English gloss trailing in parentheses for a learner who doesn't
  // know the term yet.
  it('leads each hint with its Swedish term', () => {
    expect(getFormHint('infinitive').startsWith('Infinitiv:')).toBe(true);
    expect(getFormHint('presens').startsWith('Presens:')).toBe(true);
    expect(getFormHint('preteritum').startsWith('Preteritum:')).toBe(true);
    expect(getFormHint('supinum').startsWith('Supinum:')).toBe(true);
    expect(getFormHint('imperativ').startsWith('Imperativ:')).toBe(true);
  });
});

// Tickets #229/#44: only vara, ha and gå have hand-written example sentences.
// Every other verb+form must return null (never a "[Example with ...]"
// placeholder, which taught nothing and read as a bug).
describe('getExampleSentence', () => {
  it('returns null for a verb with no hand-written examples', () => {
    expect(getExampleSentence('tala', 'presens')).toBeNull();
    expect(getExampleSentence('tala', 'preteritum')).toBeNull();
  });

  it('returns null for an unknown infinitive', () => {
    expect(getExampleSentence('this-infinitive-does-not-exist', 'presens')).toBeNull();
  });

  it('returns the real Swedish sentence for a fixture verb + form that has one', () => {
    expect(getExampleSentence('vara', 'presens')).toBe('Jag är glad');
  });
});

// Issue #123: "lade" (lägga preteritum) and "sade" (säga preteritum) are
// documented SAOL alternates for their respective primary short forms
// ("la", "sa"). These pin AC2 ("checker accepts documented alternate forms")
// at the lib level, independent of the UI.
describe('getAlternateForms', () => {
  it('returns the documented alternate(s) for lägga preteritum ("lade" alongside primary "la")', () => {
    expect(getAlternateForms('lägga', 'preteritum')).toEqual(['lade']);
  });

  it('returns the documented alternate(s) for säga preteritum ("sade" alongside primary "sa")', () => {
    expect(getAlternateForms('säga', 'preteritum')).toEqual(['sade']);
  });

  it('returns an empty array for a verb+form with no documented alternate (the common case)', () => {
    expect(getAlternateForms('vara', 'presens')).toEqual([]);
  });

  it('returns an empty array for an unknown infinitive (lookup miss)', () => {
    expect(getAlternateForms('this-infinitive-does-not-exist', 'preteritum')).toEqual([]);
  });

  it('returns an empty array for "infinitive" even for a verb that has alternates on other forms', () => {
    // Alternates are not modeled for the dictionary form itself.
    expect(getAlternateForms('lägga', 'infinitive')).toEqual([]);
  });

  it("does not leak lägga's preteritum alternate onto a different form of the same verb", () => {
    expect(getAlternateForms('lägga', 'presens')).toEqual([]);
    expect(getAlternateForms('lägga', 'supinum')).toEqual([]);
  });
});

describe('isAcceptedAnswer', () => {
  it('accepts the primary stored form', () => {
    expect(isAcceptedAnswer('lägga', 'preteritum', 'la')).toBe(true);
  });

  it('accepts a documented alternate form even though it differs from the primary form', () => {
    expect(isAcceptedAnswer('lägga', 'preteritum', 'lade')).toBe(true);
    expect(isAcceptedAnswer('säga', 'preteritum', 'sade')).toBe(true);
  });

  it('normalizes the alternate match the same way as the primary match: case-insensitive and trimmed', () => {
    expect(isAcceptedAnswer('lägga', 'preteritum', '  LADE  ')).toBe(true);
    expect(isAcceptedAnswer('säga', 'preteritum', '  SaDe ')).toBe(true);
  });

  it('rejects an answer that matches neither the primary form nor any documented alternate', () => {
    expect(isAcceptedAnswer('lägga', 'preteritum', 'lagg')).toBe(false);
    expect(isAcceptedAnswer('säga', 'preteritum', 'sager')).toBe(false);
  });

  it('does not broaden acceptance for a verb+form with no documented alternates: only the primary form is accepted', () => {
    expect(isAcceptedAnswer('vara', 'presens', 'är')).toBe(true);
    expect(isAcceptedAnswer('vara', 'presens', 'var')).toBe(false);
  });

  it('does not accept an alternate documented for a different form of the same verb', () => {
    // "lade" is only a documented alternate for lägga's preteritum, not its presens.
    expect(isAcceptedAnswer('lägga', 'presens', 'lade')).toBe(false);
  });
});

// Product policy P1 (docs/product/2026-08-08-alternate-answers-decision.md):
// an ordered accepted-answer list per verb+form, primary always at index 0,
// looked up from VERB_DATA itself rather than trusted from the caller.
describe('getAcceptedAnswers', () => {
  it('returns the primary first, alternates after, for a form with a documented alternate', () => {
    expect(getAcceptedAnswers('lägga', 'preteritum')).toEqual(['la', 'lade']);
    expect(getAcceptedAnswers('säga', 'preteritum')).toEqual(['sa', 'sade']);
  });

  it('returns a single-entry list (just the primary) for a form with no documented alternate', () => {
    expect(getAcceptedAnswers('vara', 'presens')).toEqual(['är']);
  });

  it('falls back to the "(not available)" sentinel for an unknown infinitive, matching conjugateVerb', () => {
    expect(getAcceptedAnswers('this-infinitive-does-not-exist', 'preteritum')).toEqual([
      '(not available)',
    ]);
  });

  it('falls back to the "(not available)" sentinel for a form with no primary value (e.g. imperativ stored as ""), never an empty list', () => {
    expect(getAcceptedAnswers('kunna', 'imperativ')).toEqual(['(not available)']);
  });

  it('returns the infinitive itself for form "infinitive"', () => {
    expect(getAcceptedAnswers('lägga', 'infinitive')).toEqual(['lägga']);
  });
});

// Product policy P6: the feedback panel discloses the other accepted forms
// when a card's accepted set has more than one entry.
describe('getAlternatesDisclosure', () => {
  it('returns null for a form with no documented alternate (the common case)', () => {
    expect(getAlternatesDisclosure('vara', 'presens')).toBeNull();
  });

  it('names the alternate for a form that has one', () => {
    expect(getAlternatesDisclosure('lägga', 'preteritum')).toContain('lade');
    expect(getAlternatesDisclosure('säga', 'preteritum')).toContain('sade');
  });
});
