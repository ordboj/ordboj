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
  // True only for verbs that grammatically have no imperativ at all in
  // Swedish — modal/auxiliary verbs (kunna, få, vilja, ...). Distinguishes
  // that fact from "not filled in yet": every other row must have a
  // non-empty imperativ, and an empty imperativ without this flag set is a
  // data bug, not a deliberate gap. Omitted (undefined) is equivalent to
  // false and is the correct value for every non-modal verb.
  noNaturalImperativ?: boolean;
  // Recognition-only prose about the lemma, e.g. naming an archaic or
  // colloquial variant ("taga" for "ta"). #43/C2 (docs/learning/
  // 2026-08-08-verb-data-conventions.md): may be shown after an answer is
  // graded, never during retrieval, and the variant it names never joins
  // any accepted-answer set — AlternateFormField / getAcceptedAnswers stay
  // untouched by this field. Optional; omitted for almost every row.
  note?: string;
  // Per-form disclosure override for a sense-conditioned alternate pair
  // (e.g. lyda preteritum -- "lydde" for the "obey" sense vs "löd" for the
  // "read as/state" sense). #43/C6a: when a note exists for the graded
  // form, getAlternatesDisclosure (src/lib/verbs.ts) returns it instead of
  // the generic "Both X and Y are correct" line, which would misstate a
  // real sense split as free interchangeability. Optional; only pairs the
  // linguist has classified as sense-conditioned carry one.
  alternatesNote?: Partial<Record<AlternateFormField, string>>;
}

