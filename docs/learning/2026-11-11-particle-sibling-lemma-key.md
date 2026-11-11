# Sibling separation in the particle queue keys on the lemma

Linear ORD-126. Follow-up from the `staff-engineer` review of ORD-123 (PR
#541). Extends the sibling rule in [[particle-verb-practice]] ("Ordering
within a particle sitting"). It changes no interval, no stored shape and no
Swedish data.

## Amendment to the 08-17 rule

This note amends [[2026-08-17-reflexive-only-verbs-and-entries-per-base]],
Decision 2, rule 3 ("never drop a due review") and its table row "same-base
due reviews dropped: 0 — never".

- The "never drop" rule still applies to same-base cards with **different**
  particles. For those cards the queue reorders only.
- A card with the **same lemma key** as another card in the sitting is held to
  the next sitting. This is the only exception to the 08-17 rule.
- Reason: the same base and the same particle give an identical cloze answer
  or an identical recall string. The second card is not a retrieval.
- A held card is not dropped. It stays due and is not rescheduled.

## Decision

**Yes.** Sibling separation keys on the lemma, not on the entry id. The lemma
key is the base infinitive plus the primary particle:
`${entry.baseInfinitive} ${entry.particle}`. A particle sitting contains at
most **one entry per lemma key**. This applies to due reviews, recall unlocks,
introductions (with their first cloze) and the free-practice round. When two
due cards share a lemma key, a cloze wins over a recall. Between two cards of
the same kind, the more overdue card wins. The other card waits for the next
sitting. The code change is a follow-up ticket for `srs-engine`, with tests
from `qa`. This PR contains only this note.

## Question

After the ORD-123 split, two entries can have the same lemma and different
ids. Does the queue separate siblings by entry id (today) or by lemma?

## What the app does today

`src/lib/particleQueue.ts` separates the two items of one **entry**:

- Lines 241–265: when the cloze and the recall of one entry are both due, the
  cloze is served and the recall waits.
- Line 293: a recall unlock is not served when `reviews` contains a card with
  the same `entry.id`.
- Line 386: the free-practice round keeps one item per `entry.id`.

The reason is in [[particle-verb-practice]]: the cloze feedback screen shows
the phrase in full. A recall card for that phrase later in the same sitting is
answered from short-term memory. It reports a success that the learner did not
earn, and the scheduler lengthens the interval.

All 285 entries in `PARTICLE_VERB_DATA` are verified. The data on
`origin/main` (commit `7c7b1b6`) has 12 groups of two entries that share a
base infinitive and a primary particle. 24 of 285 entries are in a group.

| Lemma key     | Entries                                  | Kind of pair                |
| ------------- | ---------------------------------------- | --------------------------- |
| `gå ut`       | `pv:ga-ut`, `pv:ga-ut-lamna`             | sense split, same lemma     |
| `gå upp`      | `pv:ga-upp`, `pv:ga-upp-stiga`           | sense split, same lemma     |
| `gå ner`      | `pv:ga-ner`, `pv:ga-ner-minska`          | sense split, same lemma     |
| `komma in`    | `pv:komma-in`, `pv:komma-in-antagning`   | sense split, same lemma     |
| `komma upp`   | `pv:komma-upp`, `pv:komma-upp-amne`      | sense split, same lemma     |
| `ta ut`       | `pv:ta-ut`, `pv:ta-ut-uttag`             | sense split, same lemma     |
| `ta bort`     | `pv:ta-bort`, `pv:ta-bort-radera`        | sense split, same lemma     |
| `sätta upp`   | `pv:satta-upp`, `pv:satta-upp-pjas`      | sense split, same lemma     |
| `sätta in`    | `pv:satta-in`, `pv:satta-in-montera`     | sense split, same lemma     |
| `sätta ut`    | `pv:satta-ut`, `pv:satta-ut-medicin`     | sense split, same lemma     |
| `plocka bort` | `pv:plocka-bort`, `pv:plocka-bort-lista` | sense split, same lemma     |
| `ta av`       | `pv:ta-av`, `pv:ta-av-sig`               | plain and reflexive entries |

For each of the 11 split pairs, both entries have a recall item and both
recall answers are the same string. The queue today can serve the cloze of one
entry and the recall of the other entry in one sitting. It can also serve both
clozes, or both recalls, in one sitting.

The introduction rule (`isBaseRecentlyUsed`) does not close this gap. It keys
on `baseInfinitive`, but it blocks only while the sibling cloze has fewer than
2 repetitions. After that, the new entry of a split pair can get its
introduction card in a sitting that also contains a due card of the old entry.

## Why the lemma, and why one entry per sitting

The leak comes from what the learner saw on the screen, not from the id. The
feedback screen and the introduction card show the lemma. Two entries with the
same lemma show the same phrase.

- **Cloze, then recall of the other entry.** The recall answer was on the
  screen some cards earlier. This is the case in the ticket.
- **Introduction of one entry, then a due recall of the other.** The
  introduction card shows the lemma. Introductions come first in a sitting, so
  the recall always follows. This is the same leak.
- **Two recalls.** The two recall answers are the same string. The second
  answer is a copy of the first.
- **Two clozes, or an introduction and a cloze.** The second sentence contains
  the same base verb, and the answer is the same particle. The learner can
  repeat the particle from the first card without retrieval of the second
  sense. The 08-17 note says that contrast between established same-base items
  builds discrimination (Kornell & Bjork). Contrast helps when the answers
  differ. Here the particle answer is the same, so the second cloze gives no
  discrimination practice.

In each case the scheduler records a success that long-term memory did not
produce. Each false success lengthens an interval that is not earned. That is
the same harm that the existing sibling rule prevents, so the same rule
applies: one entry per lemma key per sitting.

The cost is small. A held card stays due and is served in the next sitting,
usually one day later. One day of delay costs less than a false success, which
can add weeks to an interval.

## Rule

### 1. The lemma key

`srs-engine` adds one exported function to `src/lib/particleQueue.ts`:

```ts
export function particleLemmaKey(entry: ParticleVerbData): string {
  return `${entry.baseInfinitive} ${entry.particle}`;
}
```

- **Fields only.** The key uses `baseInfinitive` and `particle`. It never
  parses `id` or `lemma`. Ids are opaque (id rule 3 in
  `src/data/particleVerbData.ts`).
- **No normalisation.** The dataset test already asserts that
  `baseInfinitive` is NFC and is one identical string per base. `particle` is
  always `acceptedParticles[0]`.
- **Reflexive verbs.** The key ignores `reflexive` and the `{refl}`
  placeholder. `pv:ta-av` and `pv:ta-av-sig` have the same key. A reflexive
  entry has no recall item, but its cloze feedback shows the base and the
  particle together, and that primes the recall of the plain entry.
- **Lemmas with a third word.** The key ignores words after the particle
  (`se fram emot` has the key `se fram`). Apart from `pv:ta-av-sig` (see Reflexive verbs), no two entries collide
  through this today. If a later entry collides, the two entries are held apart. That is the
  safe direction.
- **`acceptedParticles` variants (`ner`/`ned`).** The key uses the primary
  particle only. `acceptedParticles` is not part of the key, and the queue has
  no alias table. Today no entry has `ned` as its primary particle; all 15
  entries that accept `ned` have `ner` as the primary. `qa` pins this with a
  dataset test (see Hand-off). If that test fails later, the lead asks the
  `learning-designer` for a new ruling before any alias is added.
- **Entries that accept a particle of another entry.** `pv:stoppa-ner` accepts
  `in`, and `pv:stoppa-in` is a different entry. `pv:ga-av` accepts `sönder`,
  and `pv:ga-sonder` is a different entry. These pairs have different keys
  and can share a sitting. Their lemmas are different, and the recall of one
  does not accept the lemma of the other.

### 2. Due reviews (lines 241–265)

1. Collect the due cards as today. The per-entry rule stays: when the cloze
   and the recall of one entry are both due, only the cloze is a candidate.
2. Group the candidates by `particleLemmaKey(card.entry)`. Keep one card per
   group:
   - a cloze wins over a recall;
   - between two cards of the same kind, the smaller `dueAt` wins;
   - on equal `dueAt`, the entry that comes first in `entries` wins. The
     tie-break does not use the shuffle, so the result is deterministic.
3. Then shuffle, sort by `dueAt` and slice to `particleDailyGoal`, as today.
   The group step comes before the slice, so a held card does not use a slot.
4. `reviewsDue` is the count **after** the group step. This agrees with the
   count today, where an entry with two due items counts as 1. The Home badge
   then reaches zero after one sitting.

A cloze wins because it is the item that the recall depends on, and this is
the rule for one entry today. The held card is not rescheduled and its state
is not changed. It is still due in the next sitting.

### 3. Recall unlocks (line 293)

Do not serve a recall unlock when a card in `reviews`, or a recall unlock
already chosen in this sitting, has the same lemma key. The skipped unlock
does not use the new-card allowance.

### 4. Introductions

Do not introduce an entry when a card in `reviews` or in `recallUnlocks` has
the same lemma key. The skipped entry does not use the new-card allowance. It
is a candidate again in the next sitting. `isBaseRecentlyUsed`, the same-base
check between introductions and the per-particle cap do not change. The first
cloze belongs to its introduction, so it needs no check of its own.

### 5. Free practice (line 386)

Keep one item per lemma key, not one per `entry.id`. The order does not
change: nearest future `dueAt` first, so the first item of a group in that
order is the one that stays. Rename `seenVerbs` to `seenLemmaKeys`.

### 6. Comments

Update the comments at lines 241–245, 291–292 and 381–385 to say "lemma key"
and to name `particleLemmaKey`.

## The comment at `particleQueue.ts:163` is false

The comment at lines 159–166 says that `PARTICLE_VERB_DATA` is
frequency-ordered inside a band, so the stable sort gives the fourth ordering
key (corpus frequency) at no cost. That is not true. Entries are appended to
the end of the array. Examples on `origin/main`: indexes 274–278 and 280 are
A1 entries (`pv:ga-ut-lamna`, `pv:ga-upp-stiga`, `pv:ga-ner-minska`,
`pv:komma-in-antagning`, `pv:ta-ut-uttag`, `pv:satta-upp-pjas`). They are
senses of high-frequency verbs, and they sit last in the A1 band, after every
other A1 entry.

Ruling: **fix the comment, do not change the order.** The real fourth key is
the position in `PARTICLE_VERB_DATA`, and the code keeps it. `srs-engine`
replaces the last sentence of the comment with this text, in the follow-up
ticket:

```ts
// The fourth key is never compared explicitly. Entries tied on every rule
// above keep their relative order in PARTICLE_VERB_DATA (Array.prototype.sort
// is stable). That order is NOT corpus frequency: entries are appended, so a
// later entry sits last in its band even when its verb is frequent.
```

The late position of the split entries is acceptable. The second sense of a
verb then comes after the first sense and after the other verbs of the band,
which agrees with the same-base spacing rule. A true frequency order needs a
frequency value per entry from the `swedish-linguist`. Nobody has asked for
it, and this note does not ask for it.

## Runner-up

Separate only a cloze from a recall across entries with the same lemma, and
let two clozes share a sitting. It is the smallest change that closes the case
in the ticket. It lost because two recalls with the same answer string, and an
introduction card before a due recall, are the same leak. A rule with one
sentence ("one entry per lemma key per sitting") is also simpler to implement
and to test than a rule per card kind.

Rejected: a wider key that also joins entries whose `acceptedParticles` or
`acceptedRecall` lists overlap. That relation is not transitive, so it does
not give one key per entry. See "Not decided here".

## How we know this rule is wrong

- The maintainer sees that a card of a split pair stays due and is not served
  for several days in a row, because its sibling wins each time. The app has
  no per-sitting log, so `qa` can also show this with a simulation over 30
  simulated days. Then change the tie rule to "the
  more overdue card wins, whatever the kind".
- The maintainer reports that the second entry of a split pair is not
  introduced for weeks after the 7-day same-base block ends. Then remove the
  introduction check of rule 4 against cloze reviews, and keep it against
  recalls.

This rule is an argument from the mechanism (what was on the screen). The app
has one user and no per-answer log that can measure the leak.

## Stored-shape impact

None. The key is computed from the data table at queue-build time. No item id
changes, nothing new is stored, and `STORAGE_VERSION` stays at 3.

## Hand-off

One follow-up ticket for the lead to create. This PR does not contain it.

**`srs-engine`** — `src/lib/particleQueue.ts` only: rules 1–6 above, and the
comment fix at lines 159–166.

**`qa`** — `src/lib/particleQueue.test.ts`, in the `sibling separation`
block. Use two fixture entries with the same `baseInfinitive` and `particle`
and different ids (for example the ids `pv:ga-upp` and `pv:ga-upp-stiga`):

1. Due cloze of A and due recall of B: the sitting contains only the cloze of
   A, and `reviewsDue` is 1. With the cloze of A not due, the recall of B is
   served.
2. Two due clozes: only the one with the smaller `dueAt` is served. On equal
   `dueAt`, the first entry in `entries` is served.
3. Two due recalls: only the one with the smaller `dueAt` is served.
4. A recall unlock of B is not served when a card of A is in `reviews`.
5. B is not introduced when a due card of A is in the sitting. B is introduced
   in a sitting with no card of A (and A's cloze at 2 repetitions or more).
6. `buildFreeParticlePractice` returns one item for the pair.
7. Reflexive: a due cloze of a reflexive entry holds the due recall of a plain
   entry with the same base and particle.
8. Control: two entries with the same base and different particles still share
   a sitting.

A future 08-17 test, "due-review count unchanged by reordering", must exclude
pairs of cards that have the same lemma key. The queue holds one card of such
a pair on purpose.

`qa` also adds one assertion to the dataset-integrity test
(`particleVerbData.test.ts`): no entry has `particle === 'ned'`.

`staff-engineer` reviews the follow-up PR. No migration and no human approval
for storage is necessary.

## Not decided here

Four entries accept the lemma of another entry as a recall answer:
`pv:stanga-av` and `pv:sla-av` accept each other's lemma, and `pv:satta-pa`
and `pv:sla-pa` accept each other's lemma. A cloze of one entry shows a phrase
that the recall of the other entry accepts. The lemma key does not join them,
because their bases are different. They are synonym pairs, not one lemma, and
the correct treatment can be stronger than a one-sitting separation. I report
this to the lead as a separate task for the `learning-designer`. It does not
block the follow-up ticket.
