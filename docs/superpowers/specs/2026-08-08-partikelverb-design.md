# Partikelverb practice mode — design spec

Date: 2026-08-08
Status: draft, awaiting human review
Sources: research reports from product-manager, swedish-linguist, learning-designer,
srs-engine, staff-engineer (2026-08-08), plus human decisions recorded below.
Companion docs: `docs/product/2026-08-08-particle-verbs-research.md`,
`docs/learning/particle-verb-practice.md`.

## Human decisions (settled, not up for re-litigation)

1. Separate practice mode — own queue, own due count. Not mixed into the
   conjugation queue.
2. Exercise formats: cloze with the particle blanked, plus meaning-to-phrase
   recall. Both typed. No multiple choice in v1.
3. Lexical-unit-first: no conjugation practice of particle verbs in v1. All
   exercise frames are presens; feedback screen may show other forms as a
   static, never-tested reference line.
4. Particle verbs are built **first**, before CSV extraction/cleanup work.
5. Corpus size v1: **~40 verbs** (linguist's 33-item starter list plus additions).
6. Reflexive particle verbs (höra av sig, ge sig av) **are in v1**, cloze-only.
7. Particle mode gets its **own independent daily goal** (additional study time),
   not a slice of the existing `dailyGoal`. Learning-designer's revised
   arithmetic (below, and in `docs/learning/particle-verb-practice.md`) is
   normative.

## Why this feature (one paragraph)

Particle verbs are high-frequency, meaning-bearing Swedish that the app
currently covers not at all — zero entries in both `verbData.ts` and the CSV.
Their difficulty is lexical (which particle, what the pair means), not
inflectional: the particle never inflects, so conjugation drills teach nothing.
Recognition runs far ahead of production for multi-word verbs (Dagut & Laufer
1985; Liao & Fukuya 2004), so the mode drills typed production. Example
sentences are the vehicle because for a particle verb, grammatical function
(word order, reflexive agreement) _is_ the content (Webb 2007).

## Item model

Each particle verb yields up to two independently scheduled SRS items:

- `pv:<slug>:cloze` — sentence with the particle blanked, gloss shown.
  `Han vill bygga ___ ett företag.` ("to establish") → `upp`
- `pv:<slug>:recall` — gloss prompt, learner types the whole phrase.
  "to establish, to found" → `bygga upp`

Rules:

- Recall unlocks only when the sibling cloze reaches `repetitions >= 2`.
- Reflexive verbs get **cloze only** in v1 — a recall card would teach a
  citation form (`höra av sig`) that is ungrammatical in 1st/2nd person.
- The two items of one verb never appear in the same sitting (cloze feedback
  reveals the recall answer).
- A verb is eligible for introduction only when its base verb has
  `repetitions >= 2` on presens and preteritum in the conjugation store.
- Never introduce two particle verbs sharing a base verb within the same week
  (semantic-set interference: bygga upp / bygga ut).
- Introduction card (unscheduled, untested) appears at the top of the sitting;
  the verb's first cloze appears at the end of the same sitting, at least six
  items later, not counted toward the goal.

40 verbs ≈ up to 80 scheduled items (fewer: reflexives contribute one each).

## Data model (owner: swedish-linguist)

New module `src/data/particleVerbData.ts` — **not** rows in `VERB_DATA`
(different shape; appending would also renumber index-derived ids). If a source
data file is wanted, it is JSON (`public/data/particle_verbs.json`), not CSV —
example sentences contain commas.

```ts
export interface ParticleVerbData {
  id: string; // "pv:hora-av-sig" — ASCII-folded slug, stable, never positional
  cefr: 'A1' | 'A2' | 'B1' | 'B2' | 'C1';
  baseInfinitive: string; // "höra" — MUST resolve in VERB_DATA (eligibility gate joins on it in v1)
  particle: string; // "av" — the cloze answer
  reflexive: 'none' | 'beforeParticle' | 'afterParticle';
  lemma: string; // "höra av {refl}" — placeholder, never literal "sig"
  gloss: { en: string; sv?: string };
  transparency: 'literal' | 'idiomatic';
  contrast?: string; // prepositional twin, e.g. "hälsa på (greet)"
  acceptedParticles: string[]; // cloze accepted answers; [0] primary
  acceptedRecall?: string[]; // recall accepted answers where the gloss is irreducibly ambiguous; [0] primary
  examples: Array<{ sv: string; blankIndex?: number; en?: string }>;
  verified: boolean; // human-checked against SO/SAOL; false = never shipped to learners
}
```

Key constraints:

- **Ids are ASCII-folded** (`pv:hora-av-sig`, not `pv:höra-av-sig`): ids live in
  localStorage keys and a NFC/NFD normalization mismatch would silently orphan
  progress. Display strings keep diacritics.
- **Ids are append-only.** A lemma rename is an id change and requires a
  migration entry. Written contract with srs-engine.
- Reflexive pronoun is a template slot with a `renderReflexive(person)` helper
  (mig/dig/sig/oss/er/sig; imperative dig/er). Never literal `sig` in rendered
  output for non-3rd-person frames.
- Cloze sentences are authored to force a unique particle where possible; where
  ambiguity is irreducible (`skriva upp/ner numret`), `acceptedParticles` holds
  every correct answer, per `docs/product/2026-08-08-alternate-answers-decision.md`.
  Single-answer grading of ambiguous cloze is a correctness violation.
- Glosses must be narrow enough to select one phrase for recall, or the recall
  item carries `acceptedRecall`.
- Every `baseInfinitive` MUST resolve to a VERB_DATA verb — enforced by a
  build-time/test assertion, so a miss is a data defect, not a silently
  unsatisfiable eligibility gate (dead content).
- **CEFR bands come from SVALex** (CEFRLex project, UCLouvain/Språkbanken —
  graded lexicon derived from 12 CEFR-graded Swedish coursebooks incl.
  Rivstart; 429 verb+particle combinations, A1: 25 / A2: 70 / B1: 122 /
  B2: 143 / C1: 69). Human decision 2026-08-08: use it. The linguist
  adjudicates: (a) the 111 entries whose particle form is also a preposition
  (tycka om is a particle verb, bero på is not — discriminator is stress, per
  SO/SAOL), (b) the sparse C1 tail (some levels rest on a single coursebook
  hit). "First nonzero level" is our derivation from SVALex's frequency
  distributions, not the resource's own claim — record it as method.
  **License: CC BY-NC-SA 4.0** — attribution + license notice ship in the
  repo; derived grading data carries the same license; app must stay
  non-commercial or the data gets rewritten. SweLLex (learner-production
  counterpart) is the cross-check. Extraction draft:
  `docs/research/svalex/partikelverb_cefr_draft.csv`. The UI must not imply
  an official CEFR standard.
- Excluded from the dataset: inseparable prefixed compounds (påminna,
  avbryta), plain verb+preposition (titta på TV). Uncertain classifications
  (ta reda på, komma överens, sätta igång spelling) stay out until confirmed.

## SRS integration (owner: srs-engine)

- The `pv:` namespace is disjoint from legacy `<digits>-<form>` keys, so adding
  particle items is **additive**: no existing key is renamed, no storage
  version bump is required for the feature itself. Staff-engineer confirms
  `parseStoredProgress` preserves unknown keys. (The v3 stable-id migration for
  conjugation items remains a separate, urgent, parallel task — see
  "Independent tickets".)
- One shared store, per-type logical queues derived from the id prefix.
  Scheduler (`calculateNextReview`) is item-agnostic and needs zero changes.
- `useSrsProgress` is generalized from "the verb-conjugation hook" to
  SRS store + pluggable item providers (a provider enumerates items, builds
  ids, and reports due/available). Conjugation and particle modes are two
  providers.
- **Lazy initialization** for particle items: state is created on first
  presentation, not eagerly for the whole dataset (the current eager pattern
  would make all ~80 items due on release day).
- New-cards-per-day cap and interleave policy come from the learning-designer
  note: introductions first, reviews most-overdue-first shuffled, first cloze
  of new verbs at sitting end; recall unlocks take priority over new-verb
  introductions inside the daily new-card allowance; capacity gate at four
  reviews per new card. Rebased formulas (learning-designer, final):
  `particleNewCardsPerDay = clamp(1, 10, round(particleDailyGoal / 4))` — 3/day
  at the default 12; `particleNewAllowedToday = clamp(0, particleNewCardsPerDay,
floor((particleDailyGoal - min(particleReviewsDue, particleDailyGoal)) / 4))`.
- **Streak constraint (binding on the future streak implementation — no streak
  code exists yet, per `docs/learning/streak-mechanics.md`)**: a day counts
  when `answeredToday >= dailyGoal`, with particle cards counting toward
  `answeredToday`. `particleDailyGoal` never appears in the streak
  calculation — it paces the particle queue only. Adding the mode can never
  make the streak harder to keep.
- Empty particle queue routes to non-recording free practice, not a dead end
  (~70 cards are all live after ~24 days at defaults; 40 verbs is a starter
  set, not the end state).
- Grading: binary typed correctness maps to the existing Grade 0|5. The
  `recordAnswer` signature gains `modality: 'typed' | 'choice'` (bundled with
  the hint change from `docs/learning/lapse-handling.md`). In v1 the parameter
  is **plumb-and-ignore**: recorded, never branched on — the weaker-credit
  path (ease unchanged, interval multiplier capped at 1.6, wrong = full lapse)
  is specified here for the future but ships no code, so "scheduler needs zero
  changes" stays literally true. Typed-answer normalization (case, whitespace,
  optional leading "att") follows
  `docs/product/2026-08-08-alternate-answers-decision.md`.