export const VERB_DATA: VerbData[] = [
  { cefr: "A1", infinitive: "vara", imperativ: "var", presens: "är", preteritum: "var", supinum: "varit", grupp: "4" },
  { cefr: "A1", infinitive: "ha", imperativ: "ha", presens: "har", preteritum: "hade", supinum: "haft", grupp: "4" },
  { cefr: "A1", infinitive: "kunna", imperativ: "", presens: "kan", preteritum: "kunde", supinum: "kunnat", grupp: "4", noNaturalImperativ: true }, // modal verb: no imperativ in Swedish, empty is correct
  { cefr: "B2", infinitive: "unna", imperativ: "unna", presens: "unnar", preteritum: "unnade", supinum: "unnat", grupp: "1" }, // re-tagged #42: "unna" (indulge/not begrudge) is formal register, not everyday A1 vocabulary
  { cefr: "A1", infinitive: "få", imperativ: "", presens: "får", preteritum: "fick", supinum: "fått", grupp: "4", noNaturalImperativ: true }, // modal verb: no imperativ in Swedish, empty is correct
  { cefr: "A1", infinitive: "bli", imperativ: "bli", presens: "blir", preteritum: "blev", supinum: "blivit", grupp: "4" },
  { cefr: "A1", infinitive: "komma", imperativ: "kom", presens: "kommer", preteritum: "kom", supinum: "kommit", grupp: "4" },
  { cefr: "A1", infinitive: "vilja", imperativ: "", presens: "vill", preteritum: "ville", supinum: "velat", grupp: "4", noNaturalImperativ: true }, // modal verb: no imperativ in Swedish, empty is correct
  { cefr: "A1", infinitive: "göra", imperativ: "gör", presens: "gör", preteritum: "gjorde", supinum: "gjort", grupp: "4" },
  { cefr: "A1", infinitive: "finna", imperativ: "finn", presens: "finner", preteritum: "fann", supinum: "funnit", grupp: "4" },
  { cefr: "A1", infinitive: "ta", imperativ: "ta", presens: "tar", preteritum: "tog", supinum: "tagit", grupp: "4", note: "taga is an archaic, literary variant of ta. Recognition only, not accepted as an answer." },
  { cefr: "A1", infinitive: "se", imperativ: "se", presens: "ser", preteritum: "såg", supinum: "sett", grupp: "4" },
  { cefr: "A1", infinitive: "gå", imperativ: "gå", presens: "går", preteritum: "gick", supinum: "gått", grupp: "4" },
  // preteritum: "sa" is the primary stored form and "sade" the equally
  // correct SAOL alternate. Both are standard modern Swedish; "sade" is the
  // more written/formal of the two. Order matters — index 0 is what the app
  // displays, hints and speaks (see the #123 decision doc, P1/P5).
  // #43/C5 category: free variant (same sense, register difference only).
  { cefr: "A1", infinitive: "säga", imperativ: "säg", presens: "säger", preteritum: "sa", supinum: "sagt", grupp: "4", alternates: { preteritum: ["sade"] } },
  { cefr: "A1", infinitive: "äga", imperativ: "äg", presens: "äger", preteritum: "ägde", supinum: "ägt", grupp: "2a" },
  { cefr: "A1", infinitive: "betyda", imperativ: "betyd", presens: "betyder", preteritum: "betydde", supinum: "betytt", grupp: "2a" },
  { cefr: "A1", infinitive: "ge", imperativ: "ge", presens: "ger", preteritum: "gav", supinum: "gett", grupp: "4", note: "giva is an archaic, literary variant of ge. Recognition only, not accepted as an answer." },
  { cefr: "A1", infinitive: "skriva", imperativ: "skriv", presens: "skriver", preteritum: "skrev", supinum: "skrivit", grupp: "4" },
  { cefr: "C1", infinitive: "te sig", imperativ: "", presens: "ter sig", preteritum: "tedde sig", supinum: "tett sig", grupp: "3" }, // re-tagged #42: formal/literary register ("to appear/seem"), not a beginner verb. NEEDS HUMAN CHECK: reflexive + stative; imperativ would need pronoun swap (sig -> dig), uncertain whether it's used naturally — not guessed
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
  // preteritum: same pair as "säga" above — "la" primary, "lade" the equally
  // correct SAOL alternate. The short form is primary for consistency with
  // "sa", and because P5 sizes the hint blanks to the primary.
  // #43/C5 category: free variant (same sense, register difference only).
  { cefr: "A1", infinitive: "lägga", imperativ: "lägg", presens: "lägger", preteritum: "la", supinum: "lagt", grupp: "4", alternates: { preteritum: ["lade"] } },
  { cefr: "A1", infinitive: "anse", imperativ: "", presens: "anser", preteritum: "ansåg", supinum: "ansett", grupp: "4" }, // NEEDS HUMAN CHECK: formal stative "to deem/consider" (like "se" pattern, possibly imperativ "anse"), uncertain if naturally used — not guessed
  { cefr: "A1", infinitive: "öva", imperativ: "öva", presens: "övar", preteritum: "övade", supinum: "övat", grupp: "1" },
  { cefr: "A1", infinitive: "handla", imperativ: "handla", presens: "handlar", preteritum: "handlade", supinum: "handlat", grupp: "1" },
  { cefr: "A1", infinitive: "öka", imperativ: "öka", presens: "ökar", preteritum: "ökade", supinum: "ökat", grupp: "1" },
  { cefr: "A1", infinitive: "skapa", imperativ: "skapa", presens: "skapar", preteritum: "skapade", supinum: "skapat", grupp: "1" },
  { cefr: "B2", infinitive: "kapa", imperativ: "kapa", presens: "kapar", preteritum: "kapade", supinum: "kapat", grupp: "1" }, // re-tagged #42: "kapa" (hijack/cut/chop) is specialized register, not everyday A1 vocabulary
  { cefr: "A1", infinitive: "gälla", imperativ: "gäll", presens: "gäller", preteritum: "gällde", supinum: "gällt", grupp: "2a" },
  { cefr: "A1", infinitive: "verka", imperativ: "verka", presens: "verkar", preteritum: "verkade", supinum: "verkat", grupp: "1" },
  { cefr: "A1", infinitive: "tala", imperativ: "tala", presens: "talar", preteritum: "talade", supinum: "talat", grupp: "1" },
  { cefr: "A1", infinitive: "bära", imperativ: "bär", presens: "bär", preteritum: "bar", supinum: "burit", grupp: "4" },
  { cefr: "A1", infinitive: "höra", imperativ: "hör", presens: "hör", preteritum: "hörde", supinum: "hört", grupp: "2a" },
  // Appended for #262: unlocks verified:false particle verbs (stänga av,
  // sätta på, stiga upp, hälsa på, bygga ut, ställa in) whose base verb was
  // missing from VERB_DATA. Append-only — existing row order above is
  // frozen by verbData.orderPin.test.ts.
  { cefr: "A1", infinitive: "stänga", imperativ: "stäng", presens: "stänger", preteritum: "stängde", supinum: "stängt", grupp: "2a" },
  { cefr: "A1", infinitive: "sätta", imperativ: "sätt", presens: "sätter", preteritum: "satte", supinum: "satt", grupp: "4" },
  { cefr: "A1", infinitive: "stiga", imperativ: "stig", presens: "stiger", preteritum: "steg", supinum: "stigit", grupp: "4" },
  { cefr: "A2", infinitive: "hälsa", imperativ: "hälsa", presens: "hälsar", preteritum: "hälsade", supinum: "hälsat", grupp: "1" },
  { cefr: "A1", infinitive: "bygga", imperativ: "bygg", presens: "bygger", preteritum: "byggde", supinum: "byggt", grupp: "2a" },
  { cefr: "A1", infinitive: "ställa", imperativ: "ställ", presens: "ställer", preteritum: "ställde", supinum: "ställt", grupp: "2a" },
];
