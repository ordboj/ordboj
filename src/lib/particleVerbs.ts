import {
  PARTICLE_VERB_DATA,
  type MeaningPictureId,
  type ParticleVerbData,
  type ParticleVerbExample,
} from '@/data/particleVerbData';

export type { MeaningPictureId } from '@/data/particleVerbData';

// Grammatical person for rendering a reflexive particle verb. Swedish uses
// `sig` only in the third person; a learner who meets `höra av sig` as a
// bare string will say *"jag hör av sig". Every rendered form goes through
// renderReflexive so the wrong pronoun is not a thing the app can produce.
export type ReflexivePerson =
  | 'firstSingular'
  | 'secondSingular'
  | 'thirdSingular'
  | 'firstPlural'
  | 'secondPlural'
  | 'thirdPlural'
  | 'imperativeSingular'
  | 'imperativePlural';

const REFLEXIVE_PRONOUNS: Record<ReflexivePerson, string> = {
  firstSingular: 'mig',
  secondSingular: 'dig',
  thirdSingular: 'sig',
  firstPlural: 'oss',
  secondPlural: 'er',
  thirdPlural: 'sig',
  // The imperative addresses the listener, so it takes the second-person
  // pronoun: "hör av dig!", "hör av er!".
  imperativeSingular: 'dig',
  imperativePlural: 'er',
};

export function renderReflexive(person: ReflexivePerson): string {
  return REFLEXIVE_PRONOUNS[person];
}

// The `{refl}` placeholder in a lemma is the only place a reflexive pronoun
// enters rendered output. Non-reflexive lemmas contain no placeholder and
// pass through unchanged.
export function renderLemma(
  entry: Pick<ParticleVerbData, 'lemma'>,
  person: ReflexivePerson = 'thirdSingular',
): string {
  return entry.lemma.replace('{refl}', renderReflexive(person));
}

// Only verified entries ever reach a learner. This is the single gate: the
// provider, every count and every rendering path reads from here, so an
// unverified entry cannot leak into the app by someone forgetting a filter.
export function getVerifiedParticleVerbs(): ParticleVerbData[] {
  return PARTICLE_VERB_DATA.filter((entry) => entry.verified);
}

export function findParticleVerb(id: string): ParticleVerbData | undefined {
  return PARTICLE_VERB_DATA.find((entry) => entry.id === id);
}

// Reflexives get a cloze item and no recall item: a recall card asks for the
// citation form, whose pronoun is wrong in two persons out of three.
export function hasRecallItem(entry: ParticleVerbData): boolean {
  return entry.reflexive === 'none';
}

// Normalization is exactly the alternate-answers policy (P2): lowercase and
// trim, nothing else. No diacritic folding — "ä" is not "a" — and no edit
// distance. Internal whitespace is collapsed for the recall direction only,
// where the answer is two words and a double space is a typo rather than a
// different answer.
function normalizeParticle(answer: string): string {
  return answer.trim().toLowerCase();
}

function normalizePhrase(answer: string): string {
  const collapsed = answer.trim().toLowerCase().replace(/\s+/g, ' ');
  // The infinitive marker is optional in a recall answer: a learner who
  // types "att tycka om" has produced the right phrase.
  return collapsed.startsWith('att ') ? collapsed.slice(4) : collapsed;
}

// Accepted cloze answers, primary first. Always at least one entry, and
// [0] is always the entry's own `particle` (enforced in the dataset test),
// so what the card displays and what it grades cannot drift apart.
export function getAcceptedParticles(entry: ParticleVerbData): string[] {
  return entry.acceptedParticles;
}

export function isAcceptedParticle(entry: ParticleVerbData, answer: string): boolean {
  const normalized = normalizeParticle(answer);
  return entry.acceptedParticles.some((candidate) => normalizeParticle(candidate) === normalized);
}

// Accepted recall answers. Defaults to the rendered lemma; an entry whose
// gloss is irreducibly ambiguous lists every defensible phrase explicitly.
export function getAcceptedRecallAnswers(entry: ParticleVerbData): string[] {
  return entry.acceptedRecall ?? [renderLemma(entry)];
}

export function isAcceptedRecall(entry: ParticleVerbData, answer: string): boolean {
  const normalized = normalizePhrase(answer);
  return getAcceptedRecallAnswers(entry).some(
    (candidate) => normalizePhrase(candidate) === normalized,
  );
}

// Disclosure line for the feedback panel, mirroring the conjugation card's
// treatment of la/lade (product policy P6): when a card accepts more than
// one answer, name them so the learner learns they are a set rather than
// believing one of them is an error.
export function getAcceptedParticlesDisclosure(entry: ParticleVerbData): string | null {
  const accepted = entry.acceptedParticles;
  if (accepted.length < 2) return null;
  if (accepted.length === 2) return `Both ${accepted[0]} and ${accepted[1]} are correct here.`;
  const allButLast = accepted.slice(0, -1).join(', ');
  return `${allButLast} and ${accepted[accepted.length - 1]} are all correct here.`;
}

