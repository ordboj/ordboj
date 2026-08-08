import { VERB_DATA } from '@/data/verbData';
import type { Form } from '@/lib/verbs';

// One place where an SRS item id is built.
//
// The id is the primary key of a learner's progress in localStorage, and it
// is irreplaceable data: a mismatch between the string one file writes and
// the string another file reads does not throw, it just silently returns
// "no progress" and starts the item over. Before this helper the same
// template literal was written out in five files, so keeping them in step
// depended on nobody ever editing one of them alone.
//
// The format is `<infinitive>-<form>` (issue #8). It used to be
// `<index + 1>-<form>`, which made a learner's identity for a verb its
// *position* in VERB_DATA: inserting or reordering one row repointed every
// stored key from that position onward, turning a `bygga` history into a
// `börja` history with no error and no way to notice. The infinitive is the
// natural key of a verb and does not move. Stores written under the old
// scheme are rewritten once by the v2 -> v3 migration in
// src/hooks/useSrsProgress.ts.

// Legacy positional verb ids ("1".."56") are still what `Verb.id` carries
// (src/lib/verbs.ts, owned by swedish-linguist) and therefore still what
// every call site passes. Resolving them to the infinitive here is what let
// the key scheme change without a single call site changing with it: the
// positional id is resolved against the *current* VERB_DATA, which is
// exactly the table the caller read it from, so the resolved key follows the
// verb across a reorder instead of staying with the slot.
//
// The two namespaces cannot collide: a positional id is digits only, and no
// Swedish infinitive is. Once `Verb.id` becomes the infinitive itself this
// map and the branch below can be deleted with no change in output.
const INFINITIVE_BY_LEGACY_VERB_ID: ReadonlyMap<string, string> = new Map(
  VERB_DATA.map((verb, index) => [String(index + 1), verb.infinitive]),
);

const LEGACY_VERB_ID = /^\d+$/;

// `verbRef` is either the infinitive (the stable key) or a legacy positional
// `Verb.id`. Both produce the same item id.
export function conjugationItemId(verbRef: string, form: Form): string {
  const infinitive = LEGACY_VERB_ID.test(verbRef)
    ? (INFINITIVE_BY_LEGACY_VERB_ID.get(verbRef) ?? verbRef)
    : verbRef;
  return `${infinitive}-${form}`;
}

// The same id, built from an infinitive that is *not* in the current
// VERB_DATA lookup path — the storage migration rewrites keys for verbs it
// reads out of a frozen snapshot, not out of today's table, and must not go
// through the legacy resolution branch above. Kept here so no second copy of
// the id format exists outside this file.
export function conjugationItemIdForInfinitive(infinitive: string, form: Form): string {
  return `${infinitive}-${form}`;
}

// Particle-verb items live in their own namespace, disjoint from the
// `<digits>-<form>` keys above. That disjointness is what makes the whole
// feature additive to the progress store: no existing key is renamed, and a
// build that does not know about particle verbs simply ignores these.
export const PARTICLE_ID_PREFIX = 'pv:';

// A particle verb yields up to two independently scheduled items.
export type ParticleItemKind = 'cloze' | 'recall';

// `particleVerbId` already carries the `pv:` prefix (e.g. "pv:hora-av-sig"),
// so the item id is "pv:hora-av-sig:cloze". Append-only, like the slug
// itself: renaming one orphans that item's progress.
export function particleItemId(particleVerbId: string, kind: ParticleItemKind): string {
  return `${particleVerbId}:${kind}`;
}

export function isParticleItemId(itemId: string): boolean {
  return itemId.startsWith(PARTICLE_ID_PREFIX);
}

// Splits a particle item id back into its verb slug and kind. Returns null
// for anything that is not one, so callers cannot accidentally treat a
// conjugation key as a particle item.
export function parseParticleItemId(
  itemId: string,
): { particleVerbId: string; kind: ParticleItemKind } | null {
  if (!isParticleItemId(itemId)) return null;
  const lastColon = itemId.lastIndexOf(':');
  if (lastColon <= PARTICLE_ID_PREFIX.length - 1) return null;
  const kind = itemId.slice(lastColon + 1);
  if (kind !== 'cloze' && kind !== 'recall') return null;
  return { particleVerbId: itemId.slice(0, lastColon), kind };
}
