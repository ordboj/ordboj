import { VERB_DATA, type Grupp, type VerbData } from '@/data/verbData';

export type { Grupp };

// The phrase a verb is bound to, when its bare stem is not usable on its
// own: 'reflexive' (bry sig om) or 'particle' (slappna av, piffa upp,
// tråka ut). See VerbData.phraseBound in src/data/verbData.ts.
export type PhraseBound = NonNullable<VerbData['phraseBound']>;

export type Form = 'infinitive' | 'presens' | 'preteritum' | 'supinum' | 'imperativ';

export interface Verb {
  id: string;
  infinitive: string;
  cefr?: string;
}

export interface ConjugatedVerb extends Verb {
  presens: string;
  preteritum: string;
  supinum: string;
  imperativ: string;
  // True only for verbs that grammatically have no imperativ in Swedish
  // (modal/auxiliary verbs, per VerbData.noNaturalImperativ). Lets a
  // consumer tell "this form doesn't exist" apart from "data not filled
  // in yet" instead of relying solely on an empty/placeholder imperativ
  // string. Omitted for verbs where it doesn't apply (the common case) and
  // for the unknown-verb fallback, where the app has no basis to claim the
  // form doesn't exist.
  imperativNotApplicable?: boolean;
  // Set only for a verb whose bare stem is not a usable utterance without
  // its reflexive pronoun or particle (VerbData.phraseBound). The card that
  // presents any form of such a verb needs a frame cue around the blank —
  // "bry ___ om", "slappna av" — while the answer string itself stays bare.
  // Undefined for every ordinary verb and for the unknown-verb fallback.
  phraseBound?: PhraseBound;
}

// Get all basic verbs
export async function getVerbs(): Promise<Verb[]> {
  return VERB_DATA.map((verb) => ({
    id: verb.infinitive,
    infinitive: verb.infinitive,
    cefr: verb.cefr,
  }));
}

// Look up a verb's conjugation class ('1' | '2a' | '2b' | '3' | '4').
// Returns undefined both for verbs not found and for rows in VERB_DATA
// where the group is flagged as needing human review — callers must treat
// both cases the same way (i.e. "unknown", never guessed).
export function getVerbGrupp(infinitive: string): Grupp | undefined {
  return VERB_DATA.find((v) => v.infinitive === infinitive)?.grupp;
}

// True if `infinitive` grammatically has no imperativ in Swedish (modal /
// auxiliary verbs such as "kunna", per VerbData.noNaturalImperativ) — i.e.
// a quiz should never ask for this verb's imperativ. False for a verb not
// found in VERB_DATA: the app has no basis to claim the form doesn't
// exist, so it must not be treated the same as a confirmed non-existent
// form.
export function isImperativNotApplicable(infinitive: string): boolean {
  return VERB_DATA.find((v) => v.infinitive === infinitive)?.noNaturalImperativ ?? false;
}

// The phrase a verb is bound to ('reflexive' | 'particle'), or undefined
// for the ordinary case and for verbs not found in VERB_DATA. A caller that
// renders a card for one of these verbs must show the frame (the pronoun
// slot, the particle) around the blank; the expected answer stays bare.
export function getPhraseBound(infinitive: string): PhraseBound | undefined {
  return VERB_DATA.find((v) => v.infinitive === infinitive)?.phraseBound;
}

// Documented alternate accepted forms for a verb + form, e.g. "lade" for
// lägga's preteritum alongside the primary stored form "la". Returns [] for
// verbs not found, forms with no documented alternate (the common case),
// and "infinitive" (alternates are not modeled for the dictionary form).
export function getAlternateForms(infinitive: string, form: Form): string[] {
  if (form === 'infinitive') return [];
  const verb = VERB_DATA.find((v) => v.infinitive === infinitive);
  return verb?.alternates?.[form] ?? [];
}

// Ordered accepted-answer list per product policy P1
// (docs/product/2026-08-08-alternate-answers-decision.md): index 0 is always
// the primary — the form the app displays, hints and pronounces — with any
// documented alternates after it, and the list always has at least one
// entry. Looks the primary up from VERB_DATA itself rather than trusting a
// caller-supplied value, so it can't drift from what the data actually says.
// An unknown verb or a form with no primary value (e.g. imperativ stored as
// "" for a modal verb) falls back to the same "(not available)" sentinel
// conjugateVerb already uses, so the accepted set always matches what's
// actually displayed on the card.
export function getAcceptedAnswers(infinitive: string, form: Form): string[] {
  if (form === 'infinitive') return [infinitive];
  const verb = VERB_DATA.find((v) => v.infinitive === infinitive);
  const primary = verb?.[form] || '(not available)';
  return [primary, ...(verb?.alternates?.[form] ?? [])];
}

