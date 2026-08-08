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
  { cefr: "A1", infinitive: "ta", imperativ: "ta", presens: "tar", preteritum: "tog", supinum: "tagit", grupp: "4" },
  { cefr: "A1", infinitive: "se", imperativ: "se", presens: "ser", preteritum: "såg", supinum: "sett", grupp: "4" },
  { cefr: "A1", infinitive: "gå", imperativ: "gå", presens: "går", preteritum: "gick", supinum: "gått", grupp: "4" },
  { cefr: "A1", infinitive: "säga", imperativ: "säg", presens: "säger", preteritum: "sa", supinum: "sagt", grupp: "4" },
  { cefr: "A1", infinitive: "äga", imperativ: "äg", presens: "äger", preteritum: "ägde", supinum: "ägt", grupp: "2a" },
  { cefr: "A1", infinitive: "betyda", imperativ: "betyd", presens: "betyder", preteritum: "betydde", supinum: "betytt", grupp: "2a" },
  { cefr: "A1", infinitive: "ge", imperativ: "ge", presens: "ger", preteritum: "gav", supinum: "gett", grupp: "4" },
  { cefr: "A1", infinitive: "skriva", imperativ: "skriv", presens: "skriver", preteritum: "skrev", supinum: "skrivit", grupp: "4" },
  { cefr: "A1", infinitive: "te sig", imperativ: "te dig", presens: "ter sig", preteritum: "tedde sig", supinum: "tett sig", grupp: "3" },
  { cefr: "A1", infinitive: "riva", imperativ: "riv", presens: "river", preteritum: "rev", supinum: "rivit", grupp: "4" },
  { cefr: "A1", infinitive: "börja", imperativ: "börja", presens: "börjar", preteritum: "började", supinum: "börjat", grupp: "1" },
  { cefr: "A1", infinitive: "tro", imperativ: "tro", presens: "tror", preteritum: "trodde", supinum: "trott", grupp: "3" },
  { cefr: "A1", infinitive: "tycka", imperativ: "tyck", presens: "tycker", preteritum: "tyckte", supinum: "tyckt", grupp: "2b" },
  { cefr: "A1", infinitive: "veta", imperativ: "vet", presens: "vet", preteritum: "visste", supinum: "vetat", grupp: "4" },
  { cefr: "A1", infinitive: "försöka", imperativ: "försök", presens: "försöker", preteritum: "försökte", supinum: "försökt", grupp: "2b" },
  { cefr: "A1", infinitive: "behöva", imperativ: "behöv", presens: "behöver", preteritum: "behövde", supinum: "behövt", grupp: "2a" },
  { cefr: "A1", infinitive: "känna", imperativ: "känn", presens: "känner", preteritum: "kände", supinum: "känt", grupp: "2a" },
  { cefr: "A1", infinitive: "läsa", imperativ: "läs", presens: "läser", preteritum: "läste", supinum: "läst", grupp: "2b" },
  { cefr: "A1", infinitive: "ro", imperativ: "ro", presens: "ror", preteritum: "rodde", supinum: "rott", grupp: "3" },
  { cefr: "A1", infinitive: "låta", imperativ: "låt", presens: "låter", preteritum: "lät", supinum: "låtit", grupp: "4" },
  { cefr: "A1", infinitive: "stå", imperativ: "stå", presens: "står", preteritum: "stod", supinum: "stått", grupp: "4" },
  { cefr: "A1", infinitive: "visa", imperativ: "visa", presens: "visar", preteritum: "visade", supinum: "visat", grupp: "1" },
  { cefr: "A1", infinitive: "använda", imperativ: "använd", presens: "använder", preteritum: "använde", supinum: "använt", grupp: "2a" },
  { cefr: "A1", infinitive: "vända", imperativ: "vänd", presens: "vänder", preteritum: "vände", supinum: "vänt", grupp: "2a" },
  { cefr: "A1", infinitive: "hålla", imperativ: "håll", presens: "håller", preteritum: "höll", supinum: "hållit", grupp: "4" },
  { cefr: "A1", infinitive: "tänka", imperativ: "tänk", presens: "tänker", preteritum: "tänkte", supinum: "tänkt", grupp: "2b" },
  { cefr: "A1", infinitive: "söka", imperativ: "sök", presens: "söker", preteritum: "sökte", supinum: "sökt", grupp: "2b" },
  { cefr: "A1", infinitive: "ligga", imperativ: "ligg", presens: "ligger", preteritum: "låg", supinum: "legat", grupp: "4" },
  // "lägga" has two accepted preteritum forms, "la" and "lade" (SAOL). The
  // short form is stored here for consistency with "säga" -> "sa" above.
  // Until the app accepts alternate answers, a learner typing "lade" is
  // marked wrong even though it is correct: a product gap, not a data error.
  { cefr: "A1", infinitive: "lägga", imperativ: "lägg", presens: "lägger", preteritum: "la", supinum: "lagt", grupp: "4" },
  { cefr: "A1", infinitive: "anse", imperativ: "anse", presens: "anser", preteritum: "ansåg", supinum: "ansett", grupp: "4" },
  { cefr: "A1", infinitive: "öva", imperativ: "öva", presens: "övar", preteritum: "övade", supinum: "övat", grupp: "1" },
  { cefr: "A1", infinitive: "handla", imperativ: "handla", presens: "handlar", preteritum: "handlade", supinum: "handlat", grupp: "1" },
  { cefr: "A1", infinitive: "öka", imperativ: "öka", presens: "ökar", preteritum: "ökade", supinum: "ökat", grupp: "1" },
  { cefr: "A1", infinitive: "skapa", imperativ: "skapa", presens: "skapar", preteritum: "skapade", supinum: "skapat", grupp: "1" },
  { cefr: "A1", infinitive: "kapa", imperativ: "kapa", presens: "kapar", preteritum: "kapade", supinum: "kapat", grupp: "1" },
  { cefr: "A1", infinitive: "gälla", imperativ: "gäll", presens: "gäller", preteritum: "gällde", supinum: "gällt", grupp: "2a" },
  { cefr: "A1", infinitive: "verka", imperativ: "verka", presens: "verkar", preteritum: "verkade", supinum: "verkat", grupp: "1" },
  { cefr: "A1", infinitive: "tala", imperativ: "tala", presens: "talar", preteritum: "talade", supinum: "talat", grupp: "1" },
  { cefr: "A1", infinitive: "bära", imperativ: "bär", presens: "bär", preteritum: "bar", supinum: "burit", grupp: "4" },
  { cefr: "A1", infinitive: "höra", imperativ: "hör", presens: "hör", preteritum: "hörde", supinum: "hört", grupp: "2a" },
];
