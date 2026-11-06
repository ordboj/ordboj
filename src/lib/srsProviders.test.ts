import { describe, it, expect } from 'vitest';
import { createConjugationProvider, SCHEDULED_FORMS } from '@/lib/srsProviders';
import { conjugationItemId } from '@/lib/itemIds';
import { getVerbs, getAllConjugatedVerbs } from '@/lib/verbs';
import { VERB_DATA } from '@/data/verbData';

describe('conjugation provider - eager init ids', () => {
  it('covers every verb in every scheduled form', async () => {
    const ids = await createConjugationProvider().listEagerInitIds();
    expect(ids.length).toBe(VERB_DATA.length * SCHEDULED_FORMS.length);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('does not narrow by CEFR selection', async () => {
    // The stored key set must not depend on which levels the learner
    // happened to have selected the first time the app loaded, or turning a
    // level on later would look like brand-new material.
    const all = await createConjugationProvider().listEagerInitIds();
    const narrow = await createConjugationProvider(['A1']).listEagerInitIds();
    const none = await createConjugationProvider([]).listEagerInitIds();
    expect(narrow).toEqual(all);
    expect(none).toEqual(all);
  });

  it('includes forms the verb does not have, matching what the store already holds', async () => {
    // `kunna` is a modal: no imperativ. Its state key has always existed.
    const verbs = await getVerbs();
    const kunna = verbs.find((verb) => verb.infinitive === 'kunna');
    expect(kunna).toBeDefined();
    const ids = await createConjugationProvider().listEagerInitIds();
    expect(ids).toContain(conjugationItemId(kunna!.id, 'imperativ'));
  });
});

describe('conjugation provider - available items', () => {
  it('omits forms a verb does not have', async () => {
    const verbs = await getVerbs();
    const kunna = verbs.find((verb) => verb.infinitive === 'kunna')!;
    const items = await createConjugationProvider().listAvailableItems();
    const kunnaForms = items.filter((item) => item.verbId === kunna.id).map((item) => item.form);
    expect(kunnaForms).not.toContain('imperativ');
    expect(kunnaForms).toContain('presens');
  });

  it('honors an explicit CEFR selection', async () => {
    const items = await createConjugationProvider(['A1']).listAvailableItems();
    const verbs = await getVerbs();
    const byId = new Map(verbs.map((verb) => [verb.id, verb]));
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => byId.get(item.verbId)?.cefr === 'A1')).toBe(true);
  });

  it('treats an empty selection as zero verbs, not as "no filter" (#137)', async () => {
    expect(await createConjugationProvider([]).listAvailableItems()).toEqual([]);
  });

  it('treats undefined as no filter at all', async () => {
    const unfiltered = await createConjugationProvider().listAvailableItems();
    const conjugated = await getAllConjugatedVerbs();
    const expected = conjugated.reduce(
      (count, verb) =>
        count +
        SCHEDULED_FORMS.filter((form) => verb[form] && verb[form] !== '(not available)').length,
      0,
    );
    expect(unfiltered.length).toBe(expected);
  });

  it('builds item ids through the shared helper', async () => {
    const items = await createConjugationProvider().listAvailableItems();
    expect(items.every((item) => item.itemId === conjugationItemId(item.verbId, item.form))).toBe(
      true,
    );
  });
});

// ORD-87 default: an empty phraseBound imperativ stays out of the deck
// (piffa, bry). ORD-102: a non-empty stored imperativ is an explicit human
// override, so slappna and tråka yield all four scheduled forms. This is the
// end-to-end proof that toConjugatedVerb (src/lib/verbs.ts) no longer
// hard-suppresses every phraseBound imperativ.
describe('conjugation provider - phraseBound imperativ (ORD-87, ORD-102)', () => {
  async function scheduledForms(infinitive: string): Promise<string[]> {
    const verbs = await getVerbs();
    const verb = verbs.find((v) => v.infinitive === infinitive);
    expect(verb).toBeDefined();
    const items = await createConjugationProvider().listAvailableItems();
    return items
      .filter((item) => item.verbId === verb!.id)
      .map((item) => item.form)
      .sort();
  }

  it.each(['bry', 'piffa'] as const)(
    'yields exactly presens/preteritum/supinum, no imperativ item, for empty phraseBound verb "%s"',
    async (infinitive) => {
      expect(await scheduledForms(infinitive)).toEqual(['presens', 'preteritum', 'supinum']);
    },
  );

  it.each(['slappna', 'tråka'] as const)(
    'yields all four scheduled forms, including imperativ, for phraseBound verb "%s"',
    async (infinitive) => {
      expect(await scheduledForms(infinitive)).toEqual([
        'imperativ',
        'presens',
        'preteritum',
        'supinum',
      ]);
    },
  );

  it('schedules a non-empty phraseBound imperativ and skips an empty one (ORD-102)', async () => {
    expect(await scheduledForms('slappna')).toContain('imperativ');
    expect(await scheduledForms('tråka')).toContain('imperativ');
    expect(await scheduledForms('piffa')).not.toContain('imperativ');
    expect(await scheduledForms('bry')).not.toContain('imperativ');
  });

  it('yields all 4 scheduled forms, including imperativ, for an ordinary control verb', async () => {
    const verbs = await getVerbs();
    const vara = verbs.find((v) => v.infinitive === 'vara');
    expect(vara).toBeDefined();

    const items = await createConjugationProvider().listAvailableItems();
    const forms = items
      .filter((item) => item.verbId === vara!.id)
      .map((item) => item.form)
      .sort();
    expect(forms).toEqual(['imperativ', 'presens', 'preteritum', 'supinum']);
  });
});
