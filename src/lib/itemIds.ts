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
// The format is `<verbId>-<form>` and it is frozen: `verbId` is
// `String(index + 1)` over VERB_DATA (see src/lib/verbs.ts and the order pin
// test in src/data/verbData.orderPin.test.ts). Changing the shape here
// orphans every stored key and needs a storage migration, not an edit.
export function conjugationItemId(verbId: string, form: Form): string {
  return `${verbId}-${form}`;
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