export interface ClozeRendering {
  // Sentence tokens with the blanked one removed; `blankAt` is its index, so
  // a renderer can place an input or an underscore run without doing any
  // string surgery of its own.
  before: string[];
  after: string[];
  blankAt: number;
  answer: string;
}

// Splits an example into the parts either side of the blank. Throws nothing:
// an out-of-range blankIndex is a data defect caught by the dataset test,
// and at runtime it degrades to a sentence with no blank rather than a crash.
export function renderCloze(example: ParticleVerbExample): ClozeRendering {
  const tokens = example.sv.split(' ');
  const blankAt = example.blankIndex;
  return {
    before: tokens.slice(0, blankAt),
    after: tokens.slice(blankAt + 1),
    blankAt,
    answer: tokens[blankAt] ?? '',
  };
}

// Deterministic rotation through an entry's frames, keyed on how many times
// the item has been answered correctly. Deterministic rather than random so
// a learner meets the frames in a stable order and a test can assert it.
export function selectExample(entry: ParticleVerbData, repetitions: number): ParticleVerbExample {
  const example = entry.examples[repetitions % entry.examples.length];
  if (example !== undefined) return example;
  // An entry with zero examples is a data defect the dataset test rejects,
  // so this cannot fire on shipped data; failing loudly on malformed data
  // beats rendering an empty card.
  throw new Error(`Particle verb entry "${entry.id}" has no examples`);
}

// The phrase's four conjugated forms, for the static reference line on the
// feedback screen and the introduction-card fallback. Exposure only: never
// scheduled, never tested in v1, which is what keeps "lexical-unit-first"
// intact while stopping `gick ut` from being a surprise the first time the
// learner meets it in the wild.
//
// Reads entry.forms directly — embedded on the data row, not joined against
// VERB_DATA at render time (#318). A join would leave the reference line
// unrenderable for any entry whose base is not (yet) a VERB_DATA row; the
// embedded forms are still human-verified against SO/SAOL, only the lookup
// moved from render time to data-authoring time. Returns null when forms is
// absent — for a verified entry that cannot happen (dataset test), and for
// an unverified one nothing renders anyway.
export interface PhraseForms {
  infinitive: string;
  presens: string;
  preteritum: string;
  supinum: string;
}

export function getPhraseForms(entry: ParticleVerbData): PhraseForms | null {
  if (!entry.forms) return null;
  // Reflexives are shown in their third-person citation form, the same one a
  // dictionary prints. This line is read, never produced, so it does not
  // carry the risk that rules a recall card out.
  return {
    infinitive: renderLemma(entry),
    presens: entry.forms.presens,
    preteritum: entry.forms.preteritum,
    supinum: entry.forms.supinum,
  };
}

// One line per particle for the feedback screen, per the learning note: the
// benefit Boers found was in the explanation, not in batching a "upp week",
// so this is thirty-odd strings rather than a curriculum. Hedged with
// "often" throughout because these are tendencies, not rules, and a particle
// verb's meaning is not reliably compositional. Particles with no confident
// line return null rather than an invented one.
const PARTICLE_CORE_SENSE: Record<string, string> = {
  upp: 'often upward movement, completion, or making something visible or available',
  ut: 'often outward movement, or making something public',
  in: 'often movement inwards, or entry',
  ner: 'often downward movement, or reduction',
  ned: 'often downward movement, or reduction',
  av: 'often separation, or switching something off',
  på: 'often switching something on, or keeping at it',
  bort: 'often removal, or movement away',
  fram: 'often bringing something forward, into view or reach',
  tillbaka: 'often return to an earlier place or state',
  med: 'often accompaniment, or joining in',
  igen: 'often repetition, or closing something',
  om: 'often doing something over again, or turning it around',
  över: 'often crossing, or something being left',
  kvar: 'often what stays behind',
  till: 'often addition, or making contact',
  efter: 'often following, or checking on something',
  emot: 'often movement towards, or receiving',
  sönder: 'into pieces — broken',
  slut: 'reaching an end',
  ihåg: 'into memory',
  igenom: 'through, from one end to the other',
  // Added for #342, to unblock the #336 entries built on these particles.
  // "hem" and "hemma" are the directional/locative pair Swedish keeps apart
  // and English collapses into one word, so they get separate lines rather
  // than one shared string.
  hem: 'movement home — towards where one lives or belongs',
  hemma: 'position at home — where something already belongs',
  igång: 'into motion — something starting to run',
  ihop: 'together, into one whole',
  samman: 'together, in a more formal register than ihop',
  fast: 'often fixed in place, or caught and held',
  undan: 'often out of the way, or kept at a distance',
  åt: 'often using something up, or acting on a problem',
  // "an" is the honest exception: it survives in a handful of fixed phrases
  // and carries no productive sense to teach. Saying so beats inventing one.
  an: 'mostly fossilised, surviving in a few fixed phrases',
  // Added for #376: "miste" and "itu" are the same kind of fossilised
  // exception as "an" — each occurs only in a few fixed phrases and
  // carries no productive sense of its own to teach.
  miste: 'fossilised, surviving in a few fixed phrases such as "gå miste om"',
  itu: 'fossilised, meaning "in two", surviving in a few fixed phrases',
  // Added for #395, to unblock two band 3-4 entries built on these particles.
  ur: 'often emptying something out, or taking something out of a container',
  ihjäl: 'a result: the action ends in death',
  // Added for #372, to unblock "fylla i". Distinct from "in": "i" marks
  // entering data into a bounded space such as a form's blanks, not
  // physically moving into a place.
  i: 'often entering something into a bounded space, such as a form',
  // Added for #396 (wave C), to unblock "gå iväg". Distinct from "bort":
  // "iväg" is about the departure itself, the moment of setting off, not
  // about being elsewhere afterwards.
  iväg: 'often setting off, leaving the place one is at',
};

