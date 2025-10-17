export type Form = "infinitive" | "presens" | "preteritum" | "supinum" | "imperativ";

export interface Verb {
  id: string;
  infinitive: string;
}

export interface ConjugatedVerb extends Verb {
  presens: string;
  preteritum: string;
  supinum: string;
  imperativ: string;
}

// Common Swedish verbs (A1-B1)
export const verbs: Verb[] = [
  { id: "1", infinitive: "vara" },
  { id: "2", infinitive: "ha" },
  { id: "3", infinitive: "gå" },
  { id: "4", infinitive: "komma" },
  { id: "5", infinitive: "skriva" },
  { id: "6", infinitive: "läsa" },
  { id: "7", infinitive: "säga" },
  { id: "8", infinitive: "få" },
  { id: "9", infinitive: "kunna" },
  { id: "10", infinitive: "vilja" },
];

// Simple conjugation rules (basic approximation for common patterns)
export function conjugateVerb(infinitive: string): ConjugatedVerb {
  const verb = verbs.find(v => v.infinitive === infinitive);
  const id = verb?.id || "unknown";

  // Special irregular verbs
  const irregulars: Record<string, ConjugatedVerb> = {
    "vara": { id, infinitive: "vara", presens: "är", preteritum: "var", supinum: "varit", imperativ: "var" },
    "ha": { id, infinitive: "ha", presens: "har", preteritum: "hade", supinum: "haft", imperativ: "ha" },
    "gå": { id, infinitive: "gå", presens: "går", preteritum: "gick", supinum: "gått", imperativ: "gå" },
    "komma": { id, infinitive: "komma", presens: "kommer", preteritum: "kom", supinum: "kommit", imperativ: "kom" },
    "få": { id, infinitive: "få", presens: "får", preteritum: "fick", supinum: "fått", imperativ: "få" },
    "säga": { id, infinitive: "säga", presens: "säger", preteritum: "sa/sade", supinum: "sagt", imperativ: "säg" },
    "kunna": { id, infinitive: "kunna", presens: "kan", preteritum: "kunde", supinum: "kunnat", imperativ: "-" },
    "vilja": { id, infinitive: "vilja", presens: "vill", preteritum: "ville", supinum: "velat", imperativ: "-" },
  };

  if (irregulars[infinitive]) {
    return irregulars[infinitive];
  }

  // Group 1: -ar verbs (most common)
  if (infinitive.endsWith("a")) {
    const stem = infinitive.slice(0, -1);
    return {
      id,
      infinitive,
      presens: stem + "ar",
      preteritum: stem + "ade",
      supinum: stem + "at",
      imperativ: stem
    };
  }

  // Fallback
  return {
    id,
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

export function generateVerbPattern(infinitive: string, targetForm: Form): VerbPattern {
  const conjugated = conjugateVerb(infinitive);
  
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
    text: form === targetForm ? '_____' : conjugated[form],
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
