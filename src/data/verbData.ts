// Hardcoded Swedish verb conjugation data
// This data is extracted from the CSV to improve loading performance

// Conjugation classes as taught in Swedish grammar:
//   '1'  -ar                     tala/talar/talade/talat
//   '2a' -er, voiced stem        ringa/ringer/ringde/ringt
//   '2b' -er, voiceless stem     köpa/köper/köpte/köpt
//   '3'  short vowel-final stem  bo/bor/bodde/bott
//   '4'  starka och oregelbundna verb. This bucket deliberately covers BOTH
//        true strong verbs with vowel gradation (dricka/drack/druckit) AND
//        irregular verbs and auxiliaries that fit no other class
//        (vara, ha, kunna, vilja, veta, göra, säga, anse, lägga). Swedish
//        school grammar names this class "grupp 4 - starka och oregelbundna
//        verb", so the merge matches what a learner is taught. Consumers must
//        not assume every '4' row shows vowel gradation.
export type Grupp = '1' | '2a' | '2b' | '3' | '4';

// The conjugated fields that can carry a documented alternate accepted form,
// e.g. preteritum "lade" alongside the primary "la" for lägga. "infinitive"
// is excluded: this app does not model alternate dictionary-form spellings.
export type AlternateFormField = 'imperativ' | 'presens' | 'preteritum' | 'supinum';

export interface VerbData {
  cefr: string;
  infinitive: string;
  imperativ: string;
  presens: string;
  preteritum: string;
  supinum: string;
  // Conjugation class. Omitted (undefined) means the group could not be
  // human-verified against the stored forms and needs review — never guess.
  grupp?: Grupp;
  // Additional forms accepted as correct for a field, beyond the primary
  // form stored above (e.g. lägga preteritum: primary "la", alternate
  // "lade" — both are standard SAOL forms). Optional and per-field; omitted
  // or empty means "no documented alternate", which is true for almost every
  // row and requires no change to existing data.
  alternates?: Partial<Record<AlternateFormField, string[]>>;
}

