import { describe, it, expect, vi } from 'vitest';
import {
  conjugateVerb,
  generateVerbPattern,
  getFormLabel,
  getFormHint,
  getVerbs,
  getVerbGrupp,
  type Form,
} from '@/lib/verbs';
import { VERB_DATA } from '@/data/verbData';

const ALL_FORMS: Form[] = ['infinitive', 'presens', 'preteritum', 'supinum', 'imperativ'];

describe('conjugateVerb - known verb', () => {
  // issue #53: ids are now the verb's infinitive, not its 1-based position
  // in VERB_DATA, so SRS progress keyed on id survives reordering the table.
  it('returns the conjugated forms and an infinitive-derived id for a verb that exists', async () => {
    const result = await conjugateVerb('vara');
    expect(result).toEqual({
      id: 'vara',
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
  // issue #53: ids are the verb's infinitive (content-derived), not
  // String(index + 1) (position-derived).
  it("assigns ids as the verb's infinitive, matching VERB_DATA content rather than position", async () => {
    const verbs = await getVerbs();
    expect(verbs[0]).toEqual({
      id: VERB_DATA[0].infinitive,
      infinitive: VERB_DATA[0].infinitive,
      cefr: VERB_DATA[0].cefr,
    });
    expect(verbs[1]).toEqual({
      id: VERB_DATA[1].infinitive,
      infinitive: VERB_DATA[1].infinitive,
      cefr: VERB_DATA[1].cefr,
    });
    expect(verbs[verbs.length - 1].id).toBe(VERB_DATA[VERB_DATA.length - 1].infinitive);
    for (const verb of verbs) {
      expect(verb.id).toBe(verb.infinitive);
    }
  });

  // Pin the current contract (see CLAUDE.md "Known issues" / id stability):
  // ids are index-derived positional strings would have broken this;
  // infinitive-derived ids require every infinitive in the table to be
  // unique, or two verbs would silently share an id (and therefore share
  // one SRS progress record). This is also the invariant the SRS
  // positional-id migration (useSrsProgress.ts, issue #53) depends on when
  // it re-verifies uniqueness at runtime before mapping legacy ids.
  it('has a unique infinitive for every row in VERB_DATA (required for id uniqueness and the SRS migration)', () => {
    const infinitives = VERB_DATA.map((v) => v.infinitive);
    expect(new Set(infinitives).size).toBe(infinitives.length);
  });

  // REGRESSION (issue #53, fixed bug): ids used to be
  // `String(VERB_DATA.indexOf(verb) + 1)`, so the same verb got a different
  // id whenever the table was reordered or a row was inserted before it —
  // silently reattaching that verb's stored SRS progress to a different verb
  // (see CLAUDE.md "Known issues"). ids are now the verb's infinitive, which
  // does not depend on table order.
  it("keeps a verb's id stable across a VERB_DATA reorder, unlike the old positional scheme", async () => {
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
    const originalId = originalOrder.find((v) => v.infinitive === 'beta')?.id;
    expect(originalId).toBe('beta');

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
    const reorderedId = reordered.find((v) => v.infinitive === 'beta')?.id;

    // Same verb, same id, regardless of position: an SRS store keyed on
    // verb.id survives a VERB_DATA reorder/insert without corruption.
    expect(reorderedId).toBe('beta');
    expect(reorderedId).toBe(originalId);

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