export function getParticleCoreSense(particle: string): string | null {
  return PARTICLE_CORE_SENSE[particle.toLowerCase()] ?? null;
}

// The motion glyphs: the six of docs/learning/2026-11-10-particle-motion-glyphs.md
// plus fram, hem and ihop from docs/learning/2026-11-10-particle-glyph-expansion.md
// (ORD-132). Kept here rather than imported from the component so the data
// layer has no dependency on the UI; the names match ParticleGlyphName one
// for one.
export type ParticleGlyphId =
  'upp' | 'ut' | 'in' | 'ner' | 'bort' | 'tillbaka' | 'fram' | 'hem' | 'ihop';

// Particle → glyph. "ned" is the formal variant of "ner" and draws the same
// path; it is the only alias. Every other particle has no glyph, including
// near neighbours: "iväg" is not "bort", "samman" is not "ihop", "ur" is not
// "ut", and "hemma" (locative, at home) is not "hem" (directional, home).
const PARTICLE_GLYPH: Record<string, ParticleGlyphId> = {
  upp: 'upp',
  ut: 'ut',
  in: 'in',
  ner: 'ner',
  ned: 'ner',
  bort: 'bort',
  tillbaka: 'tillbaka',
  fram: 'fram',
  hem: 'hem',
  ihop: 'ihop',
};

function glyphForParticle(particle: string): ParticleGlyphId | null {
  return PARTICLE_GLYPH[particle.trim().toLowerCase()] ?? null;
}

// The single eligibility gate for the feedback-panel motion glyph (rule 9).
// Returns a glyph only when every gate holds:
//   1. the entry is verified;
//   2. it is literal;
//   3. it has no contrast line (a glyph could attach to either reading);
//   4. its primary particle has a glyph, and every accepted particle maps
//      to that same glyph (rule 7: a learner who typed an accepted
//      alternative must never see a different direction);
//   6. a human has set motionGlyphVerified (gate 5, the spatial test, is
//      the linguist's work that this flag records).
// Default deny. The card must call this and never re-check the conditions
// itself, so the rule cannot drift between two copies.
export function getParticleGlyph(entry: ParticleVerbData): ParticleGlyphId | null {
  if (!entry.verified) return null;
  if (entry.transparency !== 'literal') return null;
  if (entry.motionGlyphVerified !== true) return null;
  if (entry.contrast !== undefined) return null;
  const glyph = glyphForParticle(entry.particle);
  if (glyph === null) return null;
  const allSame = entry.acceptedParticles.every((accepted) => glyphForParticle(accepted) === glyph);
  return allSame ? glyph : null;
}

// Every meaning-picture id, as a runtime set. `satisfies` makes typecheck fail
// if this list and the MeaningPictureId union drift apart in either direction.
const MEANING_PICTURE_IDS = {
  'white-flag': true,
  printer: true,
  'warning-triangle': true,
  handcuffs: true,
  'snapping-rod': true,
  'overtaking-car': true,
  'wrapping-parcel': true,
  'car-collision': true,
} as const satisfies Record<MeaningPictureId, true>;

function isMeaningPictureId(value: unknown): value is MeaningPictureId {
  return (
    typeof value === 'string' && Object.prototype.hasOwnProperty.call(MEANING_PICTURE_IDS, value)
  );
}

// The single eligibility gate for the idiom meaning picture
// (docs/learning/2026-11-10-idiom-meaning-pictures.md, rule 3). Returns a
// picture id only when every code-checkable gate holds:
//   1. the entry is verified;
//   2. it is idiomatic;
//   6. it carries exactly one known picture id;
//   7. a human has approved the drawn picture for this entry
//      (meaningPictureApproved);
// and the entry can never also show a motion glyph: motionGlyphVerified must
// be absent and getParticleGlyph must return null (rule 1: never both).
// Gates 3 and 4 (one sense, true for every example) are the linguist's
// check and gate 5 (not readable as literal motion) is the ui-ux review;
// the approval flag records that they passed. Default deny. The card must
// call this and never re-check the conditions itself.
export function getMeaningPicture(entry: ParticleVerbData): MeaningPictureId | null {
  if (!entry.verified) return null;
  if (entry.transparency !== 'idiomatic') return null;
  if (entry.meaningPictureApproved !== true) return null;
  if (entry.motionGlyphVerified !== undefined) return null;
  if (getParticleGlyph(entry) !== null) return null;
  const id = entry.meaningPictureId;
  return isMeaningPictureId(id) ? id : null;
}