export const VERB_DATA: VerbData[] = [
  { cefr: "A1", infinitive: "vara", imperativ: "var", presens: "är", preteritum: "var", supinum: "varit", grupp: "4" },
  { cefr: "A1", infinitive: "ha", imperativ: "ha", presens: "har", preteritum: "hade", supinum: "haft", grupp: "4" },
  { cefr: "A1", infinitive: "kunna", imperativ: "", presens: "kan", preteritum: "kunde", supinum: "kunnat", grupp: "4" },
  { cefr: "A1", infinitive: "unna", imperativ: "unna", presens: "unnar", preteritum: "unnade", supinum: "unnat", grupp: "1" },
  { cefr: "A1", infinitive: "få", imperativ: "", presens: "får", preteritum: "fick", supinum: "fått", grupp: "4" },
  { cefr: "A1", infinitive: "bli", imperativ: "bli", presens: "blir", preteritum: "blev", supinum: "blivit", grupp: "4" },
  { cefr: "A1", infinitive: "komma", imperativ: "kom", presens: "kommer", preteritum: "kom", supinum: "kommit", grupp: "4" },
  { cefr: "A1", infinitive: "vilja", imperativ: "", presens: "vill", preteritum: "ville", supinum: "velat", grupp: "4" },
  { cefr: "A1", infinitive: "göra", imperativ: "gör", presens: "gör", preteritum: "gjorde", supinum: "gjort", grupp: "4" },
  { cefr: "A1", infinitive: "finna", imperativ: "finn", presens: "finner", preteritum: "fann", supinum: "funnit", grupp: "4" },
  { cefr: "A1", infinitive: "ta", imperativ: "", presens: "tar", preteritum: "tog", supinum: "tagit", grupp: "4" },
  { cefr: "A1", infinitive: "se", imperativ: "", presens: "ser", preteritum: "såg", supinum: "sett", grupp: "4" },
  { cefr: "A1", infinitive: "gå", imperativ: "", presens: "går", preteritum: "gick", supinum: "gått", grupp: "4" },
  // preteritum "sa" is the primary stored form; "sade" is the equally
  // correct SAOL alternate — see AlternateFormField above.
  { cefr: "A1", infinitive: "säga", imperativ: "", presens: "säger", preteritum: "sa", supinum: "sagt", grupp: "4", alternates: { preteritum: ["sade"] } },
  { cefr: "A1", infinitive: "äga", imperativ: "", presens: "äger", preteritum: "ägde", supinum: "ägt", grupp: "2a" },
  { cefr: "A1", infinitive: "betyda", imperativ: "", presens: "betyder", preteritum: "betydde", supinum: "betytt", grupp: "2a" },
  { cefr: "A1", infinitive: "ge", imperativ: "", presens: "ger", preteritum: "gav", supinum: "gett", grupp: "4" },
  { cefr: "A1", infinitive: "skriva", imperativ: "", presens: "skriver", preteritum: "skrev", supinum: "skrivit", grupp: "4" },
  { cefr: "A1", infinitive: "te sig", imperativ: "", presens: "ter sig", preteritum: "tedde sig", supinum: "tett sig", grupp: "3" },
  { cefr: "A1", infinitive: "riva", imperativ: "", presens: "river", preteritum: "rev", supinum: "rivit", grupp: "4" },
  { cefr: "A1", infinitive: "börja", imperativ: "", presens: "börjar", preteritum: "började", supinum: "börjat", grupp: "1" },
  { cefr: "A1", infinitive: "tro", imperativ: "", presens: "tror", preteritum: "trodde", supinum: "trott", grupp: "3" },
  { cefr: "A1", infinitive: "tycka", imperativ: "", presens: "tycker", preteritum: "tyckte", supinum: "tyckt", grupp: "2b" },
  { cefr: "A1", infinitive: "veta", imperativ: "", presens: "vet", preteritum: "visste", supinum: "vetat", grupp: "4" },
  { cefr: "A1", infinitive: "försöka", imperativ: "", presens: "försöker", preteritum: "försökte", supinum: "försökt", grupp: "2b" },
  { cefr: "A1", infinitive: "behöva", imperativ: "", presens: "behöver", preteritum: "behövde", supinum: "behövt", grupp: "2a" },
  { cefr: "A1", infinitive: "känna", imperativ: "", presens: "känner", preteritum: "kände", supinum: "känt", grupp: "2a" },
  { cefr: "A1", infinitive: "läsa", imperativ: "", presens: "läser", preteritum: "läste", supinum: "läst", grupp: "2b" },
  { cefr: "A1", infinitive: "ro", imperativ: "", presens: "ror", preteritum: "rodde", supinum: "rott", grupp: "3" },
  { cefr: "A1", infinitive: "låta", imperativ: "", presens: "låter", preteritum: "lät", supinum: "låtit", grupp: "4" },
  { cefr: "A1", infinitive: "stå", imperativ: "", presens: "står", preteritum: "stod", supinum: "stått", grupp: "4" },
  { cefr: "A1", infinitive: "visa", imperativ: "", presens: "visar", preteritum: "visade", supinum: "visat", grupp: "1" },
  { cefr: "A1", infinitive: "använda", imperativ: "", presens: "använder", preteritum: "använde", supinum: "använt", grupp: "2a" },
  { cefr: "A1", infinitive: "vända", imperativ: "", presens: "vänder", preteritum: "vände", supinum: "vänt", grupp: "2a" },
  { cefr: "A1", infinitive: "hålla", imperativ: "", presens: "håller", preteritum: "höll", supinum: "hållit", grupp: "4" },
  { cefr: "A1", infinitive: "tänka", imperativ: "", presens: "tänker", preteritum: "tänkte", supinum: "tänkt", grupp: "2b" },
  { cefr: "A1", infinitive: "söka", imperativ: "", presens: "söker", preteritum: "sökte", supinum: "sökt", grupp: "2b" },
  { cefr: "A1", infinitive: "ligga", imperativ: "", presens: "ligger", preteritum: "låg", supinum: "legat", grupp: "4" },
  // "lägga" has two accepted preteritum forms, "la" and "lade" (SAOL). The
  // short form is stored as primary for consistency with "säga" -> "sa"
  // above; "lade" is recorded as a documented alternate (see #123).
  { cefr: "A1", infinitive: "lägga", imperativ: "", presens: "lägger", preteritum: "la", supinum: "lagt", grupp: "4", alternates: { preteritum: ["lade"] } },
  { cefr: "A1", infinitive: "anse", imperativ: "", presens: "anser", preteritum: "ansåg", supinum: "ansett", grupp: "4" },
  { cefr: "A1", infinitive: "öva", imperativ: "", presens: "övar", preteritum: "övade", supinum: "övat", grupp: "1" },
  { cefr: "A1", infinitive: "handla", imperativ: "", presens: "handlar", preteritum: "handlade", supinum: "handlat", grupp: "1" },
  { cefr: "A1", infinitive: "öka", imperativ: "", presens: "ökar", preteritum: "ökade", supinum: "ökat", grupp: "1" },
  { cefr: "A1", infinitive: "skapa", imperativ: "", presens: "skapar", preteritum: "skapade", supinum: "skapat", grupp: "1" },
  { cefr: "A1", infinitive: "kapa", imperativ: "", presens: "kapar", preteritum: "kapade", supinum: "kapat", grupp: "1" },
  { cefr: "A1", infinitive: "gälla", imperativ: "", presens: "gäller", preteritum: "gällde", supinum: "gällt", grupp: "2a" },
  { cefr: "A1", infinitive: "verka", imperativ: "", presens: "verkar", preteritum: "verkade", supinum: "verkat", grupp: "1" },
  { cefr: "A1", infinitive: "tala", imperativ: "", presens: "talar", preteritum: "talade", supinum: "talat", grupp: "1" },
  { cefr: "A1", infinitive: "bära", imperativ: "", presens: "bär", preteritum: "bar", supinum: "burit", grupp: "4" },
  { cefr: "A1", infinitive: "höra", imperativ: "", presens: "hör", preteritum: "hörde", supinum: "hört", grupp: "2a" },
];