## UI surface (owner: frontend-expert)

- Home: particle mode entry point with its own due count, alongside the
  existing practice entry. Mixed-queue dueCount semantics unchanged.
- Route: `/practice-particles` (or mode param) — one-route change in App.tsx,
  staff-engineer owns the route wiring.
- New `ParticleVerbCard` component; `PracticeCard` is not modified
  (conjugation-specific, no branching added).
- Card typography: the particle is visually marked (bold) in feedback/citation
  forms; a one-line particle meaning hint appears on the feedback screen
  ("upp — often completion or making visible"; ~15 strings).
- Feedback screen shows the four conjugated forms of the phrase as a static
  reference line — exposure only, never tested in v1.
- **Audio off by default for particle items**: Web Speech cannot be trusted to
  place particle stress (hälsa PÅ visit vs hälsa på greet); wrong prosody
  teaches wrong Swedish. May be enabled after linguist signs off on actual TTS
  output; sentences (not bare phrases) are what get spoken if enabled.
- Progress page gains a per-mode view (it currently hard-codes the four
  conjugation forms and the verb table).
- Settings: independent `particleDailyGoal`, default 12 cards, range 4–60,
  stored independently of `dailyGoal` and never derived from it; settings store
  gains a version field. (Planning constant: ~3 particle cards/minute.)
