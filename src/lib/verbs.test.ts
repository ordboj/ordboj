import { describe, it, expect, vi, afterEach } from 'vitest';
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
  isImperativNotApplicable,
  getAllConjugatedVerbs,
  type Form,
} from '@/lib/verbs';
import { VERB_DATA } from '@/data/verbData';

const ALL_FORMS: Form[] = ['infinitive', 'presens', 'preteritum', 'supinum', 'imperativ'];

describe('conjugateVerb - known verb', () => {
  it('returns the conjugated forms and an infinitive-derived id for a verb that exists (issue #53)', async () => {
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

// Issue #124: modal verbs (kunna, få, vilja) grammatically have no
// imperativ in Swedish. isImperativNotApplicable() and the
// ConjugatedVerb.imperativNotApplicable field let a consumer tell that
// apart from "not filled in yet" instead of relying solely on the
// "(not available)" placeholder string.
describe('isImperativNotApplicable (issue #124)', () => {
  it.each(['kunna', 'få', 'vilja'] as const)('returns true for modal verb "%s"', (infinitive) => {
    expect(isImperativNotApplicable(infinitive)).toBe(true);
  });

  it('returns false for a non-modal verb that has a real imperativ', () => {
    expect(isImperativNotApplicable('vara')).toBe(false);
  });

  it('returns false for a verb not found in VERB_DATA (lookup miss) - never guesses "true" for an unknown verb', () => {
    expect(isImperativNotApplicable('this-infinitive-does-not-exist')).toBe(false);
  });

  // "te sig" and "anse" have an empty imperativ pending human review
  // (issue #132), which is a different fact from "grammatically confirmed
  // absent" (issue #124). Conflating the two would let the UI treat an
  // unconfirmed gap as a settled grammatical fact.
  it.each(['te sig', 'anse'] as const)(
    'returns false for "%s" even though its imperativ is still empty (empty-pending-review is not the same as confirmed-absent)',
    (infinitive) => {
      expect(isImperativNotApplicable(infinitive)).toBe(false);
    },
  );
});

describe('conjugateVerb / getAllConjugatedVerbs - imperativNotApplicable flag (issue #124)', () => {
  it('flags kunna imperativNotApplicable: true', async () => {
    const result = await conjugateVerb('kunna');
    expect(result.imperativNotApplicable).toBe(true);
  });

  it('does not flag a non-modal verb (vara) even though it has a real imperativ', async () => {
    const result = await conjugateVerb('vara');
    expect(result.imperativNotApplicable).toBeFalsy();
  });

  it('does not flag the unknown-verb fallback: the app has no basis to claim the form does not exist', async () => {
    const result = await conjugateVerb('this-infinitive-does-not-exist');
    expect(result.imperativNotApplicable).toBeFalsy();
  });

  it('flags exactly the three modal verbs (få, kunna, vilja) across the whole table, no more, no fewer', async () => {
    const all = await getAllConjugatedVerbs();
    const flagged = all
      .filter((v) => v.imperativNotApplicable)
      .map((v) => v.infinitive)
      .sort();
    expect(flagged).toEqual(['få', 'kunna', 'vilja']);
  });

  it.each(['te sig', 'anse'] as const)(
    'does not flag "%s" even though its imperativ is still "(not available)" pending human review',
    async (infinitive) => {
      const result = await conjugateVerb(infinitive);
      expect(result.imperativ).toBe('(not available)');
      expect(result.imperativNotApplicable).toBeFalsy();
    },
  );
});

describe('getVerbs - id scheme', () => {
  it('assigns ids as the verb infinitive itself (issue #53)', async () => {
    const verbs = await getVerbs();
    expect(verbs[0]).toEqual({
      id: VERB_DATA[0]!.infinitive,
      infinitive: VERB_DATA[0]!.infinitive,
      cefr: VERB_DATA[0]!.cefr,
    });
    expect(verbs[1]).toEqual({
      id: VERB_DATA[1]!.infinitive,
      infinitive: VERB_DATA[1]!.infinitive,
      cefr: VERB_DATA[1]!.cefr,
    });
    expect(verbs[verbs.length - 1]!.id).toBe(VERB_DATA[VERB_DATA.length - 1]!.infinitive);
  });

  // Regression test for issue #53: ids used to be positional
  // (`String(index + 1)`), so any reorder or insertion in VERB_DATA silently
  // reassigned every id after the change point, and therefore reassigned
  // every SRS item keyed on `${verbId}-${form}` in a user's stored progress
  // to a *different verb* without any migration or warning. The id is now
  // the infinitive itself, so a verb's id survives a reorder intact.
  // Owner: swedish-linguist (src/data/verbData.ts, src/lib/verbs.ts).
  it('keeps a verb id stable when VERB_DATA is reordered', async () => {
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
    expect(originalOrder.find((v) => v.infinitive === 'beta')?.id).toBe('beta');

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

    // Same verb, same SRS itemId prefix: the id does not move even though
    // its position in VERB_DATA changed from index 1 to index 0.
    expect(reordered.find((v) => v.infinitive === 'beta')?.id).toBe('beta');

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
    expect(blanks[0]!.form).toBe('presens');
    expect(blanks[0]!.text).toBe('_____');

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

// Issue #43/C6a (docs/learning/2026-08-08-verb-data-conventions.md,
// acceptance check 6): a sense-conditioned alternate pair (e.g. lyda
// preteritum "lydde" for "obey" vs "löd" for "read as/state") must not get
// the generic "Both X and Y are correct." line, because that line asserts
// free interchangeability, which is false Swedish for a sense split.
// VERB_DATA ships no row with alternatesNote yet (lyda/svälta are CSV-only,
// per docs section 7), so this is tested via a mocked VERB_DATA fixture --
// the same pattern already used for the id-stability test above -- rather
// than against a shipped row that does not exist.
describe('getAlternatesDisclosure - alternatesNote override (issue #43/C6a)', () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('@/data/verbData');
  });

  it('returns the alternatesNote text instead of the generic "Both ... are correct." line when one is set for the graded form', async () => {
    vi.resetModules();
    vi.doMock('@/data/verbData', async () => {
      const actual = await vi.importActual<typeof import('@/data/verbData')>('@/data/verbData');
      return {
        ...actual,
        VERB_DATA: [
          ...actual.VERB_DATA,
          {
            cefr: 'A2',
            infinitive: 'lyda-fixture',
            imperativ: 'lyd',
            presens: 'lyder',
            preteritum: 'lydde',
            supinum: 'lytt',
            grupp: '2a',
            alternates: { preteritum: ['löd'] },
            alternatesNote: {
              preteritum: 'lydde = obey; löd = read as/state a text (different senses).',
            },
          },
        ],
      };
    });

    const { getAlternatesDisclosure: getAlternatesDisclosureMocked } = await import('@/lib/verbs');

    const disclosure = getAlternatesDisclosureMocked('lyda-fixture', 'preteritum');
    expect(disclosure).toBe('lydde = obey; löd = read as/state a text (different senses).');
    expect(disclosure).not.toMatch(/^Both .* are correct\.$/);
  });

  it('falls back to the generic "Both ... are correct." line for a free-variant pair with no alternatesNote (unchanged #123 behavior)', async () => {
    vi.resetModules();
    vi.doMock('@/data/verbData', async () => {
      const actual = await vi.importActual<typeof import('@/data/verbData')>('@/data/verbData');
      return {
        ...actual,
        VERB_DATA: [
          ...actual.VERB_DATA,
          {
            cefr: 'A2',
            infinitive: 'free-variant-fixture',
            imperativ: 'x',
            presens: 'x',
            preteritum: 'primary-form',
            supinum: 'x',
            grupp: '2a',
            alternates: { preteritum: ['alt-form'] },
            // deliberately no alternatesNote
          },
        ],
      };
    });

    const { getAlternatesDisclosure: getAlternatesDisclosureMocked } = await import('@/lib/verbs');

    expect(getAlternatesDisclosureMocked('free-variant-fixture', 'preteritum')).toBe(
      'Both primary-form and alt-form are correct.',
    );
  });
});

// Issue #43/C2 (docs/learning/2026-08-08-verb-data-conventions.md): a
// lemma's `note` field may name an archaic or colloquial variant
// (e.g. "taga" for "ta", "giva" for "ge"), but that variant must never
// join the accepted-answer set -- it is recognition-only prose, not a
// stored form. Regression guard for the exact defect #43 rules out: before
// this convention, an annotated lemma like "ta (el. taga)" risked the
// parenthetical leaking into what the app accepts or displays.
describe('note field never widens the accepted-answer set (issue #43/C2)', () => {
  it.each([
    ['ta', 'taga'],
    ['ge', 'giva'],
  ] as const)(
    'VERB_DATA flags a "%s" -> "%s" note, but "%s" is never among any accepted answer for "%s"',
    (infinitive, archaicVariant) => {
      const row = VERB_DATA.find((v) => v.infinitive === infinitive);
      expect(row).toBeDefined();
      expect(row?.note).toMatch(new RegExp(archaicVariant, 'i'));

      for (const form of ALL_FORMS) {
        const accepted = getAcceptedAnswers(infinitive, form).map((a) => a.trim().toLowerCase());
        expect(accepted).not.toContain(archaicVariant.toLowerCase());
        expect(isAcceptedAnswer(infinitive, form, archaicVariant)).toBe(false);
      }
    },
  );

  // General invariant, not just the two named rows above: no row's `note`
  // field is ever consulted by getAcceptedAnswers/getAlternateForms. Those
  // two functions only ever read `presens`/`preteritum`/`supinum`/
  // `imperativ`/`alternates` off VERB_DATA (see src/lib/verbs.ts) and never
  // `note`, but this pins that contract at the behavior level: every row's
  // accepted-answer set for every form is a subset of that row's own
  // primary + alternates fields, independent of what its `note` says.
  it("never lets any row's note text appear as an accepted answer for a form it was not stored on", () => {
    for (const verb of VERB_DATA) {
      if (!verb.note) continue;
      const storedValues = new Set(
        [verb.infinitive, verb.presens, verb.preteritum, verb.supinum, verb.imperativ]
          .filter((v): v is string => !!v)
          .map((v) => v.toLowerCase()),
      );
      storedValues.add('(not available)');
      for (const alts of Object.values(verb.alternates ?? {})) {
        for (const alt of alts as string[]) storedValues.add(alt.toLowerCase());
      }
      for (const form of ALL_FORMS) {
        for (const answer of getAcceptedAnswers(verb.infinitive, form)) {
          expect(storedValues.has(answer.toLowerCase())).toBe(true);
        }
      }
    }
  });
});
