import { getVerbs, conjugateVerb, type Form } from '../../src/lib/verbs';
import { initializeSrsState, type SrsState } from '../../src/lib/srs';

// Mirrors the STORAGE_KEY constants that useSrsProgress.ts / useSettings.ts
// keep private to themselves (src/hooks owned by srs-engine). Duplicated
// here deliberately: e2e tests seed the public contract (the localStorage
// key + shape), not an internal it happens to import. If either key
// changes, these tests should fail loudly, not silently reach into src.
export const SRS_STORAGE_KEY = 'swedish-verbs-srs-progress';
export const SETTINGS_STORAGE_KEY = 'swedish-verbs-settings';

const FORMS: Form[] = ['presens', 'preteritum', 'supinum', 'imperativ'];

// Ten years out is "never due" for a smoke test without being a magic
// far-future sentinel some future SRS change could accidentally trip on.
export const FAR_FUTURE_DUE_AT = Date.now() + 1000 * 60 * 60 * 24 * 365 * 10;

/**
 * Builds a full SRS state blob covering every verb+form item the app would
 * otherwise lazily initialize as "due now" on first load. Every item is
 * pushed far into the future by default so tests control *exactly* which
 * items are due by passing overrides, instead of depending on however many
 * verbs happen to be in VERB_DATA today.
 */
export async function buildFullSeed(
  overrides: Record<string, Partial<SrsState>> = {},
): Promise<Record<string, SrsState>> {
  const verbs = await getVerbs();
  const states: Record<string, SrsState> = {};

  for (const verb of verbs) {
    const conjugated = await conjugateVerb(verb.infinitive);
    for (const form of FORMS) {
      const value = conjugated[form];
      if (!value || value === '(not available)') continue;

      const itemId = `${verb.id}-${form}`;
      states[itemId] = {
        ...initializeSrsState(itemId),
        dueAt: FAR_FUTURE_DUE_AT,
      };
    }
  }

  for (const [itemId, patch] of Object.entries(overrides)) {
    states[itemId] = { ...states[itemId], ...patch, itemId };
  }

  return states;
}

/** Convenience: seed exactly one item as due right now, everything else future. */
export async function buildSingleDueSeed(itemId: string): Promise<Record<string, SrsState>> {
  return buildFullSeed({ [itemId]: { dueAt: Date.now() } });
}
