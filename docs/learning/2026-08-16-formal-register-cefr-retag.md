# Formal-register verbs: when register overrides frequency in a CEFR tag

**Question (#373 / ORD-41):** `verbData.test.ts:709-721` pins `anse` and
`finna` to CEFR `A1` and reserves any re-tag for a learning-designer policy
that did not exist. `swedish-linguist` flagged both during #284 verification:
they are formal register, not everyday beginner vocabulary. When does
register override corpus frequency for a CEFR tag, what happens to `anse`
and `finna` specifically, and what does a re-tag change for a learner?

## Decision

**Re-tag `anse` A1 → B1 and `finna` A1 → B1**, in both `VERB_DATA`
(`src/data/verbData.ts`) and the promotion queue
(`docs/verb-data/candidates.csv`). Only the `cefr` field moves; forms,
`grupp`, notes and the open `NEEDS HUMAN CHECK` flag on `anse`'s imperativ
are untouched. The two-condition test and the destination ladder below are
the standing policy for every future register re-tag — including the broader
passes ORD-11 and ORD-67 ask for.

| Parameter                  | Value                                                                 |
| -------------------------- | --------------------------------------------------------------------- |
| `anse`                     | A1 → **B1** (formal "consider/deem"; everyday counterpart `tycka` A1) |
| `finna`                    | A1 → **B1** (formal "find"; everyday counterpart `hitta` A1)          |
| files that change          | `src/data/verbData.ts`, `docs/verb-data/candidates.csv`, test pins    |
| localStorage migration     | **none** — no stored field carries a CEFR level                       |
| storage version bump       | **none** — `STORAGE_VERSION` stays 3                                  |
| learner on default levels  | no visible change (all six levels selected by default)                |
| learner scoped to A1/A2    | 7 scheduled items leave the pool; schedules kept, resume on B1        |
| destination levels allowed | B1, B2, C1 only — never A2, never back to A1                          |

## The policy: two conditions, then a ladder

The A1 tag in the queue is "the first frequency bucket", not a measured
learner level (the same defect issue #42 named, and ORD-11 names for ~300
rows). Corpus frequency counts written text; written Swedish leans formal,
so formal verbs float to the top of a frequency list without ever being
beginner vocabulary. Register overrides the frequency-derived tag when
**both** conditions hold:

- **R1 — register mark.** `swedish-linguist` judges the verb's dominant
  sense formal, literary or specialized against SO/SAOL usage marks. This is
  a linguistic call, made with evidence, never guessed by an engineer. For
  `anse` and `finna` it was already made during #284.
- **R2 — named counterpart.** A neutral-register verb covering the same core
  meaning already holds the lower tag in `VERB_DATA`, so deferring the
  formal verb costs the beginner no expressive coverage. The counterpart
  must be named in the re-tag comment (`tycka` for `anse`, `hitta` for
  `finna`).

If R1 holds but R2 fails, the tag **stays** at its frequency level and the
gap is reported to the lead: dropping the only verb for a core meaning out
of the beginner pool trades a register wrinkle for a coverage hole, which is
the worse deal. The right fix in that case is adding the neutral
counterpart, then re-tagging.

When both hold, the destination comes from one question — where does a
learner actually need this verb first?

- **B1** — the verb is core to ordinary written prose (news, notices,
  narrative): the learner meets it receptively in the first authentic texts
  B1 reading demands. Evidence: a top-tier position in the frequency queue
  despite the formal mark.
- **B2** — formal or specialized outside core prose; needed for nuance and
  register control, not for reading the newspaper. This is the `unna`/`kapa`
  precedent from #42.
- **C1** — literary, archaic or grammatically restricted (non-human
  subjects, fixed frames). The `te sig` precedent.

In doubt between two lanes, take the lower one. The cost of too-late is a
receptive gap exactly where the learner starts reading real Swedish; the
cost of too-early is the thing R2 already paid for.

## Ruling for anse and finna

**`anse` → B1.** Formal stative "to consider/deem". The everyday verb for
holding an opinion, `tycka`, is in the table at A1 (`verbData.ts:91`), so R2
holds. `anse` sits at position 41 of the ~1537-row frequency queue: it is
core written prose — `anses vara` is in every newspaper — so it takes the
B1 lane, not B2. A learner who reaches B1 reading meets it immediately;
a beginner drilling `anser/ansåg/ansett` before knowing `tycka` well is
practising register they cannot yet place.

**`finna` → B1.** Formal counterpart of `hitta` (A1, `verbData.ts:160`), so
R2 holds. Position 11 in the queue — among the most frequent verbs in
written Swedish — which is precisely the frequency-vs-register trap: the
count is inflated by formal prose and fixed phrases, while spoken beginner
Swedish uses `hitta`. Core-prose frequency puts it in the B1 lane.

**Why not B2, like `unna` and `kapa`?** Those two fail the core-prose test:
`unna` lives in one idiomatic frame (`unna sig`) and `kapa` is specialized
("hijack"). A B1 reader can go months without either; the same reader meets
`anse` and `finna` in week one. The ladder keeps all four rulings consistent
instead of pooling everything formal at B2.

**What this ruling does not touch.** The `NEEDS HUMAN CHECK` on `anse`'s
empty imperativ (`verbData.ts:112`) stays open — a level tag cannot resolve
an attestation question. All forms and `grupp` values stay exactly as they
are; wrong Swedish is worse than missing Swedish, and nothing here is a
form change.

## Migration: what a re-tag changes for a learner

**No stored data changes.** The CEFR level lives only in `verbData.ts` and
`candidates.csv`. SRS progress is keyed by infinitive + form (issue #53) and
carries no level field; settings store no per-verb data. No migration, no
`STORAGE_VERSION` bump, no staff-engineer storage review is needed.

**Default settings: nothing visible.** `cefrLevels` defaults to all six
levels (`useSettings.ts:38`), and conjugation mode has no introduction
ordering yet (ORD-6 is open — the whole deck is due on day one). For a
default-settings learner the pool before and after the re-tag is identical.
The first-exposure effect exists only where the tag is actually load-bearing:
the learner who scoped themselves down.

**A learner scoped to A1 (or A1+A2):** `anse` (3 items — presens,
preteritum, supinum; the imperativ is empty and is never an item) and
`finna` (4 items) leave both the due queue and the free-practice pool: 7
items out of the ~1000 the 253 A1 verbs generate. Their stored schedules are
untouched under their keys and resume the moment B1 is selected.

**Accepted cost, named:** conjugation-side `cefrLevels` filters _reviews_ as
well as new items (`createConjugationProvider.listAvailableItems`,
`src/lib/srsProviders.ts:65-70`), so an A1-scoped learner with in-flight
`anse`/`finna` reviews loses them mid-schedule. We accept this rather than
special-casing "met items stay servable": it is 7 items behind an explicit
learner choice, the state survives intact, and the particle-mode rule
(#350: level-filter introductions, never due reviews) stays a deliberate
per-mode difference, not a precedent this re-tag has to import for two
verbs. If the broader ORD-11 pass ever moves hundreds of practised items at
once, that decision must revisit this paragraph first.

## What implementers change

One PR, `swedish-linguist` + `qa`.

**`swedish-linguist`** — `src/data/verbData.ts`: `cefr: "A1"` → `"B1"` on
the `anse` (line ~112) and `finna` (line ~73) rows, each with a re-tag
comment in the #42 style naming the counterpart
(`// re-tagged #373: formal register, everyday counterpart tycka/hitta`).
`docs/verb-data/candidates.csv`: same two rows (lines 41 and 11), `A1` →
`B1`. Nothing else on any row moves.

**`qa`** — `src/data/verbData.test.ts`:

- Extend the #42 `it.each` pins (both the `VERB_DATA` block at ~641 and the
  CSV-queue block at ~677) with `['anse', 'B1', ...]` and
  `['finna', 'B1', ...]`, forms and grupp asserted unchanged.
- Rewrite the pin at lines 709-721: the expected non-A1 set becomes
  `['anse', 'finna', 'kapa', 'te sig', 'unna']`, and the comment now cites
  this doc instead of "a policy that does not exist yet".

## How we would know this was wrong

- A graded-lexicon check (Kelly, SVALex) by `swedish-linguist` places either
  verb at A2 or at B2. The linguist's evidence wins over my lane assignment;
  move the tag and the pins, not the policy.
- An A1/A2-scoped learner path turns out to need `anse` or `finna`
  productively before B1 — which, given `tycka` and `hitta`, would mean R2
  was assessed wrongly, and the fix is reverting that verb, not the ladder.
- The ORD-11 pass finds many R1 verbs with no R2 counterpart. Then the
  "report the gap, add the counterpart first" branch becomes the bottleneck
  and needs its own intake ticket rather than case-by-case reports.

## Where the evidence is thin

The register judgments (R1) are `swedish-linguist`'s #284 calls, taken as
given here, not re-derived. The B1-vs-B2 lane assignment rests on the
core-prose criterion plus queue positions 11 and 41 as frequency evidence;
no external graded lexicon was consulted in this session. The direction —
formal register defers a verb past the beginner levels when a counterpart
exists — is standard frequency-first vocabulary sequencing (Nation) applied
with a register correction; the specific lane is my judgment and is cheap
to move (two fields, four pins) if linguist evidence disagrees by one level.

## Routed to

- `swedish-linguist` + `qa` — the implementation PR above (follow-up ticket
  filed; lead mirrors it to Linear per CLAUDE.md).
- lead — ORD-11 and ORD-67 should execute against this doc's criteria and
  ladder; neither needs a new policy note.
- `product-manager` — nothing: `cefrLevels` semantics are unchanged.
- `srs-engine` — nothing: no scheduler or storage change.
