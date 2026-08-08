import { VERB_DATA, type Grupp } from '@/data/verbData';

export type { Grupp };

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
}

// Get all basic verbs
export async function getVerbs(): Promise<Verb[]> {
  return VERB_DATA.map((verb, index) => ({
    id: String(index + 1),
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
export function isAcceptedAnswer(infinitive: string, form: Form, answer: string): boolean {
  const normalized = answer.trim().toLowerCase();
  return getAcceptedAnswers(infinitive, form).some(
    (candidate) => candidate.trim().toLowerCase() === normalized,
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
  if (accepted.length === 2) {
    return `Both ${accepted[0]} and ${accepted[1]} are correct.`;
  }
  const allButLast = accepted.slice(0, -1).join(', ');
  return `${allButLast} and ${accepted[accepted.length - 1]} are all correct.`;
}

// Get all conjugated verbs efficiently (no file reads needed!)
export async function getAllConjugatedVerbs(): Promise<ConjugatedVerb[]> {
  return VERB_DATA.map((verb, index) => ({
    id: String(index + 1),
    infinitive: verb.infinitive,
    presens: verb.presens || '(not available)',
    preteritum: verb.preteritum || '(not available)',
    supinum: verb.supinum || '(not available)',
    imperativ: verb.imperativ || '(not available)',
    imperativNotApplicable: verb.noNaturalImperativ,
    cefr: verb.cefr,
  }));
}

// Conjugate verb from hardcoded data
export async function conjugateVerb(infinitive: string): Promise<ConjugatedVerb> {
  const verb = VERB_DATA.find((v) => v.infinitive === infinitive);

  if (verb) {
    const index = VERB_DATA.indexOf(verb);
    return {
      id: String(index + 1),
      infinitive: verb.infinitive,
      presens: verb.presens || '(not available)',
      preteritum: verb.preteritum || '(not available)',
      supinum: verb.supinum || '(not available)',
      imperativ: verb.imperativ || '(not available)',
      imperativNotApplicable: verb.noNaturalImperativ,
      cefr: verb.cefr,
    };
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

// Get form label for display
export function getFormLabel(form: Form): string {
  const labels: Record<Form, string> = {
    infinitive: 'Infinitive',
    presens: 'Present',
    preteritum: 'Past',
    supinum: 'Supine (perfect)',
    imperativ: 'Imperative (command)',
  };
  return labels[form];
}

// Get form hint/description
export function getFormHint(form: Form): string {
  const hints: Record<Form, string> = {
    infinitive: 'The basic form (to...)',
    presens: 'Present tense (now)',
    preteritum: 'Past tense (then)',
    supinum: 'Perfect form (has/have...)',
    imperativ: 'Command form (do it!)',
  };
  return hints[form];
}

// Example sentences
export function getExampleSentence(infinitive: string, form: Form): string {
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

  return examples[infinitive]?.[form] || `[Example with ${form}]`;
}

// Legacy export for backward compatibility
export const verbs: Verb[] = VERB_DATA.map((verb, index) => ({
  id: String(index + 1),
  infinitive: verb.infinitive,
  cefr: verb.cefr,
}));