// True if `answer` matches the primary form or any documented alternate for
// this verb + form, case-insensitive and trimmed (product policy P2) — the
// same normalization the UI already applied to the primary form alone.
// Also normalizes to NFC on both sides (#328) so an answer typed in
// decomposed Unicode (NFD, e.g. "a" + combining ring above for "å") still
// matches the NFC-stored correct form.
export function isAcceptedAnswer(infinitive: string, form: Form, answer: string): boolean {
  const normalized = answer.trim().toLowerCase().normalize('NFC');
  return getAcceptedAnswers(infinitive, form).some(
    (candidate) => candidate.trim().toLowerCase().normalize('NFC') === normalized,
  );
}

// Human-facing disclosure line for the feedback panel, per product policy P6:
// when a card has more than one accepted answer, name them so the learner
// learns they're a pair rather than believing one is wrong. Returns null when
// there's nothing to disclose (the common case). PracticeCard renders whatever
// string this returns and composes no Swedish of its own.
//
// Wording signed off by swedish-linguist. It names the *whole* accepted set,
// primary included, rather than only the alternates. The earlier placeholder
// ("Also correct: lade") misfires in the case that matters most: a learner who
// actually typed "lade" got "Correct!" followed by "Also correct: lade", which
// reads as though the app is offering them the word they just used. Naming
// both forms is true regardless of which one was typed, and it states the
// pairing outright — which is the stated pedagogical payoff of #123, that the
// learner leaves knowing "la" and "lade" are the same form and not that one of
// them is an error.
//
// English frame with the Swedish forms inline, matching the rest of the card's
// copy (sentence case, no shouting). Only 2-form sets exist in the data today;
// the 3+ branch is here so adding a third form can't silently produce "a, b
// and are correct".
export function getAlternatesDisclosure(infinitive: string, form: Form): string | null {
  const accepted = getAcceptedAnswers(infinitive, form);
  if (accepted.length < 2) return null;
  // #43/C6a (docs/learning/2026-08-08-verb-data-conventions.md): a
  // sense-conditioned pair (e.g. lyda preteritum "lydde" for "obey" vs
  // "löd" for "read as/state") gets a per-form override instead of the
  // generic line below. The generic line asserts interchangeability, which
  // is false Swedish for forms tied to different senses. `form` is never
  // 'infinitive' here: that case always has accepted.length === 1 (see
  // getAcceptedAnswers) and already returned above.
  if (form !== 'infinitive') {
    const verb = VERB_DATA.find((v) => v.infinitive === infinitive);
    const override = verb?.alternatesNote?.[form];
    if (override) return override;
  }
  if (accepted.length === 2) {
    return `Both ${accepted[0]} and ${accepted[1]} are correct.`;
  }
  const allButLast = accepted.slice(0, -1).join(', ');
  return `${allButLast} and ${accepted[accepted.length - 1]} are all correct.`;
}

// Shape one VERB_DATA row as a ConjugatedVerb. Single source of truth for
// the "" -> '(not available)' sentinel mapping and the phraseBound imperativ
// rule below, so conjugateVerb and getAllConjugatedVerbs cannot drift.
function toConjugatedVerb(verb: VerbData): ConjugatedVerb {
  return {
    id: verb.infinitive,
    infinitive: verb.infinitive,
    presens: verb.presens || '(not available)',
    preteritum: verb.preteritum || '(not available)',
    supinum: verb.supinum || '(not available)',
    // A phraseBound verb never reports an imperativ, no matter what the row
    // stores. Decision 1 of docs/learning/
    // 2026-08-17-reflexive-only-verbs-and-entries-per-base.md: the bare stem
    // is not a usable command ("Bry!", "Slappna!"), so a card asking for it
    // would train Swedish the learner cannot say. Those rows already store
    // imperativ: "", which reaches the same sentinel; this branch makes the
    // rule a property of the field rather than of one row's current value,
    // so refilling the stored imperativ can never resurrect the item.
    // '(not available)' is what makes the item disappear: the conjugation
    // provider skips any form that resolves to it
    // (createConjugationProvider.listAvailableItems, src/lib/srsProviders.ts).
    imperativ: verb.phraseBound ? '(not available)' : verb.imperativ || '(not available)',
    imperativNotApplicable: verb.noNaturalImperativ,
    phraseBound: verb.phraseBound,
    cefr: verb.cefr,
  };
}