- Particle cards always show their sentence — the sentence is the card; the
  `showExamples` setting does not apply to them (deliberate, documented here).
- **In-app SVALex attribution line** (Settings or about surface, ~3 lines):
  CC BY-NC-SA requires attribution reasonable to the medium, and app users
  never see the repo. Ships with F5.

## Build order

Prerequisites (can overlap, all before feature merge):

- P1b. **VERB_DATA order pin test**: qa-owned test asserting the literal
  current index→infinitive mapping for all rows, so any reorder/insert fails
  CI instead of silently rebinding every user's SRS keys. Lands before any
  feature code. The snapshot table doubles as prework for the v3 migration
  ticket. (qa)
- P2. Extract a single shared itemId helper; kill the three-way duplication.
  Helper lands in an srs-engine-owned lib file (srs-engine); call-site edits
  in `Progress.tsx` and `VerbDetailsModal.tsx` are frontend-expert's, done
  jointly.
- P3. Version the settings store. (frontend-expert, staff review)
- P4. Generalize `useSrsProgress` to item providers with behavior identical
  for conjugation; qa green before any particle code lands on top. While in
  the hook, add the forward-compat guard: refuse to persist over a store whose
  version is greater than known (today a v3 envelope would be silently
  rewritten as v2). (srs-engine)

Feature:

- F1. Learning-designer revised goal/streak note — DONE
  (`docs/learning/particle-verb-practice.md`).
- F2. Linguist data module: ~40 entries selected from the SVALex extraction
  (A1/A2 core first), particle-vs-preposition adjudication for ambiguous
  forms, verified against SO/SAOL, cloze sentences authored for uniqueness,
  accepted-answer sets where irreducible. SVALex attribution + CC BY-NC-SA
  notice added to the repo. Ship in `verified: true` batches; unverified
  entries never render.
