// Hardcoded Swedish verb conjugation data
// This data is extracted from the CSV to improve loading performance

export interface VerbData {
  cefr: string;
  infinitive: string;
  imperativ: string;
  presens: string;
  preteritum: string;
  supinum: string;
}

export const VERB_DATA: VerbData[] = [
  { cefr: "A1", infinitive: "vara", imperativ: "var", presens: "är", preteritum: "var", supinum: "varit" },
  { cefr: "A1", infinitive: "ha", imperativ: "ha", presens: "har", preteritum: "hade", supinum: "haft" },
  { cefr: "A1", infinitive: "kunna", imperativ: "", presens: "kan", preteritum: "kunde", supinum: "kunnat" },
  { cefr: "A1", infinitive: "unna", imperativ: "unna", presens: "unnar", preteritum: "unnade", supinum: "unnat" },
  { cefr: "A1", infinitive: "få", imperativ: "", presens: "får", preteritum: "fick", supinum: "fått" },
  { cefr: "A1", infinitive: "bli", imperativ: "bli", presens: "blir", preteritum: "blev", supinum: "blivit" },
  { cefr: "A1", infinitive: "komma", imperativ: "kom", presens: "kommer", preteritum: "kom", supinum: "kommit" },
  { cefr: "A1", infinitive: "vilja", imperativ: "", presens: "vill", preteritum: "ville", supinum: "velat" },
  { cefr: "A1", infinitive: "göra", imperativ: "gör", presens: "gör", preteritum: "gjorde", supinum: "gjort" },
  { cefr: "A1", infinitive: "finna", imperativ: "finn", presens: "finner", preteritum: "fann", supinum: "funnit" },
  { cefr: "A1", infinitive: "ta", imperativ: "", presens: "tar", preteritum: "tade", supinum: "tat" },
  { cefr: "A1", infinitive: "se", imperativ: "", presens: "ser", preteritum: "såg", supinum: "sett" },
  { cefr: "A1", infinitive: "gå", imperativ: "", presens: "går", preteritum: "gick", supinum: "gắtt" },
  { cefr: "A1", infinitive: "säga", imperativ: "", presens: "säger", preteritum: "sa", supinum: "sagt" },
  { cefr: "A1", infinitive: "äga", imperativ: "", presens: "äger", preteritum: "ägde", supinum: "ägt" },
  { cefr: "A1", infinitive: "betyda", imperativ: "", presens: "betyder", preteritum: "betydde", supinum: "betytt" },
  { cefr: "A1", infinitive: "ge", imperativ: "", presens: "ger", preteritum: "gav", supinum: "gett" },
  { cefr: "A1", infinitive: "skriva", imperativ: "", presens: "skriver", preteritum: "skrev", supinum: "skrivit" },
  { cefr: "A1", infinitive: "te sig", imperativ: "", presens: "ter sig", preteritum: "tedde sig", supinum: "tett sig" },
  { cefr: "A1", infinitive: "riva", imperativ: "", presens: "river", preteritum: "rev", supinum: "rivit" },
  { cefr: "A1", infinitive: "börja", imperativ: "", presens: "börjar", preteritum: "började", supinum: "börjat" },
  { cefr: "A1", infinitive: "tro", imperativ: "", presens: "tror", preteritum: "trodde", supinum: "trott" },
  { cefr: "A1", infinitive: "tycka", imperativ: "", presens: "tycker", preteritum: "tyckte", supinum: "tyckt" },
  { cefr: "A1", infinitive: "veta", imperativ: "", presens: "vet", preteritum: "visste", supinum: "vetat" },
  { cefr: "A1", infinitive: "försöka", imperativ: "", presens: "försöker", preteritum: "försökte", supinum: "försökt" },
  { cefr: "A1", infinitive: "behöva", imperativ: "", presens: "behöver", preteritum: "behövde", supinum: "behövt" },
  { cefr: "A1", infinitive: "känna", imperativ: "", presens: "känner", preteritum: "kände", supinum: "känt" },
  { cefr: "A1", infinitive: "läsa", imperativ: "", presens: "läser", preteritum: "läste", supinum: "läst" },
  { cefr: "A1", infinitive: "ro", imperativ: "", presens: "ror", preteritum: "rodde", supinum: "rott" },
  { cefr: "A1", infinitive: "låta", imperativ: "", presens: "låter", preteritum: "lat", supinum: "låtit" },
  { cefr: "A1", infinitive: "stå", imperativ: "", presens: "står", preteritum: "stod", supinum: "stått" },
  { cefr: "A1", infinitive: "visa", imperativ: "", presens: "visar", preteritum: "visade", supinum: "visat" },
  { cefr: "A1", infinitive: "använda", imperativ: "", presens: "använder", preteritum: "använde", supinum: "använt" },
  { cefr: "A1", infinitive: "vända", imperativ: "", presens: "vändar", preteritum: "vändade", supinum: "vändat" },
  { cefr: "A1", infinitive: "hålla", imperativ: "", presens: "håller", preteritum: "höll", supinum: "hållit" },
  { cefr: "A1", infinitive: "tänka", imperativ: "", presens: "tänker", preteritum: "tänkte", supinum: "tänkt" },
  { cefr: "A1", infinitive: "söka", imperativ: "", presens: "sökar", preteritum: "sökade", supinum: "sökat" },
  { cefr: "A1", infinitive: "ligga", imperativ: "", presens: "ligger", preteritum: "låg", supinum: "legat" },
  { cefr: "A1", infinitive: "lägga", imperativ: "", presens: "läggar", preteritum: "läggade", supinum: "läggat" },
  { cefr: "A1", infinitive: "anse", imperativ: "", presens: "anser", preteritum: "ansåg", supinum: "ansett" },
  { cefr: "A1", infinitive: "öva", imperativ: "", presens: "övar", preteritum: "övade", supinum: "övat" },
  { cefr: "A1", infinitive: "handla", imperativ: "", presens: "handlar", preteritum: "handlade", supinum: "handlat" },
  { cefr: "A1", infinitive: "öka", imperativ: "", presens: "ökar", preteritum: "ökade", supinum: "ökat" },
  { cefr: "A1", infinitive: "skapa", imperativ: "", presens: "skapar", preteritum: "skapade", supinum: "skapat" },
  { cefr: "A1", infinitive: "kapa", imperativ: "", presens: "kapar", preteritum: "kapade", supinum: "kapat" },
  { cefr: "A1", infinitive: "gälla", imperativ: "", presens: "gäller", preteritum: "gällde", supinum: "gällt" },
  { cefr: "A1", infinitive: "verka", imperativ: "", presens: "verkar", preteritum: "verkade", supinum: "verkat" },
  { cefr: "A1", infinitive: "tala", imperativ: "", presens: "talar", preteritum: "talade", supinum: "talat" },
  { cefr: "A1", infinitive: "bära", imperativ: "", presens: "bär", preteritum: "bar", supinum: "burit" },
  { cefr: "A1", infinitive: "höra", imperativ: "", presens: "hör", preteritum: "hörde", supinum: "hört" },
];
