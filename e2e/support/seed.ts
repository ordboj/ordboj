import { getVerbs, conjugateVerb, type Form } from '../../src/lib/verbs';
import { initializeSrsState, type SrsState } from '../../src/lib/srs';
import { particleItemId } from '../../src/lib/itemIds';
import { getVerifiedParticleVerbs } from '../../src/lib/particleVerbs';

// Mirrors the STORAGE_KEY constants that useSrsProgress.ts / useSettings.ts
// keep private to themselves (src/hooks owned by srs-engine). Duplicated
// here deliberately: e2e tests seed the public contract (the localStorage
// key + shape), not an internal it happens to import. If either key
// changes, these tests should fail loudly, not silently reach into src.
export const SRS_STORAGE_KEY = 'swedish-verbs-srs-progress';
export const SETTINGS_STORAGE_KEY = 'swedish-verbs-settings';

// The current on-disk envelope version (useSrsProgress.ts, STORAGE_VERSION).
// Duplicated here for the same reason as the storage keys above: seeding the
// public on-disk contract, not importing a private constant.
export const CURRENT_STORAGE_VERSION = 3;

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
 *
 * Returned items always carry `itemId` (initializeSrsState's shape) — this
 * is the in-memory SrsState shape, not what goes on disk. Use
 * `toV3Envelope` (current storage) or `buildLegacyV1Seed`'s own serialized
 * form (pre-v3 storage, opt-in only) to turn this into bytes for
 * localStorage.
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
    if (!states[itemId]) {
      throw new Error(
        `seed override "${itemId}" is not an item this build generates. ` +
          'Item ids are `${verb.id}-${form}` and verb.id is the infinitive (issue #53).',
      );
    }
    states[itemId] = { ...states[itemId], ...patch, itemId };
  }

  return states;
}

/** Convenience: seed exactly one item as due right now, everything else future. */
export async function buildSingleDueSeed(itemId: string): Promise<Record<string, SrsState>> {
  return buildFullSeed({ [itemId]: { dueAt: Date.now() } });
}

// Serializes an in-memory SrsState map (buildFullSeed / buildSingleDueSeed's
// return shape) into the current v3 on-disk envelope: `{ version, items }`,
// with `itemId` stripped from every item because under v3 the map key *is*
// the id (issue #53; the exact contract useSrsProgress.ts's toStoredItems
// enforces on every real write). Before this helper existed, seed.ts wrote
// the bare `{ itemId, ...state }` map straight to localStorage with no
// envelope at all — the legacy pre-v3 shape — which meant every seeded e2e
// run silently exercised the legacy-migration code path (including the
// one-time ease rebase) instead of the v3 read path every real post-#53
// install is actually on. Every spec that seeds SRS_STORAGE_KEY must go
// through this (or buildLegacyV1Seed, for the one spec that deliberately
// wants the legacy path).
export function toV3Envelope(items: Record<string, SrsState>): string {
  const stored: Record<string, Omit<SrsState, 'itemId'>> = {};
  for (const [itemId, state] of Object.entries(items)) {
    const { itemId: _drop, ...rest } = state;
    stored[itemId] = rest;
  }
  return JSON.stringify({ version: CURRENT_STORAGE_VERSION, items: stored });
}

// Anchors the `<n>-<form>` positional key shape one place, mirroring
// useSrsProgress.ts's own `LEGACY_CONJUGATION_KEY` regex
// (`^(\d+)-(presens|preteritum|supinum|imperativ)$`). Duplicated rather than
// imported for the same reason the storage keys above are duplicated: this
// seeds the on-disk contract a real old build wrote, not an internal that
// happens to describe it.
export function positionalItemId(position: number, form: Form): string {
  return `${position}-${form}`;
}

// 1-based VERB_DATA position for an infinitive, the same lookup
// `buildLegacyV1Seed` does internally — exposed so a spec can compute the
// exact positional key it should expect on disk (e.g. for `vara`) without
// hardcoding a magic number that would silently go stale if VERB_DATA is
// ever reordered.
export async function getVerbPosition(infinitive: string): Promise<number> {
  const verbs = await getVerbs();
  const position = verbs.findIndex((verb) => verb.infinitive === infinitive) + 1;
  if (position <= 0) {
    throw new Error(`getVerbPosition: "${infinitive}" is not in VERB_DATA`);
  }
  return position;
}

