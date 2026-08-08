// Swedish particle verbs (partikelverb) for the particle practice mode.
//
// Not rows in VERB_DATA: different shape, and appending there would renumber
// the index-derived ids every learner's progress is keyed on (see
// src/data/verbData.orderPin.test.ts).
//
// CEFR bands: derived from SVALex (CEFRLex project, UCLouvain /
// Språkbanken) as the first level with nonzero frequency in the resource's
// per-level distribution. That derivation is ours, not a label SVALex
// assigns — see docs/research/svalex/README.md. Entries with no SVALex row
// carry cefrEvidence: 'judgment' so the difference is visible in the data
// rather than implied. Nothing here is an official CEFR standard and the UI
// must not present it as one.
//
// SVALex and SweLLex are CC BY-NC-SA 4.0; the bands below are a derivative
// and carry the same terms (attribution, non-commercial, share-alike).
//
// What is deliberately excluded: inseparable prefixed compounds (påminna,
// avbryta), plain verb + preposition (titta på TV, bero på), and any
// classification still uncertain (ta reda på, komma överens). Under "wrong
// Swedish is worse than missing Swedish" the cost of leaving a verb out is
// one missing card; the cost of a wrong one is a learner taught a fiction.

export type ParticleVerbCefr = 'A1' | 'A2' | 'B1' | 'B2' | 'C1';

// Where the entry's band comes from. 'svalex' means a row in
// docs/research/svalex/partikelverb_cefr_draft.csv supports it; 'judgment'
// means no row exists and the band is an editorial call. Recorded per entry
// because the spec requires the derivation to be stated as method.
export type CefrEvidence = 'svalex' | 'judgment';

// Where the reflexive pronoun sits relative to the particle. `höra av sig`
// puts it after, `ge sig av` before. 'none' is every non-reflexive entry.
export type ReflexivePosition = 'none' | 'beforeParticle' | 'afterParticle';

export interface ParticleVerbExample {
  // A full presens sentence. v1 tests no other tense: the particle never
  // inflects, so the difficulty is lexical, not morphological.
  sv: string;
  // Index into sv.split(' ') of the token to blank on a cloze card. Always
  // explicit: deriving it by searching for the particle string picks the
  // wrong token whenever the particle also occurs as an ordinary
  // preposition elsewhere in the sentence.
  blankIndex: number;
  en?: string;
  // Particles the linguist has actively confirmed cannot fill this exact
  // blank — grammatically broken or nonsensical in this sentence, not
  // merely "not the intended answer". Groundwork for a future discrimination
  // exercise and a record that a candidate was considered and rejected,
  // rather than never considered. Never overlaps acceptedParticles (#318;
  // qa asserts this in the dataset-integrity test). Left unset when no
  // substitution has been individually verified — an empty guess would be
  // worse than no claim at all, per "never guess Swedish".
  excludedParticles?: string[];
}

export interface ParticleVerbData {
  // "pv:hora-av-sig" — ASCII-folded slug, stable, never positional. Folded
  // because ids become localStorage keys, and a NFC/NFD normalization
  // mismatch on å/ä/ö would silently orphan a learner's progress. Display
  // strings keep their diacritics. Append-only: renaming one is a migration.
  id: string;
  cefr: ParticleVerbCefr;
  cefrEvidence: CefrEvidence;
  // MUST resolve in VERB_DATA for any entry that ships: the introduction
  // gate joins on it, so an unresolvable base is content that can never be
  // reached. Enforced in particleVerbData.test.ts.
  baseInfinitive: string;
  // The cloze answer.
  particle: string;
  reflexive: ReflexivePosition;
  // Citation form. Reflexives use the {refl} placeholder rather than a
  // literal "sig", because "sig" is wrong in the first and second person and
  // a learner who memorises it will say *"jag hör av sig".
  lemma: string;
  gloss: { en: string; sv?: string };
  transparency: 'literal' | 'idiomatic';
  // A near neighbour worth naming on the feedback screen, usually a
  // prepositional twin distinguished only by stress.
  contrast?: string;
  // Accepted cloze answers, primary first. More than one entry means the
  // frame genuinely admits more than one particle; grading a defensible
  // answer wrong is the correctness violation this list exists to prevent
  // (docs/product/2026-08-08-alternate-answers-decision.md).
  acceptedRecall?: string[];
  acceptedParticles: string[];
  examples: ParticleVerbExample[];
  // Human-checked. false is never shown to a learner and never enumerated
  // by the provider — the honest state for content that is drafted but not
  // confirmed, rather than shipping a guess.
  verified: boolean;
  // Required whenever verified is false, so "not shipped" always says why.
  unverifiedReason?: string;
  // The phrase's presens/preteritum/supinum, embedded rather than joined
  // from VERB_DATA at render time (#318). Each value is the base verb's
  // human-verified form (VERB_DATA) with the invariant particle appended —
  // particle verbs conjugate the verb only, per the project's particle-verb
  // rule — checked against SO/SAOL like every other shipped form. Required
  // for a verified:true entry to render its reference line at all. Every
  // verified entry's base still resolves in VERB_DATA — the dataset test
  // enforces that — so these values duplicate VERB_DATA on purpose; the
  // lookup moved from render time to authoring time, and a dataset test
  // pins the copies against VERB_DATA.
  forms?: {
    presens: string;
    preteritum: string;
    supinum: string;
  };
}