// Get all conjugated verbs efficiently (no file reads needed!)
export async function getAllConjugatedVerbs(): Promise<ConjugatedVerb[]> {
  return VERB_DATA.map(toConjugatedVerb);
}

// Conjugate verb from hardcoded data
export async function conjugateVerb(infinitive: string): Promise<ConjugatedVerb> {
  const verb = VERB_DATA.find((v) => v.infinitive === infinitive);

  if (verb) {
    return toConjugatedVerb(verb);
  }

  // Fallback for unknown verbs
  return {
    id: 'unknown',
    infinitive,
    presens: '(not available)',
    preteritum: '(not available)',
    supinum: '(not available)',
    imperativ: '(not available)',
  };
}

// Generate verb pattern display (e.g., "gå – gick – _____")
export interface VerbPattern {
  display: string;
  missingForm: Form;
  patternParts: Array<{ form: Form; text: string; isMissing: boolean }>;
}

export async function generateVerbPattern(
  infinitive: string,
  targetForm: Form,
): Promise<VerbPattern> {
  const conjugated = await conjugateVerb(infinitive);

  // For imperativ, use a simpler pattern
  if (targetForm === 'imperativ') {
    return {
      display: `Command form of "${infinitive}"`,
      missingForm: targetForm,
      patternParts: [
        { form: 'infinitive', text: infinitive, isMissing: false },
        { form: 'imperativ', text: '_____', isMissing: true },
      ],
    };
  }

  // For other forms, use the standard pattern: infinitive – presens – preteritum – supinum
  const forms: Form[] = ['infinitive', 'presens', 'preteritum', 'supinum'];
  const parts = forms.map((form) => ({
    form,
    text: form === targetForm ? '_____' : form === 'infinitive' ? infinitive : conjugated[form],
    isMissing: form === targetForm,
  }));

  const display = parts.map((p) => p.text).join(' – ');

  return {
    display,
    missingForm: targetForm,
    patternParts: parts,
  };
}

// Swedish name of each form, for display. These are the terms a learner meets
// in a Swedish classroom or grammar book, and they match the column headings
// the Progress table already uses. "Preteritum" is the current school term for
// the simple past; "imperfekt" is the older name and is not used here.
export function getFormLabel(form: Form): string {
  const labels: Record<Form, string> = {
    infinitive: 'Infinitiv',
    presens: 'Presens',
    preteritum: 'Preteritum',
    supinum: 'Supinum',
    imperativ: 'Imperativ',
  };
  return labels[form];
}

// One-line description of what each form does. The Swedish term leads, then a
// plain-Swedish gloss, then a short English gloss in parentheses for learners
// who don't know the term yet.
export function getFormHint(form: Form): string {
  const hints: Record<Form, string> = {
    infinitive: 'Infinitiv: grundformen, ofta efter "att" (to ...)',
    presens: 'Presens: det som händer nu (present tense)',
    preteritum: 'Preteritum: det som hände då (past tense)',
    supinum: 'Supinum: formen efter har eller hade (has/had ...)',
    imperativ: 'Imperativ: en uppmaning (do it!)',
  };
  return hints[form];
}

// Example sentences. Only a handful of verbs have hand-written examples, so
// this returns null for every other verb + form rather than a placeholder:
// showing "[Example with presens]" in an example slot teaches nothing and
// reads as a bug. Callers must treat null as "render no example".
export function getExampleSentence(infinitive: string, form: Form): string | null {
  const examples: Record<string, Record<Form, string>> = {
    vara: {
      infinitive: 'Att vara eller inte vara',
      presens: 'Jag är glad',
      preteritum: 'Jag var hemma',
      supinum: 'Jag har varit där',
      imperativ: 'Var snäll!',
    },
    ha: {
      infinitive: 'Att ha en katt',
      presens: 'Jag har en bil',
      preteritum: 'Jag hade tid',
      supinum: 'Jag har haft tur',
      imperativ: 'Ha tålamod!',
    },
    gå: {
      infinitive: 'Att gå hem',
      presens: 'Jag går till skolan',
      preteritum: 'Jag gick ut',
      supinum: 'Jag har gått mycket',
      imperativ: 'Gå nu!',
    },
  };

  return examples[infinitive]?.[form] ?? null;
}

// Legacy export for backward compatibility
export const verbs: Verb[] = VERB_DATA.map((verb) => ({
  id: verb.infinitive,
  infinitive: verb.infinitive,
  cefr: verb.cefr,
}));
