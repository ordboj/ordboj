# Native check on the three unverified batch-1 particle entries

**Question (#358):** Three batch-1 entries in `src/data/particleVerbData.ts`
carry `verified: false` pending a native-grade check: `pv:komma-for`,
`pv:komma-till`, `pv:vara-till`. Each must be flipped to `verified: true`
with a confirmed frame, re-glossed to a corrected meaning, or removed with
the reason recorded. No entry ships on a guess.

## Decision

**Remove `pv:komma-for`. Remove `pv:vara-till`. Re-gloss `pv:komma-till` to
"to come into existence" and flip it to `verified: true` with the frames
below.** All three entries are `verified: false` today, so none has ever
reached a learner: `getVerifiedParticleVerbs()` is the single shipping gate
(`src/lib/particleVerbs.ts:52`), SRS progress is only created for practised
items, and therefore no stored id references either removed entry. Deletion
needs no migration.

| Entry           | Ruling                    | Verified count effect |
| --------------- | ------------------------- | --------------------- |
| `pv:komma-for`  | remove                    | none (was unverified) |
| `pv:komma-till` | re-gloss, verify, B1 kept | +1 verified B1        |
| `pv:vara-till`  | remove                    | none (was unverified) |

The +1 verified B1 is safe under the CEFR floor decision: the floor counts
A1+A2 only and B1 growth is uncapped
([[2026-08-09-particle-cefr-majority-decision]]).

## `pv:komma-for` — remove

SO records the particle reading only inside the impersonal frame _det kom
för mig (att ...)_ = "it suddenly occurred to me", and marks the register as
dated and literary. Modern everyday Swedish says _jag kom att tänka på_ or
_det slog mig_. Three facts each independently disqualify the entry:

1. **One fixed frame.** The reading does not exist outside _det kommer för
   mig_. A cloze card built on a single frozen frame teaches the chunk, not
   the particle system, and the dataset test rightly requires two frames for
   every verified entry (`particleVerbData.test.ts:157`). A second frame
   cannot be written without inventing Swedish.
2. **The A1 band is a corpus artifact.** SVALex matches surface bigrams, and
   _kommer för_ appears constantly in A1 text as _kommer för att_ + purpose
   clause — unstressed preposition, different construction. The research
   list's own audit table flags exactly this
   (`docs/research/partikelverb/partikelverb-list.md:1685`).
3. **The collision is worse than the payoff.** The unstressed twin (_han
   kommer för pengarna_) is common; the stressed idiom is rare. Teaching a
   rare literary idiom whose surface form collides with a frequent everyday
   string is negative value for a learner below C1.

Delete the entry object from `PARTICLE_VERB_DATA`. Record the exclusion in
the file's header note on deliberate exclusions (lines 18–22), with the
reason "fixed literary idiom, single frame, SVALex band is a bigram
artifact". The id `pv:komma-for` is retired and must not be reused for a
future re-authoring; a revival gets a fresh authoring pass against SO.

## `pv:vara-till` — remove

This is not a particle verb. The everyday uses — _vara till nytta_, _vara
till hjälp_, _vara till besvär_, _vara till salu_ — are the verb _vara_
plus an unstressed prepositional phrase (_till_ + noun). The entry's own
sole example proves the point: in _"Kartan är till stor hjälp under
vandringen"_ the blanked _till_ is a preposition governing _stor hjälp_.
Blanking it tests preposition choice inside a fixed PP, which is a different
skill and a different exercise. The bare existential _vara till_ = "to
exist" (_allt som är till_) does carry particle stress but is archaic and
solemn; living Swedish says _finnas_ or _finnas till_. The dataset header
already excludes "plain verb + preposition" as a class; this entry belongs
to that class.

Delete the entry object. Record the exclusion in the same header note with
the reason "verb + prepositional phrase, not a particle verb; the bare
existential reading is archaic". Two research-list rows stay out of scope
and are not revived by this removal: _vara till för_ (v+p+prep, row 663)
and _vara till sig_ (reflexive, row 664) are separate constructions and get
their own authoring pass if they are ever taken in rank order.

## `pv:komma-till` — re-gloss and verify

The drafted gloss "to be added" is the marginal reading, and the drafted
example _"Det kommer till fler deltagare under veckan"_ is stilted; a
native writes _det tillkommer fler deltagare_. But the stressed particle
verb is real and SO-solid in its other sense: **_komma till_ = "bli till,
uppstå" — to come into existence, to be created** (_hur kom universum
till?_, _ordet kom till på 1800-talet_). That sense is common, neutral in
register, and cleanly separable from the unstressed directional _komma till
Stockholm_, because the existential reading takes no place complement. The
entry is corrected as follows; every field not listed keeps its current
value.

