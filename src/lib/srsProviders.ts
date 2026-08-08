import { conjugationItemId, particleItemId } from '@/lib/itemIds';
import { getVerbs, getAllConjugatedVerbs, verbs, type Form } from '@/lib/verbs';
import { getVerifiedParticleVerbs, hasRecallItem } from '@/lib/particleVerbs';
import type { SrsState } from '@/lib/srs';
import type { ParticleVerbData } from '@/data/particleVerbData';

// This provider is not wired into useSrsProgress (see createConjugationProvider,
// which is); it predates the particleQueue module owning the sitting-build
// logic and is kept only for its own existing test contract. Its base-verb
// gate is therefore local and deliberately not shared with
// src/lib/particleQueue.ts, which dropped this gate for due reviews per
// issue #315 — see the "Rules" bullet removed from
// docs/superpowers/specs/2026-08-08-partikelverb-design.md.
const BASE_VERB_GATE_REPETITIONS = 2;
const verbIdByInfinitive = new Map(verbs.map((verb) => [verb.infinitive, verb.id]));

function isBaseVerbReady(entry: ParticleVerbData, srsStates: Record<string, SrsState>): boolean {
  const verbId = verbIdByInfinitive.get(entry.baseInfinitive);
  if (!verbId) return false;
  return (['presens', 'preteritum'] as const).every((form) => {
    const state = srsStates[conjugationItemId(verbId, form)];
    return (state?.repetitions ?? 0) >= BASE_VERB_GATE_REPETITIONS;
  });
}

// The four conjugated forms the app schedules. 'infinitive' is deliberately
// absent: it is the prompt, never the answer.
export const SCHEDULED_FORMS: Form[] = ['presens', 'preteritum', 'supinum', 'imperativ'];

// Anything the scheduler can hold state for. `itemId` is the localStorage
// key, built by src/lib/itemIds.ts and never inline.
export interface ScheduledItem {
  itemId: string;
}

// A provider is the seam between "what is there to practise" and "how the
// SRS store schedules it". useSrsProgress owns the store, the persistence
// and the due arithmetic; a provider owns enumeration and id construction
// for one kind of material. Adding a mode is adding a provider, not
// branching the hook.
export interface SrsItemProvider<TItem extends ScheduledItem> {
  // Diagnostic name; also documents which id namespace the provider owns.
  readonly name: string;

  // Ids to create SRS state for eagerly, at load. Every item created this
  // way starts due immediately, so a provider whose corpus is larger than a
  // sensible first session must return [] here and let state be created on
  // first presentation instead — otherwise release day is a flood of
  // hundreds of due cards, which is the abandonment screen.
  listEagerInitIds(): Promise<string[]>;

  // Every item presentable right now, before due filtering: level filters,
  // missing forms, and any unlock gates are the provider's business.
  listAvailableItems(): Promise<TItem[]>;
}

export interface ConjugationItem extends ScheduledItem {
  verbId: string;
  infinitive: string;
  form: Form;
}

// `cefrLevels` filter semantics: `undefined` means "no filter, all verbs in
// scope"; any array — including `[]` — is an explicit selection and is
// honored exactly, so an empty selection matches zero verbs rather than
// silently falling back to "all verbs". Widening an empty selection back to
// "all" is the bug this guards against (issue #137): a UI state that looks
// like "nothing selected" would quietly practice the entire deck.
export function createConjugationProvider(cefrLevels?: string[]): SrsItemProvider<ConjugationItem> {
  return {
    name: 'conjugation',

    // Unfiltered on purpose, and including forms a verb does not have
    // (a modal's empty imperativ). This mirrors what the store has always
    // initialized; narrowing it would make a learner's stored key set depend
    // on the CEFR levels they happened to have selected at first load.
    async listEagerInitIds() {
      const verbs = await getVerbs();
      return verbs.flatMap((verb) =>
        SCHEDULED_FORMS.map((form) => conjugationItemId(verb.id, form)),
      );
    },

    async listAvailableItems() {
      const allVerbs = await getVerbs();
      const verbs =
        cefrLevels === undefined
          ? allVerbs
          : allVerbs.filter((verb) => verb.cefr && cefrLevels.includes(verb.cefr));

      // Conjugate every verb once (O(V) total, no per-item scan of VERB_DATA
      // by infinitive) and index by id, so the loop below is O(1) per verb.
      const allConjugated = await getAllConjugatedVerbs();
      const conjugatedById = new Map(allConjugated.map((c) => [c.id, c]));

      const items: ConjugationItem[] = [];
      for (const verb of verbs) {
        const conjugated = conjugatedById.get(verb.id);
        if (!conjugated) continue;

        for (const form of SCHEDULED_FORMS) {
          // A form the verb does not have is not an item.
          if (conjugated[form] === '(not available)' || !conjugated[form]) continue;
          items.push({
            verbId: verb.id,
            infinitive: verb.infinitive,
            form,
            itemId: conjugationItemId(verb.id, form),
          });
        }
      }
      return items;
    },
  };
}

export interface ParticleItem extends ScheduledItem {
  particleVerbId: string;
  kind: 'cloze' | 'recall';
  entry: ParticleVerbData;
}

// The particle provider.
//
// listEagerInitIds returns [] deliberately, and that emptiness is the whole
// point: eagerly creating ~80 items would make every one of them due the day
// the mode ships, which is the abandonment screen the queue work exists to
// avoid. Particle state is created when a card is first presented instead.
//
// listAvailableItems reports only items that already have state — i.e. that
// the learner has actually met. Which unmet items get introduced today is a
// pacing decision with caps and gates behind it, and it lives in
// buildParticleSitting rather than here, because "what exists" and "what to
// serve next" are different questions.
export function createParticleProvider(
  srsStates: Record<string, SrsState>,
): SrsItemProvider<ParticleItem> {
  return {
    name: 'particle',

    async listEagerInitIds() {
      return [];
    },

    async listAvailableItems() {
      const items: ParticleItem[] = [];
      for (const entry of getVerifiedParticleVerbs()) {
        if (!isBaseVerbReady(entry, srsStates)) continue;
        const kinds: Array<'cloze' | 'recall'> = hasRecallItem(entry)
          ? ['cloze', 'recall']
          : ['cloze'];
        for (const kind of kinds) {
          const itemId = particleItemId(entry.id, kind);
          if (!srsStates[itemId]) continue;
          items.push({ itemId, particleVerbId: entry.id, kind, entry });
        }
      }
      return items;
    },
  };
}