// Deliberate, opt-in exception to toV3Envelope. Builds the pre-v3 on-disk
// shape: a bare `Record<string, SrsState>`, no `{ version, items }`
// envelope, `itemId` duplicated inside every value — AND keyed
// *positionally* (`1-presens`, `12-imperativ`, ...; `n` is 1-based
// VERB_DATA order), not by infinitive. Positional keys are what every real
// pre-#53 install actually has on disk: `useSrsProgress.ts`'s
// `LEGACY_CONJUGATION_KEY` regex only ever matches `^\d+-<form>$`, and
// `migrateConjugationKeys` exists specifically to re-key `1-presens` onto
// today's canonical `vara-presens` on load. A seed keyed by infinitive
// would make that regex never match — the identity pass every earlier
// version of this helper silently produced — and leave the riskiest branch
// of the legacy migration (re-keying learner data across the id-scheme
// change) with zero E2E coverage while still claiming to exercise it. Fixed
// per the F1 finding in the #412 adversarial review.
//
// `overrides` is still keyed by the *canonical* id (e.g. `'vara-presens'`,
// matching `buildFullSeed`'s own contract and error messages) for a
// caller's convenience; this function does the position lookup and rekeys
// the whole map, including the overridden entries, before returning.
//
// Named unmistakably and kept separate from buildFullSeed on purpose: this
// is the *only* seed builder allowed to produce the legacy shape, so the
// legacy path stays something a spec opts into by name
// (legacy-migration-boot.spec.ts) rather than something the default helper
// could silently regress back into. Serialize with a plain
// `JSON.stringify(...)` — no envelope — to write it to localStorage.
export async function buildLegacyV1Seed(
  overrides: Record<string, Partial<SrsState>> = {},
): Promise<Record<string, SrsState>> {
  const canonical = await buildFullSeed(overrides);
  const verbs = await getVerbs();
  const positionByInfinitive = new Map(verbs.map((verb, index) => [verb.infinitive, index + 1]));

  const CANONICAL_ID = /^(.+)-(presens|preteritum|supinum|imperativ)$/;
  const positional: Record<string, SrsState> = {};
  for (const [canonicalId, state] of Object.entries(canonical)) {
    const match = CANONICAL_ID.exec(canonicalId);
    if (!match) {
      // Not a conjugation item this helper builds (only buildFullSeed's own
      // `${verb.id}-${form}` shape reaches here) — keep verbatim rather than
      // silently dropping unrecognized state.
      positional[canonicalId] = state;
      continue;
    }
    const [, infinitive, form] = match as [string, string, Form];
    const position = positionByInfinitive.get(infinitive);
    if (position === undefined) {
      positional[canonicalId] = state;
      continue;
    }
    const positionalId = positionalItemId(position, form);
    positional[positionalId] = { ...state, itemId: positionalId };
  }

  return positional;
}

// Particle-mode seed: pins exactly one particle-verb cloze item
// (`pv:tycka-om:cloze`) as due, and every other verified particle-verb entry
// as already-met (a not-due cloze state), so the sitting PracticeParticles
// builds is deterministic — one card, not whichever the corpus happens to
// introduce first. Mirrors the fixture PracticeParticles.test.tsx already
// uses (readyBase + otherEntriesAlreadyIntroduced), because that unit suite
// is the closest prior art for "how do you pin one particle card".
//
// `tycka` is used as the base verb: pv:tycka-om's accepted particle is
// exactly "om" (src/data/particleVerbData.ts), and `tycka` is a stable A1
// verb (verbs.test.ts pins id stability upstream — see determinism rule 5).
export const PARTICLE_SEED_CLOZE_ITEM_ID = particleItemId('pv:tycka-om', 'cloze');
export const PARTICLE_SEED_ANSWER = 'om';

export async function buildParticleReadySeed(): Promise<{
  items: Record<string, SrsState>;
  totalVerifiedEntries: number;
}> {
  const items: Record<string, SrsState> = {};

  const verifiedEntries = getVerifiedParticleVerbs();
  for (const entry of verifiedEntries) {
    if (entry.id === 'pv:tycka-om') continue;
    const clozeId = particleItemId(entry.id, 'cloze');
    items[clozeId] = {
      ...initializeSrsState(clozeId),
      repetitions: 1,
      dueAt: FAR_FUTURE_DUE_AT,
    };
  }

  items[PARTICLE_SEED_CLOZE_ITEM_ID] = {
    ...initializeSrsState(PARTICLE_SEED_CLOZE_ITEM_ID),
    repetitions: 3,
    dueAt: Date.now(),
  };

  return { items, totalVerifiedEntries: verifiedEntries.length };
}