| Field          | New value                                                                                       |
| -------------- | ----------------------------------------------------------------------------------------------- |
| `gloss.en`     | `'to come into existence; to be created'`                                                       |
| `transparency` | `'idiomatic'` (unchanged)                                                                       |
| `contrast`     | `'komma till (unstressed till) — "to arrive at": vi kommer till Stockholm'` (unchanged)         |
| `cefr`         | `'B1'`, `cefrEvidence: 'svalex'` (unchanged — the band derivation is per phrase, not per sense) |
| `verified`     | `true`; delete `unverifiedReason`                                                               |
| `forms`        | `{ presens: 'kommer till', preteritum: 'kom till', supinum: 'kommit till' }`                    |

Replace the single drafted example with these three presens frames (the
example contract requires presens, and the blank must not be the final
token — `particleVerbData.test.ts:201`):

```ts
examples: [
  { sv: 'Nya ord kommer till när språket förändras.', blankIndex: 3 },
  { sv: 'Sådana rykten kommer till när ingen vet sanningen.', blankIndex: 3 },
  { sv: 'Många traditioner kommer till av en slump.', blankIndex: 3 },
],
```

All three are existential: the subject is a thing that begins to exist, and
no place complement is present, so the unstressed directional reading cannot
apply. `acceptedParticles` stays `['till']`. Leave `excludedParticles`
unset on all three frames — no substitution has been individually verified,
and the field's contract forbids guessing (`particleVerbData.ts:46-54`).
`acceptedRecall` stays unset.

## What implementers change

**`swedish-linguist` — `src/data/particleVerbData.ts`.** Delete the
`pv:komma-for` object (lines 1479–1497) and the `pv:vara-till` object
(lines 1717–1734). Extend the header exclusion note with the two retired
ids and their one-line reasons. Apply the `pv:komma-till` field table and
example block above verbatim.

**`qa` — fixtures only if they reference the removed ids.** No threshold
test moves: both removed entries were unverified, so `VERIFIED.length`,
the A1+A2 floor of 45, and the first-30 introduction assertion are all
unaffected. The verified count rises by one B1 entry, which post-#343 is
uncapped. Any fixture that names `pv:komma-for` or `pv:vara-till` updates
to a surviving id.

**No one else.** No storage shape changes, no migration, no UI change.

## How we would know this was wrong

- A learner-facing complaint that _komma till_ is graded wrong in a
  directional sentence — would mean a frame leaked ambiguity; fix the frame,
  not the gloss.
- SO or a native informant attests a second living frame for _det kommer
  för mig_ — re-author under a new id with two frames and a C1 judgment
  band, never A1.
- Corpus evidence that bare existential _vara till_ is current outside
  solemn register — re-author as C1 judgment; the PP uses stay excluded
  regardless.

## Sources

SO (Svensk ordbok, svenska.se): _komma för_ (impersonal, dated), _komma
till_ ("bli till, uppstå"), _vara till_ (existential, solemn); _till_ as
preposition in _till nytta/hjälp/salu_.
`docs/research/partikelverb/partikelverb-list.md` rows 75, 115, 134 and the
SVALex problem table at line 1685.
`src/data/particleVerbData.ts` header contract and field comments.
[[2026-08-09-particle-cefr-majority-decision]] for why one more verified B1
entry is safe.

## Routed to

`swedish-linguist` — the dataset edits above.
`qa` — fixture sweep for the two retired ids.
Lead — close #358 when the dataset PR lands; epic #320 tracking.