- F3. Particle item provider + lazy init + caps wiring. (srs-engine)
- F4. ParticleVerbCard + route + Home entry. (frontend-expert, staff-engineer)
- F5. Progress/Settings surfaces. (frontend-expert)
- F6. qa: provider tests, reflexive renderer tests, accepted-answer grading
  tests, export/import round-trip with mixed legacy + `pv:` keys, e2e of the
  mode, and a **dataset-integrity test**: ids unique across
  `particleVerbData`, `acceptedParticles[0] === particle`, every
  `baseInfinitive` resolves in VERB_DATA, `verified: false` entries never
  enumerated by the provider.

Refuse-to-merge list (staff-engineer, adopted):

- No feature merge before the P1b pin test is green in CI.
- No feature merge without the export/import mixed-key round-trip test.
- No feature merge without the F6 dataset-integrity test (this is what makes
  the append-only id contract and the verified-gate enforceable).
- No example sentence ships without linguist verification (`verified: true`).
- No second copy of an id scheme in a page component.
- No storage-shape change without staff review; any future v3 migration also
  needs the human's approval per standing rule.

## Independent tickets (not part of this feature, discovered during research)

1. **Stable-id migration (v2 → v3)** for conjugation items: index-derived ids
   silently rebind progress on any VERB_DATA reorder/insert. Freeze the current
   index→infinitive mapping as a literal snapshot table in the migration;
   quarantine unmappable keys in an `orphans` field; make the parser refuse to
   overwrite stores with version > known. Urgent regardless of this feature;
   VERB_DATA order is frozen until it ships. (srs-engine + staff review +
   human approval)
2. **CSV corruption**: 3 corrupt rows (svara/sova/äta), 13 confirmed grupp-2/4
   verbs mechanically conjugated as grupp 1, CEFR column derived from
   news-corpus frequency (unusable), 1531/1538 empty imperativ. Full audit is
   lexicon work, not a script. (swedish-linguist)
3. **Example-sentence stub**: `getExampleSentence` covers 3 verbs and falls
   through to the literal string `[Example with presens]`; invisible only
   because `showExamples` defaults off. (swedish-linguist + frontend-expert)
4. CLAUDE.md known-issues note is stale: the SRS store is versioned (v2
   envelope) as of `useSrsProgress.ts` STORAGE_VERSION = 2.

## Risks

| Risk                                                            | Guard                                                                               |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Ambiguous cloze marks correct Swedish wrong                     | acceptedParticles list; authoring constraint; qa grading tests                      |
| Reflexive citation form teaches wrong 1st/2nd person            | reflexives cloze-only; template rendering                                           |
| TTS teaches wrong particle stress                               | audio off by default; linguist sign-off gate                                        |
| Release-day due flood                                           | lazy init + daily new-card cap                                                      |
| pv id instability (lemma rename)                                | append-only id contract; rename = migration                                         |
| Sentence memorisation (learner learns the string, not the verb) | single sentence in v1 accepted; recall item hedges; revisit rotating contexts in v2 |
| Content bottleneck (verification capacity)                      | ship in verified batches; `verified: false` never renders                           |
| Unicode-normalization key mismatch                              | ASCII-folded ids                                                                    |

## Open items

- ~~Web research: authoritative CEFR-graded partikelverb list~~ — RESOLVED:
  SVALex found and adopted (see Data model). Kelly-listan confirmed useless
  for combinations (0 particle verbs); no Swedish RLD exists; Skolverket/sfi
  publish no inventories.
- Learning-designer: define the short-sitting fallback for the "first cloze at
  least six items later" rule — unsatisfiable at `particleDailyGoal = 4`
  (settings floor). One line in the learning note.
- Adoption signal to watch post-launch: if `particleDailyGoal` is met on fewer
  than half the days `dailyGoal` is, drop the default from 12 to 8 before
  concluding the mode failed.
- Linguist verification pass over the starter list (every CEFR digit is
  currently judgment, several classifications flagged UNCERTAIN).
- Whether the particle-vs-compound contrast (bryta av / avbryta) is disclosed
  on cards: deferred to linguist + learning-designer during F2.
