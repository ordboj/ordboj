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

let verbsCache: Verb[] | null = null;

// Load and parse verbs from CSV
async function loadVerbs(): Promise<Verb[]> {
  if (verbsCache) return verbsCache;

  try {
    const response = await fetch('/data/swedish_verbs.csv');
    const text = await response.text();
    const lines = text.trim().split('\n');
    
    // Skip header
    const verbLines = lines.slice(1);
    
    verbsCache = verbLines.map((line, index) => {
      const [cefr, , infinitive] = line.split(',');
      // Clean up infinitive (remove notes in parentheses)
      const cleanInfinitive = infinitive.replace(/\s*\([^)]*\)/g, '').trim();
      return {
        id: String(index + 1),
        infinitive: cleanInfinitive,
        cefr: cefr
      };
    });
    
    return verbsCache;
  } catch (error) {
    console.error('Failed to load verbs:', error);
    // Fallback to minimal set
    return [
      { id: "1", infinitive: "vara" },
      { id: "2", infinitive: "ha" },
      { id: "3", infinitive: "gå" },
    ];
  }
}

// Get all verbs
export async function getVerbs(): Promise<Verb[]> {
  return loadVerbs();
}

// Get all conjugated verbs efficiently (reads CSV once)
export async function getAllConjugatedVerbs(): Promise<ConjugatedVerb[]> {
  try {
    const response = await fetch('/data/swedish_verbs.csv');
    const text = await response.text();
    const lines = text.trim().split('\n');
    
    // Skip header and parse all verbs
    const conjugatedVerbs: ConjugatedVerb[] = [];
    for (let i = 1; i < lines.length; i++) {
      const parts = parseCSVLine(lines[i]);
      const [cefr, , csvInfinitive, imperativ, presens, preteritum, supinum] = parts;
      
      // Clean infinitive
      const cleanInfinitive = csvInfinitive?.replace(/\s*\([^)]*\)/g, '').trim();
      
      if (cleanInfinitive) {
        conjugatedVerbs.push({
          id: String(i),
          infinitive: cleanInfinitive,
          presens: presens || "(not available)",
          preteritum: preteritum || "(not available)",
          supinum: supinum || "(not available)",
          imperativ: imperativ || "(not available)",
          cefr
        });
      }
    }
    
    return conjugatedVerbs;
  } catch (error) {
    console.error('Failed to load conjugated verbs:', error);
    return [];
  }
}

// Parse CSV line safely
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

// Conjugate verb from CSV data
export async function conjugateVerb(infinitive: string): Promise<ConjugatedVerb> {
  try {
    const response = await fetch('/data/swedish_verbs.csv');
    const text = await response.text();
    const lines = text.trim().split('\n');
    
    // Find the verb in CSV
    for (let i = 1; i < lines.length; i++) {
      const parts = parseCSVLine(lines[i]);
      const [cefr, , csvInfinitive, imperativ, presens, preteritum, supinum] = parts;
      
      // Clean infinitive for comparison
      const cleanInfinitive = csvInfinitive?.replace(/\s*\([^)]*\)/g, '').trim();
      
      if (cleanInfinitive === infinitive) {
        return {
          id: String(i),
          infinitive,
          presens: presens || "(not available)",
          preteritum: preteritum || "(not available)",
          supinum: supinum || "(not available)",
          imperativ: imperativ || "(not available)",
          cefr
        };
      }
    }
  } catch (error) {
    console.error('Failed to conjugate verb:', error);
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
export const verbs: Verb[] = [];

// Initialize verbs on module load
loadVerbs().then(loaded => {
  verbs.length = 0;
  verbs.push(...loaded);
});