export const PARTICLE_VERB_DATA: ParticleVerbData[] = [
  // ---- A1 ----
  {
    id: 'pv:ga-ut',
    cefr: 'A1',
    cefrEvidence: 'svalex',
    baseInfinitive: 'gå',
    particle: 'ut',
    reflexive: 'none',
    lemma: 'gå ut',
    gloss: { en: 'to leave the house; to spend an evening socialising' },
    transparency: 'literal',
    acceptedParticles: ['ut'],
    examples: [
      { sv: 'Vi går ut och äter middag varje fredag.', blankIndex: 2 },
      { sv: 'Hon går ut genom dörren utan ett ord.', blankIndex: 2 },
      { sv: 'På lördagar går de ut med sina vänner.', blankIndex: 4 },
    ],
    verified: true,
    forms: { presens: 'går ut', preteritum: 'gick ut', supinum: 'gått ut' },
  },
  {
    id: 'pv:ga-in',
    cefr: 'A1',
    cefrEvidence: 'svalex',
    baseInfinitive: 'gå',
    particle: 'in',
    reflexive: 'none',
    lemma: 'gå in',
    gloss: { en: 'to enter a room or building' },
    transparency: 'literal',
    acceptedParticles: ['in'],
    examples: [
      { sv: 'Barnen går in i huset när det regnar.', blankIndex: 2 },
      { sv: 'Han går in på kontoret klockan åtta varje morgon.', blankIndex: 2 },
      { sv: 'Vi går in genom den stora dörren.', blankIndex: 2 },
    ],
    verified: true,
    forms: { presens: 'går in', preteritum: 'gick in', supinum: 'gått in' },
  },
  {
    id: 'pv:ga-upp',
    cefr: 'A1',
    cefrEvidence: 'svalex',
    baseInfinitive: 'gå',
    particle: 'upp',
    reflexive: 'none',
    lemma: 'gå upp',
    gloss: { en: 'to rise; to increase' },
    transparency: 'literal',
    acceptedParticles: ['upp'],
    examples: [
      { sv: 'Solen går upp klockan fyra på morgonen i juni.', blankIndex: 2 },
      { sv: 'Priserna går upp när efterfrågan blir större.', blankIndex: 2 },
      { sv: 'Temperaturen går upp några grader varje eftermiddag.', blankIndex: 2 },
    ],
    verified: true,
    forms: { presens: 'går upp', preteritum: 'gick upp', supinum: 'gått upp' },
  },
  {
    id: 'pv:ga-ner',
    cefr: 'A1',
    cefrEvidence: 'svalex',
    baseInfinitive: 'gå',
    particle: 'ner',
    reflexive: 'none',
    lemma: 'gå ner',
    gloss: { en: 'to descend; to decrease' },
    transparency: 'literal',
    // "ned" is the same verb in a more formal spelling, standard in SAOL and
    // listed separately in SVALex. Marking it wrong would teach a fiction.
    acceptedParticles: ['ner', 'ned'],
    examples: [
      { sv: 'Solen går ner bakom bergen på kvällen.', blankIndex: 2 },
      { sv: 'Priserna går ner efter jul varje år.', blankIndex: 2 },
      { sv: 'Hon går ner för trappan med sin väska.', blankIndex: 2 },
    ],
    verified: true,
    forms: { presens: 'går ner', preteritum: 'gick ner', supinum: 'gått ner' },
  },
  {
    id: 'pv:se-ut',
    cefr: 'A1',
    cefrEvidence: 'svalex',
    baseInfinitive: 'se',
    particle: 'ut',
    reflexive: 'none',
    lemma: 'se ut',
    gloss: { en: 'to appear or seem a certain way' },
    transparency: 'idiomatic',
    acceptedParticles: ['ut'],
    examples: [
      // The first two frames put an adjective between verb and particle,
      // which is where Swedish word order differs most visibly from English.
      { sv: 'Du ser trött ut efter den långa resan.', blankIndex: 3 },
      { sv: 'Huset ser gammalt ut men det är nytt inuti.', blankIndex: 3 },
      { sv: 'Det ser ut som om det ska regna snart.', blankIndex: 2 },
    ],
    verified: true,
    forms: { presens: 'ser ut', preteritum: 'såg ut', supinum: 'sett ut' },
  },
  {
    id: 'pv:komma-in',
    cefr: 'A1',
    cefrEvidence: 'svalex',
    baseInfinitive: 'komma',
    particle: 'in',
    reflexive: 'none',
    lemma: 'komma in',
    gloss: { en: 'to enter; to gain admission' },
    transparency: 'literal',
    acceptedParticles: ['in'],
    examples: [
      { sv: 'Han kommer in i rummet med en stor låda.', blankIndex: 2 },
      { sv: 'Ljuset kommer in genom det stora fönstret.', blankIndex: 2 },
      { sv: 'Hon kommer in på universitetet nästa höst.', blankIndex: 2 },
    ],
    verified: true,
    forms: { presens: 'kommer in', preteritum: 'kom in', supinum: 'kommit in' },
  },
  {
    id: 'pv:komma-fram',
    cefr: 'A1',
    cefrEvidence: 'svalex',
    baseInfinitive: 'komma',
    particle: 'fram',
    reflexive: 'none',
    lemma: 'komma fram',
    gloss: { en: 'to arrive at a destination' },
    transparency: 'idiomatic',
    acceptedParticles: ['fram'],
    examples: [
      { sv: 'Tåget kommer fram till stationen klockan sex.', blankIndex: 2 },
      { sv: 'Vi kommer fram sent på kvällen efter resan.', blankIndex: 2 },
      { sv: 'Brevet kommer fram efter tre dagar med posten.', blankIndex: 2 },
    ],
    verified: true,
    forms: { presens: 'kommer fram', preteritum: 'kom fram', supinum: 'kommit fram' },
  },
  {
    id: 'pv:komma-ihag',
    cefr: 'A1',
    cefrEvidence: 'svalex',
    baseInfinitive: 'komma',
    particle: 'ihåg',
    reflexive: 'none',
    lemma: 'komma ihåg',
    gloss: { en: 'to retain in memory; to recall' },
    transparency: 'idiomatic',
    acceptedParticles: ['ihåg'],
    // "in"/"fram" excluded in every frame below: both require a following
    // preposition before a noun ("komma in i/på X", "komma fram till X"),
    // and each frame's blank is followed by a bare noun phrase with no
    // preposition, so either substitution is ungrammatical, not just wrong.
    examples: [
      {
        sv: 'Jag kommer ihåg hennes namn från förra året.',
        blankIndex: 2,
        excludedParticles: ['in', 'fram'],
      },
      {
        sv: 'Han kommer ihåg alla telefonnummer utan att skriva.',
        blankIndex: 2,
        excludedParticles: ['in', 'fram'],
      },
      {
        sv: 'Vi kommer ihåg den dagen mycket tydligt.',
        blankIndex: 2,
        excludedParticles: ['in', 'fram'],
      },
    ],
    verified: true,
    forms: { presens: 'kommer ihåg', preteritum: 'kom ihåg', supinum: 'kommit ihåg' },
  },
  {
    id: 'pv:komma-tillbaka',
    cefr: 'A1',
    cefrEvidence: 'svalex',
    baseInfinitive: 'komma',
    particle: 'tillbaka',
    reflexive: 'none',
    lemma: 'komma tillbaka',
    gloss: { en: 'to return to a place' },
    transparency: 'literal',
    acceptedParticles: ['tillbaka'],
    examples: [
      { sv: 'Hon kommer tillbaka till Sverige nästa sommar.', blankIndex: 2 },
      { sv: 'Vi kommer tillbaka hem sent på söndagen.', blankIndex: 2 },
      { sv: 'Han kommer tillbaka till jobbet efter sin semester.', blankIndex: 2 },
    ],
    verified: true,
    forms: { presens: 'kommer tillbaka', preteritum: 'kom tillbaka', supinum: 'kommit tillbaka' },
  },
  {
    id: 'pv:ta-med',
    cefr: 'A1',
    cefrEvidence: 'svalex',
    baseInfinitive: 'ta',
    particle: 'med',
    reflexive: 'none',
    lemma: 'ta med',
    gloss: { en: 'to bring something along' },
    transparency: 'literal',
    acceptedParticles: ['med'],
    examples: [
      { sv: 'Jag tar med en present till hennes födelsedag.', blankIndex: 2 },
      { sv: 'Vi tar med mat och dryck till festen.', blankIndex: 2 },
      { sv: 'Hon tar med barnen till parken varje lördag.', blankIndex: 2 },
    ],
    verified: true,
    forms: { presens: 'tar med', preteritum: 'tog med', supinum: 'tagit med' },
  },
  {
    id: 'pv:ta-ut',
    cefr: 'A1',
    cefrEvidence: 'svalex',
    baseInfinitive: 'ta',
    particle: 'ut',
    reflexive: 'none',
    lemma: 'ta ut',
    gloss: { en: 'to withdraw; to remove from inside something' },
    transparency: 'literal',
    acceptedParticles: ['ut'],
    examples: [
      { sv: 'Han tar ut pengar från banken varje månad.', blankIndex: 2 },
      { sv: 'Jag tar ut soporna innan jag går hemifrån.', blankIndex: 2 },
      { sv: 'Hon tar ut tallrikarna ur skåpet före middagen.', blankIndex: 2 },
    ],
    verified: true,
    forms: { presens: 'tar ut', preteritum: 'tog ut', supinum: 'tagit ut' },
  },
  {
    id: 'pv:tala-om',
    cefr: 'A1',
    cefrEvidence: 'svalex',
    baseInfinitive: 'tala',
    particle: 'om',
    reflexive: 'none',
    lemma: 'tala om',
    gloss: { en: 'to inform someone of something' },
    transparency: 'idiomatic',
    // The classic Swedish stress minimal pair. Every frame below uses the
    // "tala om för någon" construction, which only the particle reading
    // allows, so the card never sits on the ambiguous reading.
    contrast: 'tala om något (stress on tala) — to discuss a topic',
    acceptedParticles: ['om'],
    // "till" excluded: every frame is "talar ___ för NP", and "tala till"
    // (address someone) never takes a "för" complement — the two do not
    // combine in Swedish, so the substitution is ungrammatical here.
    examples: [
      {
        sv: 'Han talar om för mig var nyckeln finns.',
        blankIndex: 2,
        excludedParticles: ['till'],
      },
      {
        sv: 'Hon talar om för oss vad som har hänt.',
        blankIndex: 2,
        excludedParticles: ['till'],
      },
      {
        sv: 'Jag talar om för honom att mötet börjar sent.',
        blankIndex: 2,
        excludedParticles: ['till'],
      },
    ],
    verified: true,
    forms: { presens: 'talar om', preteritum: 'talade om', supinum: 'talat om' },
  },
  {
    id: 'pv:vara-med',
    cefr: 'A1',
    cefrEvidence: 'svalex',
    baseInfinitive: 'vara',
    particle: 'med',
    reflexive: 'none',
    lemma: 'vara med',
    gloss: { en: 'to take part; to be present' },
    transparency: 'idiomatic',
    acceptedParticles: ['med'],
    examples: [
      { sv: 'Hon är med på mötet varje torsdag morgon.', blankIndex: 2 },
      { sv: 'Jag är med i en kör som sjunger jazz.', blankIndex: 2 },
      { sv: 'Alla barnen är med i den nya filmen.', blankIndex: 3 },
    ],
    verified: true,
    forms: { presens: 'är med', preteritum: 'var med', supinum: 'varit med' },
  },

  // ---- A2 ----
  {
    id: 'pv:tycka-om',
    cefr: 'A2',
    cefrEvidence: 'svalex',
    baseInfinitive: 'tycka',
    particle: 'om',
    reflexive: 'none',
    lemma: 'tycka om',
    gloss: { en: 'to be fond of; to enjoy' },
    transparency: 'idiomatic',
    acceptedParticles: ['om'],
    examples: [
      { sv: 'Jag tycker om att simma i havet på sommaren.', blankIndex: 2 },
      { sv: 'Hon tycker om starkt kaffe utan socker och mjölk.', blankIndex: 2 },
      { sv: 'Barnen tycker om den nya läraren i skolan.', blankIndex: 2 },
    ],
    verified: true,
    forms: { presens: 'tycker om', preteritum: 'tyckte om', supinum: 'tyckt om' },
  },
  {
    id: 'pv:ge-upp',
    cefr: 'A2',
    cefrEvidence: 'svalex',
    baseInfinitive: 'ge',
    particle: 'upp',
    reflexive: 'none',
    lemma: 'ge upp',
    gloss: { en: 'to abandon an effort; to surrender' },
    transparency: 'idiomatic',
    acceptedParticles: ['upp'],
    examples: [
      { sv: 'Han ger upp efter tre timmar av hårt arbete.', blankIndex: 2 },
      // Adverb between verb and particle: another word-order frame.
      { sv: 'Vi ger aldrig upp trots alla svåra problem.', blankIndex: 3 },
      { sv: 'Hon ger upp sin plats i tävlingen.', blankIndex: 2 },
    ],
    verified: true,
    forms: { presens: 'ger upp', preteritum: 'gav upp', supinum: 'gett upp' },
  },
  {
    id: 'pv:komma-ut',
    cefr: 'A2',
    cefrEvidence: 'svalex',
    baseInfinitive: 'komma',
    particle: 'ut',
    reflexive: 'none',
    lemma: 'komma ut',
    // Narrowed to the publication sense on purpose: the wider "come out of
    // somewhere" reading would make the recall gloss select more than one
    // phrase.
    gloss: { en: 'to be published or released' },
    transparency: 'idiomatic',
    acceptedParticles: ['ut'],
    examples: [
      { sv: 'Boken kommer ut i mars nästa år.', blankIndex: 2 },
      { sv: 'Filmen kommer ut på bio till hösten.', blankIndex: 2 },
      { sv: 'Tidningen kommer ut varje onsdag i hela landet.', blankIndex: 2 },
    ],
    verified: true,
    forms: { presens: 'kommer ut', preteritum: 'kom ut', supinum: 'kommit ut' },
  },
  {
    id: 'pv:kanna-igen',
    cefr: 'A2',
    cefrEvidence: 'svalex',
    baseInfinitive: 'känna',
    particle: 'igen',
    reflexive: 'none',
    lemma: 'känna igen',
    gloss: { en: 'to identify someone or something already known' },
    transparency: 'idiomatic',
    acceptedParticles: ['igen'],
    examples: [
      { sv: 'Jag känner igen hennes röst på telefonen direkt.', blankIndex: 2 },
      { sv: 'Han känner igen alla bilar i hela kvarteret.', blankIndex: 2 },
      { sv: 'Vi känner igen melodin men minns inte titeln.', blankIndex: 2 },
    ],
    verified: true,
    forms: { presens: 'känner igen', preteritum: 'kände igen', supinum: 'känt igen' },
  },
  {
    id: 'pv:halla-pa',
    cefr: 'A2',
    cefrEvidence: 'svalex',
    baseInfinitive: 'hålla',
    particle: 'på',
    reflexive: 'none',
    lemma: 'hålla på',
    gloss: { en: 'to be in the middle of doing something' },
    transparency: 'idiomatic',
    acceptedParticles: ['på'],
    examples: [
      { sv: 'Hon håller på med läxorna hela kvällen.', blankIndex: 2 },
      { sv: 'Vi håller på att laga mat till festen.', blankIndex: 2 },
      { sv: 'Han håller på med sitt projekt varje helg.', blankIndex: 2 },
    ],
    verified: true,
    forms: { presens: 'håller på', preteritum: 'höll på', supinum: 'hållit på' },
  },
  {
    id: 'pv:halla-med',
    cefr: 'A2',
    cefrEvidence: 'svalex',
    baseInfinitive: 'hålla',
    particle: 'med',
    reflexive: 'none',
    lemma: 'hålla med',
    gloss: { en: "to share someone's opinion; to concur" },
    transparency: 'idiomatic',
    acceptedParticles: ['med'],
    examples: [
      { sv: 'Jag håller med dig om det nya förslaget.', blankIndex: 2 },
      { sv: 'Alla håller med läraren i den här frågan.', blankIndex: 2 },
      { sv: 'Hon håller inte med sin bror om politik.', blankIndex: 3 },
    ],
    verified: true,
    forms: { presens: 'håller med', preteritum: 'höll med', supinum: 'hållit med' },
  },
  {
    id: 'pv:ta-upp',
    cefr: 'A2',
    cefrEvidence: 'svalex',
    baseInfinitive: 'ta',
    particle: 'upp',
    reflexive: 'none',
    lemma: 'ta upp',
    gloss: { en: 'to raise a topic for discussion' },
    transparency: 'idiomatic',
    acceptedParticles: ['upp'],
    examples: [
      { sv: 'Han tar upp frågan på nästa möte.', blankIndex: 2 },
      { sv: 'Vi tar upp problemet med chefen i morgon.', blankIndex: 2 },
      { sv: 'Hon tar upp ämnet varje gång vi träffas.', blankIndex: 2 },
    ],
    verified: true,
    forms: { presens: 'tar upp', preteritum: 'tog upp', supinum: 'tagit upp' },
  },
  {
    id: 'pv:ta-bort',
    cefr: 'A2',
    cefrEvidence: 'svalex',
    baseInfinitive: 'ta',
    particle: 'bort',
    reflexive: 'none',
    lemma: 'ta bort',
    gloss: { en: 'to remove; to delete' },
    transparency: 'literal',
    acceptedParticles: ['bort'],
    examples: [
      { sv: 'Jag tar bort filen från datorn i kväll.', blankIndex: 2 },
      { sv: 'Läkaren tar bort förbandet efter en vecka.', blankIndex: 2 },
      { sv: 'Vi tar bort de gamla möblerna ur rummet.', blankIndex: 2 },
    ],
    verified: true,
    forms: { presens: 'tar bort', preteritum: 'tog bort', supinum: 'tagit bort' },
  },
  {
    id: 'pv:ta-emot',
    cefr: 'A2',
    cefrEvidence: 'svalex',
    baseInfinitive: 'ta',
    particle: 'emot',
    reflexive: 'none',
    lemma: 'ta emot',
    gloss: { en: 'to receive; to accept something offered' },
    transparency: 'literal',
    acceptedParticles: ['emot'],
    examples: [
      { sv: 'Hon tar emot gästerna vid dörren varje kväll.', blankIndex: 2 },
      { sv: 'Företaget tar emot ansökningar fram till fredag.', blankIndex: 2 },
      { sv: 'Vi tar emot paketet på posten i morgon.', blankIndex: 2 },
    ],
    verified: true,
    forms: { presens: 'tar emot', preteritum: 'tog emot', supinum: 'tagit emot' },
  },
  {
    id: 'pv:ta-fram',
    cefr: 'A2',
    cefrEvidence: 'svalex',
    baseInfinitive: 'ta',
    particle: 'fram',
    reflexive: 'none',
    lemma: 'ta fram',
    gloss: { en: 'to get something out and ready to use' },
    transparency: 'literal',
    acceptedParticles: ['fram'],
    examples: [
      { sv: 'Hon tar fram tallrikarna innan middagen börjar.', blankIndex: 2 },
      { sv: 'Han tar fram sin dator och börjar arbeta.', blankIndex: 2 },
      { sv: 'Vi tar fram kartan när vi kör vilse.', blankIndex: 2 },
    ],
    verified: true,
    forms: { presens: 'tar fram', preteritum: 'tog fram', supinum: 'tagit fram' },
  },
  {
    id: 'pv:gora-om',
    cefr: 'A2',
    cefrEvidence: 'svalex',
    baseInfinitive: 'göra',
    particle: 'om',
    reflexive: 'none',
    lemma: 'göra om',
    gloss: { en: 'to do something a second time' },
    transparency: 'idiomatic',
    acceptedParticles: ['om'],
    examples: [
      { sv: 'Han gör om uppgiften eftersom den blev fel.', blankIndex: 2 },
      { sv: 'Vi gör om köket helt nästa sommar.', blankIndex: 2 },
      { sv: 'Hon gör om frisyren varje gång hon går ut.', blankIndex: 2 },
    ],
    verified: true,
    forms: { presens: 'gör om', preteritum: 'gjorde om', supinum: 'gjort om' },
  },
  {
    id: 'pv:ga-over',
    cefr: 'A2',
    cefrEvidence: 'svalex',
    baseInfinitive: 'gå',
    particle: 'över',
    reflexive: 'none',
    lemma: 'gå över',
    gloss: { en: 'to subside; to pass (of pain, rain, a mood)' },
    transparency: 'idiomatic',
    acceptedParticles: ['över'],
    examples: [
      { sv: 'Huvudvärken går över efter en timmes vila.', blankIndex: 2 },
      { sv: 'Regnet går över innan vi ska åka hem.', blankIndex: 2 },
      { sv: 'Förkylningen går över på ungefär en vecka.', blankIndex: 2 },
    ],
    verified: true,
    forms: { presens: 'går över', preteritum: 'gick över', supinum: 'gått över' },
  },
  {
    id: 'pv:skriva-ner',
    cefr: 'A2',
    cefrEvidence: 'svalex',
    baseInfinitive: 'skriva',
    particle: 'ner',
    reflexive: 'none',
    lemma: 'skriva ner',
    gloss: { en: 'to record something in writing' },
    transparency: 'literal',
    // Irreducibly ambiguous, and deliberately so: in these frames "ned" is
    // the formal spelling of the same word and "upp" is an equally standard
    // synonym. Single-answer grading here would mark correct Swedish wrong.
    acceptedParticles: ['ner', 'ned', 'upp'],
    acceptedRecall: ['skriva ner', 'skriva ned', 'skriva upp'],
    examples: [
      { sv: 'Jag skriver ner numret på en liten lapp.', blankIndex: 2 },
      { sv: 'Hon skriver ner alla idéer i sin bok.', blankIndex: 2 },
      { sv: 'Han skriver ner vad läraren säger på lektionen.', blankIndex: 2 },
    ],
    verified: true,
    forms: { presens: 'skriver ner', preteritum: 'skrev ner', supinum: 'skrivit ner' },
  },
  {
    id: 'pv:skriva-ut',
    cefr: 'A2',
    cefrEvidence: 'svalex',
    baseInfinitive: 'skriva',
    particle: 'ut',
    reflexive: 'none',
    lemma: 'skriva ut',
    gloss: { en: 'to produce a paper copy' },
    transparency: 'idiomatic',
    acceptedParticles: ['ut'],
    examples: [
      { sv: 'Han skriver ut dokumentet på kontorets skrivare.', blankIndex: 2 },
      { sv: 'Jag skriver ut biljetterna innan vi åker.', blankIndex: 2 },
      { sv: 'Hon skriver ut rapporten i tre exemplar.', blankIndex: 2 },
    ],
    verified: true,
    forms: { presens: 'skriver ut', preteritum: 'skrev ut', supinum: 'skrivit ut' },
  },
  {
    id: 'pv:tanka-om',
    cefr: 'A2',
    cefrEvidence: 'svalex',
    baseInfinitive: 'tänka',
    particle: 'om',
    reflexive: 'none',
    lemma: 'tänka om',
    gloss: { en: 'to reconsider; to change one’s mind' },
    transparency: 'idiomatic',
    acceptedParticles: ['om'],
    examples: [
      { sv: 'Han tänker om när han hör alla fakta.', blankIndex: 2 },
      { sv: 'Vi tänker om och väljer en annan väg.', blankIndex: 2 },
      { sv: 'Hon tänker om efter samtalet med sin chef.', blankIndex: 2 },
    ],
    verified: true,
    forms: { presens: 'tänker om', preteritum: 'tänkte om', supinum: 'tänkt om' },
  },
  {
    id: 'pv:ha-kvar',
    cefr: 'A2',
    cefrEvidence: 'svalex',
    baseInfinitive: 'ha',
    particle: 'kvar',
    reflexive: 'none',
    lemma: 'ha kvar',
    gloss: { en: 'to still possess something' },
    transparency: 'idiomatic',
    acceptedParticles: ['kvar'],
    examples: [
      { sv: 'Jag har kvar biljetten från konserten förra året.', blankIndex: 2 },
      { sv: 'Hon har kvar sin gamla cykel i garaget.', blankIndex: 2 },
      { sv: 'Vi har kvar lite mat från gårdagens middag.', blankIndex: 2 },
    ],
    verified: true,
    forms: { presens: 'har kvar', preteritum: 'hade kvar', supinum: 'haft kvar' },
  },
  {
    id: 'pv:bli-over',
    cefr: 'A2',
    cefrEvidence: 'svalex',
    baseInfinitive: 'bli',
    particle: 'över',
    reflexive: 'none',
    lemma: 'bli över',
    gloss: { en: 'to remain unused; to be left' },
    transparency: 'idiomatic',
    acceptedParticles: ['över'],
    examples: [
      { sv: 'Det blir över mycket mat efter festen.', blankIndex: 2 },
      { sv: 'Några stolar blir över när alla har satt sig.', blankIndex: 3 },
      { sv: 'Det blir över pengar i budgeten varje månad.', blankIndex: 2 },
    ],
    verified: true,
    forms: { presens: 'blir över', preteritum: 'blev över', supinum: 'blivit över' },
  },

  // ---- B1 ----
  {
    id: 'pv:ga-sonder',
    cefr: 'B1',
    cefrEvidence: 'svalex',
    baseInfinitive: 'gå',
    particle: 'sönder',
    reflexive: 'none',
    lemma: 'gå sönder',
    gloss: { en: 'to break; to stop working' },
    transparency: 'idiomatic',
    acceptedParticles: ['sönder'],
    examples: [
      { sv: 'Min telefon går sönder om jag tappar den.', blankIndex: 3 },
      { sv: 'Glaset går sönder när det faller i golvet.', blankIndex: 2 },
      { sv: 'Cykeln går sönder varje gång han lånar den.', blankIndex: 2 },
    ],
    verified: true,
    forms: { presens: 'går sönder', preteritum: 'gick sönder', supinum: 'gått sönder' },
  },
  {
    id: 'pv:ge-ut',
    cefr: 'B1',
    cefrEvidence: 'svalex',
    baseInfinitive: 'ge',
    particle: 'ut',
    reflexive: 'none',
    lemma: 'ge ut',
    gloss: { en: 'to publish; to issue' },
    transparency: 'idiomatic',
    acceptedParticles: ['ut'],
    examples: [
      { sv: 'Förlaget ger ut tio nya böcker varje år.', blankIndex: 2 },
      { sv: 'Hon ger ut sin första roman i höst.', blankIndex: 2 },
      { sv: 'Banken ger ut nya kort till alla kunder.', blankIndex: 2 },
    ],
    verified: true,
    forms: { presens: 'ger ut', preteritum: 'gav ut', supinum: 'gett ut' },
  },
  {
    id: 'pv:sta-ut',
    cefr: 'B1',
    cefrEvidence: 'svalex',
    baseInfinitive: 'stå',
    particle: 'ut',
    reflexive: 'none',
    lemma: 'stå ut',
    gloss: { en: 'to endure; to tolerate' },
    transparency: 'idiomatic',
    acceptedParticles: ['ut'],
    examples: [
      { sv: 'Jag står inte ut med bullret från gatan.', blankIndex: 3 },
      { sv: 'Hon står ut med kylan tack vare sin jacka.', blankIndex: 2 },
      { sv: 'Vi står ut med situationen tills den blir bättre.', blankIndex: 2 },
    ],
    verified: true,
    forms: { presens: 'står ut', preteritum: 'stod ut', supinum: 'stått ut' },
  },
  {
    id: 'pv:saga-till',
    cefr: 'B1',
    cefrEvidence: 'svalex',
    baseInfinitive: 'säga',
    particle: 'till',
    reflexive: 'none',
    lemma: 'säga till',
    gloss: { en: 'to let someone know; to notify' },
    transparency: 'idiomatic',
    acceptedParticles: ['till'],
    examples: [
      { sv: 'Han säger till när maten är färdig.', blankIndex: 2 },
      { sv: 'Du säger till om du behöver mer hjälp.', blankIndex: 2 },
      { sv: 'Hon säger till chefen att hon kommer sent.', blankIndex: 2 },
    ],
    verified: true,
    forms: { presens: 'säger till', preteritum: 'sa till', supinum: 'sagt till' },
  },
  {
    id: 'pv:tanka-efter',
    cefr: 'B1',
    cefrEvidence: 'svalex',
    baseInfinitive: 'tänka',
    particle: 'efter',
    reflexive: 'none',
    lemma: 'tänka efter',
    gloss: { en: 'to reflect before deciding' },
    transparency: 'idiomatic',
    acceptedParticles: ['efter'],
    examples: [
      { sv: 'Han tänker efter innan han svarar på frågan.', blankIndex: 2 },
      { sv: 'Vi tänker efter en stund och väljer sedan.', blankIndex: 2 },
      { sv: 'Hon tänker efter noga innan hon bestämmer sig.', blankIndex: 2 },
    ],
    verified: true,
    forms: { presens: 'tänker efter', preteritum: 'tänkte efter', supinum: 'tänkt efter' },
  },
  {
    id: 'pv:kanna-till',
    cefr: 'B1',
    cefrEvidence: 'svalex',
    baseInfinitive: 'känna',
    particle: 'till',
    reflexive: 'none',
    lemma: 'känna till',
    gloss: { en: 'to be aware of; to be acquainted with' },
    transparency: 'idiomatic',
    acceptedParticles: ['till'],
    examples: [
      { sv: 'Jag känner till den här delen av staden.', blankIndex: 2 },
      { sv: 'Han känner till reglerna men följer dem inte.', blankIndex: 2 },
      { sv: 'Vi känner till problemet sedan flera år tillbaka.', blankIndex: 2 },
    ],
    verified: true,
    forms: { presens: 'känner till', preteritum: 'kände till', supinum: 'känt till' },
  },
  {
    id: 'pv:ta-slut',
    cefr: 'B1',
    cefrEvidence: 'svalex',
    baseInfinitive: 'ta',
    particle: 'slut',
    reflexive: 'none',
    lemma: 'ta slut',
    gloss: { en: 'to run out; to come to an end' },
    transparency: 'idiomatic',
    acceptedParticles: ['slut'],
    // "bort" excluded in every frame below: "ta bort" is transitive (remove
    // something) and needs a direct object right after it, but each blank
    // here is followed by a conjunction or preposition phrase, not an
    // object, so the substitution leaves "ta bort" with nothing to remove.
    examples: [
      {
        sv: 'Mjölken tar slut innan veckan är över.',
        blankIndex: 2,
        excludedParticles: ['bort'],
      },
      {
        sv: 'Pengarna tar slut i mitten av månaden.',
        blankIndex: 2,
        excludedParticles: ['bort'],
      },
      {
        sv: 'Filmen tar slut efter ungefär två timmar.',
        blankIndex: 2,
        excludedParticles: ['bort'],
      },
    ],
    verified: true,
    forms: { presens: 'tar slut', preteritum: 'tog slut', supinum: 'tagit slut' },
  },
  {
    id: 'pv:borja-om',
    cefr: 'B1',
    cefrEvidence: 'svalex',
    baseInfinitive: 'börja',
    particle: 'om',
    reflexive: 'none',
    lemma: 'börja om',
    gloss: { en: 'to start again from the beginning' },
    transparency: 'idiomatic',
    acceptedParticles: ['om'],
    examples: [
      { sv: 'Hon börjar om när hon gör ett fel.', blankIndex: 2 },
      { sv: 'Vi börjar om spelet eftersom reglerna var fel.', blankIndex: 2 },
      { sv: 'Han börjar om sin utbildning i en annan stad.', blankIndex: 2 },
    ],
    verified: true,
    forms: { presens: 'börjar om', preteritum: 'började om', supinum: 'börjat om' },
  },
  {
    id: 'pv:visa-upp',
    cefr: 'B1',
    cefrEvidence: 'svalex',
    baseInfinitive: 'visa',
    particle: 'upp',
    reflexive: 'none',
    lemma: 'visa upp',
    gloss: { en: 'to present something for inspection' },
    transparency: 'idiomatic',
    acceptedParticles: ['upp'],
    examples: [
      { sv: 'Han visar upp sitt körkort vid ingången.', blankIndex: 2 },
      { sv: 'Hon visar upp biljetten för konduktören på tåget.', blankIndex: 2 },
      { sv: 'Vi visar upp våra bilder för hela familjen.', blankIndex: 2 },
    ],
    verified: true,
    forms: { presens: 'visar upp', preteritum: 'visade upp', supinum: 'visat upp' },
  },
  {
    id: 'pv:vanda-om',
    cefr: 'B1',
    cefrEvidence: 'svalex',
    baseInfinitive: 'vända',
    particle: 'om',
    reflexive: 'none',
    lemma: 'vända om',
    gloss: { en: 'to turn back the way one came' },
    transparency: 'literal',
    acceptedParticles: ['om'],
    examples: [
      { sv: 'Vi vänder om när vägen blir för dålig.', blankIndex: 2 },
      { sv: 'Han vänder om vid bron och åker hem.', blankIndex: 2 },
      { sv: 'De vänder om efter halva sträckan.', blankIndex: 2 },
    ],
    verified: true,
    forms: { presens: 'vänder om', preteritum: 'vände om', supinum: 'vänt om' },
  },
  {
    id: 'pv:ga-igenom',
    cefr: 'B1',
    // No SVALex row for gå + igenom, so the band is an editorial call rather
    // than evidence. The verb itself is not in doubt.
    cefrEvidence: 'judgment',
    baseInfinitive: 'gå',
    particle: 'igenom',
    reflexive: 'none',
    lemma: 'gå igenom',
    gloss: { en: 'to review something item by item' },
    transparency: 'idiomatic',
    acceptedParticles: ['igenom'],
    examples: [
      { sv: 'Läraren går igenom provet med hela klassen.', blankIndex: 2 },
      { sv: 'Vi går igenom listan innan vi åker hem.', blankIndex: 2 },
      { sv: 'Han går igenom sina anteckningar före mötet.', blankIndex: 2 },
    ],
    verified: true,
    forms: { presens: 'går igenom', preteritum: 'gick igenom', supinum: 'gått igenom' },
  },
  {
    id: 'pv:komma-pa',
    cefr: 'B1',
    cefrEvidence: 'judgment',
    baseInfinitive: 'komma',
    particle: 'på',
    reflexive: 'none',
    lemma: 'komma på',
    gloss: { en: 'to think of something; to suddenly realise' },
    transparency: 'idiomatic',
    contrast: 'komma på någon (stress on the verb) — to catch someone in the act',
    acceptedParticles: ['på'],
    examples: [
      { sv: 'Hon kommer på en bra idé under mötet.', blankIndex: 2 },
      { sv: 'Jag kommer på lösningen när jag går hem.', blankIndex: 2 },
      { sv: 'Han kommer på namnet efter en lång stund.', blankIndex: 2 },
    ],
    verified: true,
    forms: { presens: 'kommer på', preteritum: 'kom på', supinum: 'kommit på' },
  },

  // ---- Reflexives: cloze only, no recall item (see the pedagogy note). A
  // recall card would ask for a citation form whose pronoun is wrong in two
  // persons out of three. Each carries at least one non-third-person frame
  // so the learner never sees only "sig".
  {
    id: 'pv:hora-av-sig',
    cefr: 'B1',
    cefrEvidence: 'judgment',
    baseInfinitive: 'höra',
    particle: 'av',
    reflexive: 'afterParticle',
    lemma: 'höra av {refl}',
    gloss: { en: 'to get in touch; to make contact' },
    transparency: 'idiomatic',
    acceptedParticles: ['av'],
    examples: [
      { sv: 'Jag hör av mig så fort jag landar.', blankIndex: 2 },
      { sv: 'Du hör av dig när du kommer fram.', blankIndex: 2 },
      { sv: 'Hon hör av sig varje söndag till sin mamma.', blankIndex: 2 },
    ],
    verified: true,
    forms: { presens: 'hör av sig', preteritum: 'hörde av sig', supinum: 'hört av sig' },
  },
  {
    id: 'pv:ge-sig-av',
    cefr: 'B1',
    cefrEvidence: 'judgment',
    baseInfinitive: 'ge',
    particle: 'av',
    reflexive: 'beforeParticle',
    lemma: 'ge {refl} av',
    gloss: { en: 'to depart; to leave on a journey' },
    transparency: 'idiomatic',
    acceptedParticles: ['av'],
    examples: [
      { sv: 'Vi ger oss av tidigt på morgonen i morgon.', blankIndex: 3 },
      { sv: 'Jag ger mig av innan solen går upp.', blankIndex: 3 },
      { sv: 'De ger sig av mot fjällen på fredag.', blankIndex: 3 },
    ],
    verified: true,
    forms: { presens: 'ger sig av', preteritum: 'gav sig av', supinum: 'gett sig av' },
  },

  // ---- Base verbs added to VERB_DATA in #262 ----
  // These six were drafted with verified:false while their base verb (stänga,
  // sätta, stiga, hälsa, bygga, ställa) was missing from VERB_DATA. The base
  // verbs are now appended (append-only, order pin preserved) and each entry
  // below has a second frame and verified:true accordingly.
  {
    id: 'pv:stanga-av',
    cefr: 'A2',
    cefrEvidence: 'judgment',
    baseInfinitive: 'stänga',
    particle: 'av',
    reflexive: 'none',
    lemma: 'stänga av',
    gloss: { en: 'to power down a device' },
    transparency: 'literal',
    acceptedParticles: ['av'],
    examples: [
      { sv: 'Han stänger av datorn innan han går hem.', blankIndex: 2 },
      { sv: 'Jag stänger av mobilen efter klockan tio.', blankIndex: 2 },
    ],
    verified: true,
    forms: { presens: 'stänger av', preteritum: 'stängde av', supinum: 'stängt av' },
  },
  {
    id: 'pv:satta-pa',
    cefr: 'A2',
    cefrEvidence: 'judgment',
    baseInfinitive: 'sätta',
    particle: 'på',
    reflexive: 'none',
    lemma: 'sätta på',
    gloss: { en: 'to start a device running' },
    transparency: 'literal',
    acceptedParticles: ['på'],
    examples: [
      { sv: 'Hon sätter på radion när hon lagar mat.', blankIndex: 2 },
      { sv: 'Han sätter på kaffebryggaren varje morgon.', blankIndex: 2 },
    ],
    verified: true,
    forms: { presens: 'sätter på', preteritum: 'satte på', supinum: 'satt på' },
  },
  {
    id: 'pv:stiga-upp',
    cefr: 'A2',
    cefrEvidence: 'judgment',
    baseInfinitive: 'stiga',
    particle: 'upp',
    reflexive: 'none',
    lemma: 'stiga upp',
    gloss: { en: 'to get out of bed' },
    transparency: 'idiomatic',
    acceptedParticles: ['upp'],
    examples: [
      { sv: 'Jag stiger upp klockan sex varje vardag.', blankIndex: 2 },
      { sv: 'Vi stiger upp tidigt på lördagar.', blankIndex: 2 },
    ],
    verified: true,
    forms: { presens: 'stiger upp', preteritum: 'steg upp', supinum: 'stigit upp' },
  },
  {
    id: 'pv:halsa-pa',
    cefr: 'A2',
    cefrEvidence: 'judgment',
    baseInfinitive: 'hälsa',
    particle: 'på',
    reflexive: 'none',
    lemma: 'hälsa på',
    gloss: { en: 'to pay someone a visit' },
    transparency: 'idiomatic',
    // The textbook stress pair, and the reason audio stays off for particle
    // items: browser TTS cannot be trusted to place the stress that carries
    // the whole distinction.
    contrast: 'hälsa på någon (stress on hälsa) — to greet someone',
    acceptedParticles: ['på'],
    examples: [
      { sv: 'Vi hälsar på mormor varje söndag eftermiddag.', blankIndex: 2 },
      { sv: 'Jag hälsar på farmor efter skolan idag.', blankIndex: 2 },
    ],
    verified: true,
    forms: { presens: 'hälsar på', preteritum: 'hälsade på', supinum: 'hälsat på' },
  },
  {
    id: 'pv:bygga-ut',
    cefr: 'B1',
    cefrEvidence: 'judgment',
    baseInfinitive: 'bygga',
    particle: 'ut',
    reflexive: 'none',
    lemma: 'bygga ut',
    gloss: { en: 'to extend or enlarge a structure' },
    transparency: 'literal',
    acceptedParticles: ['ut'],
    examples: [
      { sv: 'Kommunen bygger ut skolan under nästa år.', blankIndex: 2 },
      { sv: 'De bygger ut huset i sommar.', blankIndex: 2 },
    ],
    verified: true,
    forms: { presens: 'bygger ut', preteritum: 'byggde ut', supinum: 'byggt ut' },
  },
  {
    id: 'pv:stalla-in',
    cefr: 'B1',
    cefrEvidence: 'judgment',
    baseInfinitive: 'ställa',
    particle: 'in',
    reflexive: 'none',
    lemma: 'ställa in',
    gloss: { en: 'to cancel a planned event' },
    transparency: 'idiomatic',
    acceptedParticles: ['in'],
    examples: [
      { sv: 'De ställer in mötet på grund av vädret.', blankIndex: 2 },
      { sv: 'Vi ställer in resan på grund av snön.', blankIndex: 2 },
    ],
    verified: true,
    forms: { presens: 'ställer in', preteritum: 'ställde in', supinum: 'ställt in' },
  },
];
