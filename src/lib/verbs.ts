import { VERB_DATA } from '@/data/verbData';

export type Form = "infinitive" | "presens" | "preteritum" | "supinum" | "imperativ";

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
}

// Get all basic verbs
export async function getVerbs(): Promise<Verb[]> {
  return VERB_DATA.map((verb, index) => ({
    id: String(index + 1),
    infinitive: verb.infinitive,
    cefr: verb.cefr
  }));
}

// Get all conjugated verbs efficiently (no file reads needed!)
export async function getAllConjugatedVerbs(): Promise<ConjugatedVerb[]> {
  return VERB_DATA.map((verb, index) => ({
    id: String(index + 1),
    infinitive: verb.infinitive,
    presens: verb.presens || "(not available)",
    preteritum: verb.preteritum || "(not available)",
    supinum: verb.supinum || "(not available)",
    imperativ: verb.imperativ || "(not available)",
    cefr: verb.cefr
  }));
}

// Conjugate verb from hardcoded data
export async function conjugateVerb(infinitive: string): Promise<ConjugatedVerb> {
  const verb = VERB_DATA.find(v => v.infinitive === infinitive);
  
  if (verb) {
    const index = VERB_DATA.indexOf(verb);
    return {
      id: String(index + 1),
      infinitive: verb.infinitive,
      presens: verb.presens || "(not available)",
      preteritum: verb.preteritum || "(not available)",
      supinum: verb.supinum || "(not available)",
      imperativ: verb.imperativ || "(not available)",
      cefr: verb.cefr
    };
  }
  
  // Fallback for unknown verbs
  return {
    id: "unknown",
    infinitive,
    presens: "(not available)",
    preteritum: "(not available)",
    supinum: "(not available)",
    imperativ: "(not available)"
  };
}

// Generate verb pattern display (e.g., "gå – gick – _____")
export interface VerbPattern {
  display: string;
  missingForm: Form;
  patternParts: Array<{ form: Form; text: string; isMissing: boolean }>;
}

export async function generateVerbPattern(infinitive: string, targetForm: Form): Promise<VerbPattern> {
  const conjugated = await conjugateVerb(infinitive);
  
  // For imperativ, use a simpler pattern
  if (targetForm === 'imperativ') {
    return {
      display: `Command form of "${infinitive}"`,
      missingForm: targetForm,
      patternParts: [
        { form: 'infinitive', text: infinitive, isMissing: false },
        { form: 'imperativ', text: '_____', isMissing: true }
      ]
    };
  }
  
  // For other forms, use the standard pattern: infinitive – presens – preteritum – supinum
  const forms: Form[] = ['infinitive', 'presens', 'preteritum', 'supinum'];
  const parts = forms.map(form => ({
    form,
    text: form === targetForm ? '_____' : (form === 'infinitive' ? infinitive : conjugated[form]),
    isMissing: form === targetForm
  }));
  
  const display = parts.map(p => p.text).join(' – ');
  
  return {
    display,
    missingForm: targetForm,
    patternParts: parts
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
    "vara": {
      infinitive: "Att vara eller inte vara",
      presens: "Jag är glad",
      preteritum: "Jag var hemma",
      supinum: "Jag har varit där",
      imperativ: "Var snäll!"
    },
    "ha": {
      infinitive: "Att ha en katt",
      presens: "Jag har en bil",
      preteritum: "Jag hade tid",
      supinum: "Jag har haft tur",
      imperativ: "Ha tålamod!"
    },
    "gå": {
      infinitive: "Att gå hem",
      presens: "Jag går till skolan",
      preteritum: "Jag gick ut",
      supinum: "Jag har gått mycket",
      imperativ: "Gå nu!"
    },
  };

  return examples[infinitive]?.[form] || `[Example with ${form}]`;
}

// Legacy export for backward compatibility
export const verbs: Verb[] = VERB_DATA.map((verb, index) => ({
  id: String(index + 1),
  infinitive: verb.infinitive,
  cefr: verb.cefr
}));
