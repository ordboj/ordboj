# Swedish particle verbs (partikelverb) — frequency-ordered research list

Owner: `swedish-linguist`. Research deliverable for a GitHub issue.
No production file was edited to produce this.

Revision 2026-08-09: 17 entries removed pending human review — the 16
NEEDS HUMAN CHECK rows (section 4.8) and `trycka på` (section 4.2).
Lead decision on the tracking issue. Ranks are preserved, so the rank
column has gaps. Headline counts in the prose (1069, 569, 415/654)
describe the original measurement and are kept as the historical record.

Revision 2026-08-12: the human review of those 16 is complete (ruling on
issue #330). 14 are confirmed as real Swedish, 6 of them with a corrected
gloss; 2 are excluded for good and move to section 4.7. Section 4.8 carries
the full decision table. This revision records the ruling only — it restores
no row to the table or the CSV, so the file still holds 1052 entries. Putting
the 14 confirmed rows back is a separate, lead-gated change.

## Method

Two independent sources, combined. Neither is complete on its own, and that
is the first finding.

**Source A — SVALex** (`docs/research/svalex/partikelverb_cefr_draft.csv`,
already in this repo). 457 verb+particle combinations from CEFRLex
(UCLouvain / Språkbanken), 429 of them carrying a corpus frequency. This gives
a **ranking based on evidence**, and a CEFR band. It is built from 12
CEFR-graded L2 coursebooks including Rivstart, so it measures what a Swedish
course teaches.

**Source B — Wiktionary** `Appendix:Partikelverb/Svenska`, 1342 rows supplied
by the lead. This is a **lexicographic inventory**: no frequency, no meanings,
but far broader coverage and — critically — it records the position of the
reflexive pronoun in the lemma.

**Source C** — a curated print inventory of Swedish particle verbs
(supplied by the lead), 834 entries OCR-extracted from its reference
section. This is a
**curated teaching inventory**: 169 base verbs and, under each, the
_non-transparent_ particle verbs they form — the ones whose meaning a learner
cannot derive from the parts. That selection principle is exactly the
pedagogical filter neither of the other two sources applies, which is why it
contributes the most new material of the three.

Two caveats attach to source C, and both are load-bearing.

_OCR reliability._ The extraction came from Tesseract over a scanned print
source, so
the lead flagged it as unverified. I checked it before using it rather than
after: zero lemmas contain characters outside the Swedish alphabet, every
lemma contains its own stated particle, there are no duplicate lemmas, and all
143 base verbs are real Swedish verbs. Character-level corruption is therefore
**absent**, not merely unlikely. What that check cannot catch is a
semantically wrong entry that still looks like Swedish, so I verified the
entries against my own knowledge as well — see sections 4.7 and 4.8 for the
four rejected outright and the sixteen that went to human review.

_Copyright._ Source C is in copyright. This file records **facts only**:
which verb combines with which particle. Every gloss is reformulated in my own
wording, no definition is reproduced, and no example sentence is copied. A
list of which words exist is not itself protectable; the source's phrasing and
examples are, and neither is here.

How the three sources actually relate, measured rather than assumed:

- Wiktionary covers only **262 of the 457** SVALex rows.
- Of the first 500 entries below, 350 are backed by SVALex and 348 by
  Wiktionary, so **198 are confirmed by both**. Band 9 adds 569 backed by
  source C alone. Every entry is confirmed by at least one source, and each band
  states which.
- Wiktionary genuinely lacks `ta emot` (SVALex freq 50.0), `ta slut` (49.6),
  `komma hem` (282.1), `slå fast`, `gå igenom` and `ta över`. These are not
  format mismatches; I checked the raw wikitext.
- SVALex genuinely lacks `följa med`, `ha på sig`, `passa på`, `ta reda på`,
  `komma överens`, `stänga av`, `slå på`, and reflexive particle verbs as an
  entire class.
- Source C overlaps my bands 1–8 on only 263 of its 834 entries. It adds
  **571 candidates neither of the other sources had**, and it supplies glosses
  for 7 entries I had previously been unable to gloss at all (section 4.2).

So the inventory is the **union of all three**, the ordering comes from SVALex
where it exists, and my judgment fills the rest. Every entry below states
which.

### Ranking

Bands 1–5 are sorted by SVALex corpus frequency, descending. Bands 6–8 have no
corpus frequency and are ordered by my estimate of everyday usefulness.

Two honesty notes about the numbers:

- **Within band 5 the ordering is weak, and in band 7 it is meaningless.**
  Large blocks share an identical frequency — 0.8196 occurs 47 times, 0.7206
  occurs 39 times. Those are single-occurrence artifacts. Treat band membership
  as the signal and position inside a band as noise.
- The CEFR column for bands 1–5 and 7–8 is the SVALex "first level with
  nonzero frequency". That derivation is ours, not a label the resource
  assigns. It matches the method already used in `src/data/particleVerbData.ts`,
  so this list drops into the existing `cefrEvidence: 'svalex'` convention
  without inventing a taxonomy. Band 6 CEFR is judgment.

### The "Betonad" column

A particle verb is _defined_ by the particle carrying the main stress
(`hon tycker OM honom`). The honest answer for every genuine entry is
therefore "yes", and a uniform column teaches nothing. I use the column for
the distinction that does carry information:

| Value  | Meaning                                                                                                                                  |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `ja`   | Stressed particle. No competing unstressed reading.                                                                                      |
| `ja ⚠` | Stressed particle, **and** the identical string also exists with an unstressed preposition and a different meaning. These are the traps. |

Every `ja ⚠` row is a candidate for the `contrast` field that
`particleVerbData.ts` already has. 49 rows carry it.

### Confidence and exclusions

Nothing here is invented. Every entry is either a row in one of the two
sources or, where neither has it, marked as my own judgment. Entries I could
not gloss confidently are **not** in the table — they are named in section 4
instead, so the omission is visible.

I did not pad to reach a target. **94 corpus rows that would have filled slots
are deliberately excluded** — too rare to teach (`hägna in`, `knåpa ihop`,
`tufsa till`, `rationalisera bort`), not particle verbs at all (`bero på`,
`titta på`), or not confidently glossable. All 94 are listed in section 4.3,
so the cuts are auditable rather than silent. Four source-C entries are rejected
outright (4.7) and sixteen more were removed for human review (4.8); that review
is now complete and confirmed 14 of them.

**Spelling variants are not separate entries.** Swedish writes several
particles two ways: `ner`/`ned`, `igång`/`i gång`, `iväg`/`i väg`. SVALex
lists `skriva ner` and `skriva ned` as separate rows; they are one verb. I
merged **13** such pairs and recommend a `particleSpellings` field
(section 3.3) rather than duplicate entries. This freed 13 slots for real
verbs.

License: SVALex and SweLLex are **CC BY-NC-SA 4.0**. This list is a derivative
and carries the same terms.

## The gate that decides whether any of this can ship

`particleVerbData.ts` requires every `baseInfinitive` to resolve in
`VERB_DATA`, and the design spec makes it a test assertion. Measured against
the current table:

- The 1069 entries below need **249 distinct base verbs**
- `VERB_DATA` has 56 rows, of which **36** appear as a base here
- **213 base verbs are missing**
- **654 of the 1069 entries are unshippable today** — their base verb does not
  exist in the conjugation table

**415 of 1069 can pass the gate as things stand.** Growing the particle
dataset past ~415 entries is blocked on `VERB_DATA` growth, not on
linguistics. That is the single most useful number in this document: adding
particle verbs and adding base verbs are one project, not two.

The ceiling moved 183 → 229 → 415 as each source was added, because each one
piles more particle verbs onto base verbs the app already has.

**The cheapest way to raise the ceiling further is to add a dozen base verbs,
not a dozen particle verbs.** Ranked by how many blocked entries each would
unblock:

| Missing base verb | Entries it unblocks |
| ----------------- | ------------------- |
| slå               | 30                  |
| dra               | 28                  |
| köra              | 14                  |
| arbeta            | 12                  |
| hänga             | 11                  |
| sitta             | 11                  |
| falla             | 10                  |
| kasta             | 10                  |
| bryta             | 9                   |
| åka               | 9                   |
| plocka            | 9                   |
| titta             | 8                   |

Adding `slå` and `dra` alone unblocks 58 particle verbs. All twelve unblock
161 — more than the entire shippable set was two revisions ago. These are also
all high-frequency everyday verbs that belong in a conjugation trainer on
their own merits, so this is not a favour the particle feature is asking of
`VERB_DATA`.

---

## 1. Frequency-ordered list

### Band 1 — highest frequency (SVALex freq ≥ 100)

| #   | Partikelverb   | Basverb | Partikel | Betydelse (EN)                     | CEFR | Betonad |
| --- | -------------- | ------- | -------- | ---------------------------------- | ---- | ------- |
| 1   | se ut          | se      | ut       | to look, to appear (a certain way) | A1   | ja      |
| 2   | komma hem      | komma   | hem      | to come home                       | A1   | ja      |
| 3   | gå ut          | gå      | ut       | to go out; to expire               | A1   | ja      |
| 4   | komma ihåg     | komma   | ihåg     | to remember                        | A1   | ja      |
| 5   | komma in       | komma   | in       | to come in; to be admitted         | A1   | ja      |
| 6   | ta upp         | ta      | upp      | to pick up; to raise (a topic)     | A2   | ja      |
| 7   | växa upp       | växa    | upp      | to grow up                         | A1   | ja      |
| 8   | ge ut          | ge      | ut       | to publish; to issue               | B1   | ja      |
| 9   | komma tillbaka | komma   | tillbaka | to come back                       | A1   | ja      |
| 10  | komma fram     | komma   | fram     | to arrive; to emerge               | A1   | ja      |
| 11  | vara med       | vara    | med      | to take part; to be present        | A1   | ja ⚠    |
| 12  | gå in          | gå      | in       | to go in, to enter                 | A1   | ja      |

### Band 2 — very high (30 ≤ freq < 100)

| #   | Partikelverb   | Basverb | Partikel | Betydelse (EN)                        | CEFR | Betonad |
| --- | -------------- | ------- | -------- | ------------------------------------- | ---- | ------- |
| 13  | komma ut       | komma   | ut       | to come out; to be published          | A2   | ja      |
| 14  | tycka om       | tycka   | om       | to like, to be fond of                | A2   | ja ⚠    |
| 15  | tala om        | tala    | om       | to tell (someone something)           | A1   | ja ⚠    |
| 16  | dela ut        | dela    | ut       | to hand out, to distribute            | A1   | ja      |
| 17  | känna igen     | känna   | igen     | to recognise                          | A2   | ja      |
| 18  | ta ut          | ta      | ut       | to take out; to withdraw (money)      | A1   | ja      |
| 19  | veta om        | veta    | om       | to be aware of, to know about         | A2   | ja ⚠    |
| 20  | tänka om       | tänka   | om       | to reconsider, to change one's mind   | A2   | ja      |
| 21  | gå upp         | gå      | upp      | to rise; to increase; to come open    | A1   | ja      |
| 22  | göra om        | göra    | om       | to redo, to do again                  | A2   | ja      |
| 23  | dyka upp       | dyka    | upp      | to turn up, to show up                | B1   | ja      |
| 24  | stiga upp      | stiga   | upp      | to get up, to get out of bed          | A1   | ja      |
| 25  | ta fram        | ta      | fram     | to get something out and ready        | A2   | ja      |
| 26  | ta emot        | ta      | emot     | to receive, to accept                 | A2   | ja      |
| 27  | ta slut        | ta      | slut     | to run out, to come to an end         | B1   | ja      |
| 28  | gå ner         | gå      | ner      | to go down; to decrease               | A1   | ja      |
| 29  | ge upp         | ge      | upp      | to give up, to surrender              | A2   | ja      |
| 30  | hjälpa till    | hjälpa  | till     | to help out, to lend a hand           | A2   | ja      |
| 31  | gå hem         | gå      | hem      | to go home; to go down well (idiom)   | A1   | ja      |
| 32  | sätta upp      | sätta   | upp      | to put up; to stage (a play)          | A1   | ja      |
| 33  | komma igen     | komma   | igen     | to come back; to recur                | A2   | ja      |
| 34  | låna ut        | låna    | ut       | to lend out                           | A2   | ja      |
| 35  | gå över        | gå      | över     | to pass, to subside; to cross         | A2   | ja ⚠    |
| 36  | ta in          | ta      | in       | to take in; to admit; to check in     | B1   | ja      |
| 37  | ta med         | ta      | med      | to bring along                        | A1   | ja      |
| 38  | spela in       | spela   | in       | to record                             | B1   | ja      |
| 39  | slå ut         | slå     | ut       | to knock out; to eliminate; to bloom  | A2   | ja      |
| 40  | lägga ner      | lägga   | ner      | to shut down; to put down; to abandon | B1   | ja      |
| 41  | ställa upp     | ställa  | upp      | to take part; to help out; to line up | A2   | ja      |
| 42  | se om          | se      | om       | to look after; to watch again         | A2   | ja ⚠    |
| 43  | ha kvar        | ha      | kvar     | to still have                         | A2   | ja      |
| 44  | koppla av      | koppla  | av       | to relax; to disconnect               | A2   | ja      |
| 45  | slå upp        | slå     | upp      | to look up (in a book); to open       | A2   | ja      |
| 46  | lämna tillbaka | lämna   | tillbaka | to give back, to return               | A2   | ja      |
| 47  | tänka efter    | tänka   | efter    | to think carefully, to reflect        | B1   | ja      |
| 48  | sätta in       | sätta   | in       | to insert; to deposit (money)         | A2   | ja      |
| 49  | känna till     | känna   | till     | to know about, to be familiar with    | B1   | ja      |

### Band 3 — high (10 ≤ freq < 30)

| #   | Partikelverb | Basverb | Partikel | Betydelse (EN)                                | CEFR | Betonad |
| --- | ------------ | ------- | -------- | --------------------------------------------- | ---- | ------- |
| 50  | ta hem       | ta      | hem      | to bring home; to win (a prize)               | A1   | ja      |
| 51  | lägga in     | lägga   | in       | to put in; to admit (to hospital)             | A2   | ja      |
| 52  | sätta ut     | sätta   | ut       | to put out; to discontinue (medication)       | A2   | ja      |
| 53  | hålla på     | hålla   | på       | to be in the middle of doing                  | A2   | ja ⚠    |
| 54  | bli av       | bli     | av       | to happen, to come off                        | B1   | ja      |
| 55  | ta bort      | ta      | bort     | to remove, to delete                          | A2   | ja      |
| 56  | sätta igång  | sätta   | igång    | to start, to get going                        | B1   | ja      |
| 57  | ta om        | ta      | om       | to do again, to retake                        | B1   | ja      |
| 58  | dra in       | dra     | in       | to withdraw, to cut; to pull in               | A2   | ja      |
| 59  | dö ut        | dö      | ut       | to die out, to become extinct                 | B1   | ja      |
| 60  | ställa in    | ställa  | in       | to cancel; to adjust, to set                  | A2   | ja      |
| 61  | lämna in     | lämna   | in       | to hand in, to submit                         | A2   | ja      |
| 62  | lägga om     | lägga   | om       | to change, to rearrange; to redress (a wound) | B1   | ja      |
| 63  | äta upp      | äta     | upp      | to eat up, to finish eating                   | B1   | ja      |
| 64  | göra upp     | göra    | upp      | to settle, to make a deal                     | A2   | ja      |
| 65  | skriva ut    | skriva  | ut       | to print out; to prescribe; to discharge      | A2   | ja      |
| 66  | skriva ner   | skriva  | ner      | to write down (also spelt _skriva ned_)       | A2   | ja      |
| 67  | köra hem     | köra    | hem      | to drive home                                 | B1   | ja      |
| 68  | visa upp     | visa    | upp      | to show, to present for inspection            | B1   | ja      |
| 69  | gå åt        | gå      | åt       | to be used up; to lay into someone            | B1   | ja ⚠    |
| 70  | glömma bort  | glömma  | bort     | to forget                                     | B1   | ja      |
| 71  | släppa ut    | släppa  | ut       | to release, to let out; to emit               | B1   | ja      |
| 72  | värma upp    | värma   | upp      | to heat up; to warm up                        | A2   | ja      |
| 73  | hänga upp    | hänga   | upp      | to hang up                                    | A2   | ja      |
| 74  | gå sönder    | gå      | sönder   | to break, to stop working                     | B1   | ja      |
| 75  | komma för    | komma   | för      | to occur to (someone)                         | A1   | ja ⚠    |
| 76  | köra in      | köra    | in       | to drive in; to run in (a machine)            | A2   | ja      |
| 77  | lära in      | lära    | in       | to learn, to memorise                         | B1   | ja      |
| 78  | dra ut       | dra     | ut       | to pull out; to drag on (of time)             | B1   | ja      |
| 79  | komma upp    | komma   | upp      | to come up; to get up                         | B2   | ja      |
| 80  | bryta upp    | bryta   | upp      | to break open; to depart                      | B2   | ja      |
| 81  | säga till    | säga    | till     | to let know, to notify; to speak up           | B1   | ja      |
| 82  | hoppa över   | hoppa   | över     | to skip; to jump over                         | B2   | ja      |
| 83  | bjuda in     | bjuda   | in       | to invite                                     | B1   | ja      |
| 84  | åka fast     | åka     | fast     | to get caught                                 | B1   | ja      |
| 85  | göra slut    | göra    | slut     | to break up (a relationship); to use up       | A2   | ja      |
| 86  | peka ut      | peka    | ut       | to point out                                  | B1   | ja      |
| 87  | reda ut      | reda    | ut       | to sort out, to clear up                      | B2   | ja      |
| 88  | hänga med    | hänga   | med      | to keep up, to follow; to come along          | B1   | ja      |
| 89  | lägga upp    | lägga   | upp      | to plan, to lay out; to upload                | A2   | ja      |
| 90  | räkna ut     | räkna   | ut       | to calculate, to work out                     | B1   | ja      |
| 91  | komma igång  | komma   | igång    | to get going, to get started                  | B1   | ja      |

### Band 4 — common (3 ≤ freq < 10)

| #   | Partikelverb | Basverb | Partikel | Betydelse (EN)                                         | CEFR | Betonad |
| --- | ------------ | ------- | -------- | ------------------------------------------------------ | ---- | ------- |
| 92  | bli kvar     | bli     | kvar     | to stay behind, to remain                              | B2   | ja      |
| 93  | gå till      | gå      | till     | to happen, to be done (_hur går det till?_)            | B1   | ja ⚠    |
| 94  | stå ut       | stå     | ut       | to endure, to put up with                              | B1   | ja      |
| 95  | tråka ut     | tråka   | ut       | to bore (someone)                                      | A2   | ja      |
| 96  | lyfta fram   | lyfta   | fram     | to highlight, to bring forward                         | B2   | ja      |
| 97  | hänga ihop   | hänga   | ihop     | to be connected, to hold together                      | B2   | ja      |
| 98  | passa ihop   | passa   | ihop     | to match, to go well together                          | B1   | ja      |
| 99  | föda upp     | föda    | upp      | to breed, to rear (animals)                            | B1   | ja      |
| 100 | sätta ihop   | sätta   | ihop     | to put together, to assemble                           | B1   | ja      |
| 101 | ta ner       | ta      | ner      | to take down                                           | B1   | ja      |
| 102 | ropa upp     | ropa    | upp      | to call out a name, to page                            | B2   | ja      |
| 103 | falla ner    | falla   | ner      | to fall down                                           | B2   | ja      |
| 104 | hålla med    | hålla   | med      | to agree, to concur                                    | A2   | ja      |
| 105 | se fram      | se      | fram     | to look forward (always _se fram emot_)                | B2   | ja      |
| 106 | vända om     | vända   | om       | to turn back the way one came                          | B1   | ja      |
| 107 | dela upp     | dela    | upp      | to divide up, to split                                 | B1   | ja      |
| 108 | reta upp     | reta    | upp      | to annoy; _reta upp sig_ to get worked up              | B2   | ja      |
| 109 | gå miste     | gå      | miste    | to miss out (always _gå miste om_)                     | B1   | ja      |
| 110 | spela upp    | spela   | upp      | to play back                                           | B2   | ja      |
| 111 | andas in     | andas   | in       | to breathe in, to inhale                               | A2   | ja      |
| 112 | lägga till   | lägga   | till     | to add                                                 | B2   | ja      |
| 113 | sitta fast   | sitta   | fast     | to be stuck                                            | B2   | ja      |
| 114 | köra på      | köra    | på       | to hit, to run into; to keep going                     | B2   | ja ⚠    |
| 115 | komma till   | komma   | till     | to be added, to be gained                              | B1   | ja ⚠    |
| 116 | hitta på     | hitta   | på       | to make up, to invent; to find something to do         | B2   | ja ⚠    |
| 117 | sätta samman | sätta   | samman   | to put together, to compose                            | B1   | ja      |
| 118 | blanda ihop  | blanda  | ihop     | to mix up, to confuse two things                       | B1   | ja      |
| 119 | sätta fast   | sätta   | fast     | to fasten; to catch (a culprit)                        | B1   | ja      |
| 120 | skicka ut    | skicka  | ut       | to send out                                            | B2   | ja      |
| 121 | passa in     | passa   | in       | to fit in                                              | B1   | ja      |
| 122 | fara ut      | fara    | ut       | to rush out; _fara ut mot_ to lash out at              | B1   | ja      |
| 123 | titta in     | titta   | in       | to drop in, to look in on someone                      | A2   | ja      |
| 124 | blanda in    | blanda  | in       | to involve, to drag someone in                         | B1   | ja      |
| 125 | gå med       | gå      | med      | to join; _gå med på_ to agree to                       | B1   | ja      |
| 126 | lägga ut     | lägga   | ut       | to post online; to lay out; to pay on someone's behalf | B1   | ja      |
| 127 | göra åt      | göra    | åt       | to do about (a problem)                                | B2   | ja      |
| 128 | hyra ut      | hyra    | ut       | to rent out, to let                                    | A2   | ja      |
| 129 | kolla upp    | kolla   | upp      | to check up on, to look into                           | A2   | ja      |
| 130 | flytta ut    | flytta  | ut       | to move out                                            | A2   | ja      |
| 131 | stoppa ner   | stoppa  | ner      | to put down into, to tuck into                         | B1   | ja      |
| 132 | välja ut     | välja   | ut       | to select, to pick out                                 | B1   | ja      |
| 133 | börja om     | börja   | om       | to start over from the beginning                       | B1   | ja      |
| 134 | vara till    | vara    | till     | to be of use, to serve a purpose                       | A2   | ja ⚠    |
| 135 | spara ihop   | spara   | ihop     | to save up                                             | B1   | ja      |
| 136 | riva sönder  | riva    | sönder   | to tear apart, to rip up                               | B1   | ja      |
| 137 | hålla undan  | hålla   | undan    | to keep away, to hold off                              | B2   | ja      |
| 138 | föra fram    | föra    | fram     | to put forward, to present (an idea)                   | B2   | ja      |
| 139 | hålla upp    | hålla   | upp      | to hold up; to stop                                    | B2   | ja      |
| 140 | resa bort    | resa    | bort     | to go away, to travel away                             | B2   | ja      |
| 141 | skjuta upp   | skjuta  | upp      | to postpone                                            | B1   | ja      |
| 142 | lägga av     | lägga   | av       | to quit, to pack it in; _lägg av!_ knock it off        | A2   | ja      |
| 143 | andas ut     | andas   | ut       | to breathe out; to breathe easy                        | A2   | ja      |
| 144 | flytta bort  | flytta  | bort     | to move away                                           | B2   | ja      |
| 145 | ta till      | ta      | till     | to resort to                                           | B2   | ja ⚠    |
| 146 | ringa upp    | ringa   | upp      | to call up, to ring                                    | B1   | ja      |
| 147 | bygga ut     | bygga   | ut       | to extend, to enlarge                                  | B2   | ja      |
| 148 | gå an        | gå      | an       | to be acceptable (_det går an_)                        | B2   | ja      |
| 149 | gå igen      | gå      | igen     | to recur; to haunt                                     | A2   | ja      |
| 150 | trycka ner   | trycka  | ner      | to push down; to belittle                              | B2   | ja      |
| 151 | läsa på      | läsa    | på       | to study up, to swot                                   | B1   | ja ⚠    |
| 152 | ställa ut    | ställa  | ut       | to exhibit; to issue (a document)                      | B1   | ja      |
| 153 | slösa bort   | slösa   | bort     | to waste, to squander                                  | B1   | ja      |
| 154 | ta av        | ta      | av       | to take off (clothes); to turn off (a road)            | A2   | ja      |
| 155 | träna upp    | träna   | upp      | to build up, to train up (a skill)                     | B1   | ja      |
| 156 | plocka ihop  | plocka  | ihop     | to gather up, to pack together                         | B1   | ja      |
| 157 | dricka ur    | dricka  | ur       | to drink up, to empty a glass                          | C1   | ja      |
| 158 | rycka in     | rycka   | in       | to step in, to fill in                                 | A2   | ja      |
| 159 | blåsa upp    | blåsa   | upp      | to inflate; to blow up (a storm)                       | B2   | ja      |
| 160 | hålla kvar   | hålla   | kvar     | to keep, to detain                                     | B2   | ja      |
| 161 | jaga upp     | jaga    | upp      | to work up, to agitate                                 | B2   | ja      |
| 162 | kasta bort   | kasta   | bort     | to throw away                                          | B2   | ja      |
| 163 | slå ihjäl    | slå     | ihjäl    | to kill, to beat to death                              | B2   | ja      |
| 164 | slå in       | slå     | in       | to wrap up (a parcel); to come true                    | B2   | ja      |
| 165 | slå sönder   | slå     | sönder   | to smash, to break                                     | B2   | ja      |
| 166 | söka upp     | söka    | upp      | to seek out, to go and find                            | B2   | ja      |

### Band 5 — moderate (1 ≤ freq < 3) — intra-band order is weak

| #   | Partikelverb   | Basverb | Partikel | Betydelse (EN)                                   | CEFR | Betonad |
| --- | -------------- | ------- | -------- | ------------------------------------------------ | ---- | ------- |
| 167 | packa in       | packa   | in       | to pack, to wrap up                              | A1   | ja      |
| 168 | skjuta in      | skjuta  | in       | to insert; to interject                          | B2   | ja      |
| 169 | ta itu         | ta      | itu      | to tackle (always _ta itu med_)                  | B1   | ja      |
| 170 | hinna med      | hinna   | med      | to have time for, to make it to                  | B1   | ja      |
| 171 | klara av       | klara   | av       | to manage, to get done                           | B1   | ja      |
| 172 | samla ihop     | samla   | ihop     | to gather up, to collect                         | B1   | ja      |
| 173 | skynda på      | skynda  | på       | to hurry up                                      | B1   | ja ⚠    |
| 174 | höra hemma     | höra    | hemma    | to belong (in a place)                           | C1   | ja      |
| 175 | rusa ut        | rusa    | ut       | to rush out                                      | B1   | ja      |
| 176 | bryta ut       | bryta   | ut       | to break out (war, fire); to extract             | B1   | ja      |
| 177 | gräva ner      | gräva   | ner      | to bury                                          | B2   | ja      |
| 178 | sitta ner      | sitta   | ner      | to sit down                                      | B2   | ja      |
| 179 | bygga om       | bygga   | om       | to rebuild, to convert                           | B2   | ja      |
| 180 | gömma undan    | gömma   | undan    | to hide away                                     | B2   | ja      |
| 181 | hugga in       | hugga   | in       | to tuck in (to food); to pitch in                | B2   | ja      |
| 182 | skrämma bort   | skrämma | bort     | to scare away                                    | B2   | ja      |
| 183 | komma undan    | komma   | undan    | to get away, to escape                           | B2   | ja      |
| 184 | låsa in        | låsa    | in       | to lock in, to lock up                           | B2   | ja      |
| 185 | ställa till    | ställa  | till     | to cause (trouble) — _ställa till med_           | B2   | ja      |
| 186 | skicka in      | skicka  | in       | to send in, to submit                            | B1   | ja      |
| 187 | klättra upp    | klättra | upp      | to climb up                                      | B1   | ja      |
| 188 | kasta tillbaka | kasta   | tillbaka | to throw back                                    | C1   | ja      |
| 189 | plocka undan   | plocka  | undan    | to clear away                                    | B1   | ja      |
| 190 | falla in       | falla   | in       | to chime in; _det faller mig in_ it occurs to me | B1   | ja      |
| 191 | koppla ihop    | koppla  | ihop     | to connect together                              | B1   | ja      |
| 192 | krypa upp      | krypa   | upp      | to crawl up, to curl up                          | B1   | ja      |
| 193 | strömma in     | strömma | in       | to stream in, to pour in                         | B1   | ja      |
| 194 | köra slut      | köra    | slut     | to wear out (_köra slut på_)                     | B2   | ja      |
| 195 | ta fast        | ta      | fast     | to catch, to apprehend                           | B2   | ja      |
| 196 | vila ut        | vila    | ut       | to rest up                                       | B2   | ja      |
| 197 | slappna av     | slappna | av       | to relax, to unwind                              | B1   | ja      |
| 198 | kasta in       | kasta   | in       | to throw in                                      | C1   | ja      |
| 199 | hålla till     | hålla   | till     | to hang out, to be based somewhere               | B2   | ja      |
| 200 | hålla tillbaka | hålla   | tillbaka | to hold back, to restrain                        | B2   | ja      |
| 201 | dra upp        | dra     | upp      | to pull up; to bring up (a topic)                | B1   | ja      |
| 202 | byta ut        | byta    | ut       | to replace, to swap out                          | B1   | ja      |
| 203 | räkna bort     | räkna   | bort     | to discount, to leave out of a total             | B1   | ja      |
| 204 | plocka upp     | plocka  | upp      | to pick up                                       | A2   | ja      |
| 205 | stoppa in      | stoppa  | in       | to put in, to stuff in                           | A2   | ja      |
| 206 | läsa in        | läsa    | in       | to study up on; to import (data)                 | A2   | ja      |
| 207 | bli över       | bli     | över     | to be left over                                  | A2   | ja      |
| 208 | säga upp       | säga    | upp      | to give notice; to dismiss; to cancel a contract | B1   | ja      |
| 209 | falla ihop     | falla   | ihop     | to collapse                                      | B2   | ja      |
| 210 | slå ner        | slå     | ner      | to knock down; to strike (of lightning)          | B2   | ja      |
| 211 | stå upp        | stå     | upp      | to stand up                                      | B1   | ja      |
| 212 | gå bort        | gå      | bort     | to pass away; to go out to dinner                | B2   | ja      |
| 213 | klä ut         | klä     | ut       | to dress up in costume (_klä ut sig_)            | B2   | ja      |
| 214 | vika ihop      | vika    | ihop     | to fold up                                       | B1   | ja      |
| 215 | släppa in      | släppa  | in       | to let in                                        | B1   | ja      |
| 216 | springa ut     | springa | ut       | to run out                                       | A2   | ja      |
| 217 | se ner         | se      | ner      | to look down (_se ner på_ to look down on)       | B2   | ja      |
| 218 | bädda in       | bädda   | in       | to tuck in (in bed)                              | B1   | ja      |
| 219 | springa fram   | springa | fram     | to run forward, to run up                        | A2   | ja      |
| 220 | vara ihop      | vara    | ihop     | to be together (a couple)                        | A2   | ja      |
| 221 | fälla upp      | fälla   | upp      | to put up, to unfold (an umbrella)               | C1   | ja      |
| 222 | ge bort        | ge      | bort     | to give away                                     | C1   | ja      |
| 223 | höra till      | höra    | till     | to belong to, to be part of                      | C1   | ja ⚠    |
| 224 | köra om        | köra    | om       | to overtake                                      | C1   | ja      |
| 225 | lära ut        | lära    | ut       | to teach (a subject to someone)                  | C1   | ja      |
| 226 | piffa upp      | piffa   | upp      | to spruce up                                     | C1   | ja      |
| 227 | sticka upp     | sticka  | upp      | to stick up, to protrude                         | C1   | ja      |
| 228 | suga upp       | suga    | upp      | to soak up, to absorb                            | C1   | ja      |
| 229 | ta efter       | ta      | efter    | to imitate, to copy someone                      | C1   | ja      |
| 230 | få ihop        | få      | ihop     | to get together, to scrape together              | A2   | ja      |
| 231 | ge tillbaka    | ge      | tillbaka | to give back                                     | B2   | ja      |
| 232 | hänga samman   | hänga   | samman   | to be connected (formal)                         | B2   | ja      |
| 233 | hålla fast     | hålla   | fast     | to hold firm (_hålla fast vid_)                  | B2   | ja      |
| 234 | komma bort     | komma   | bort     | to get lost, to go missing                       | B2   | ja      |
| 235 | laga till      | laga    | till     | to prepare (food)                                | B2   | ja      |
| 236 | plocka fram    | plocka  | fram     | to bring out, to get out                         | B2   | ja      |
| 237 | skjuta ut      | skjuta  | ut       | to push out; to project                          | B2   | ja      |
| 238 | stryka över    | stryka  | över     | to cross out                                     | B2   | ja      |
| 239 | kasta ut       | kasta   | ut       | to throw out                                     | A2   | ja      |
| 240 | byta om        | byta    | om       | to change clothes                                | A1   | ja      |
| 241 | hälsa på       | hälsa   | på       | to visit, to call on someone                     | A1   | ja ⚠    |
| 242 | stå till       | stå     | till     | to be, to stand (_hur står det till?_)           | A1   | ja      |
| 243 | hugga ner      | hugga   | ner      | to cut down (a tree)                             | B2   | ja      |

### Band 6 — core, no corpus frequency (judgment-ordered)

**This band is my judgment, not evidence.** It should not be mixed with
bands 1–5 in any automated sort. Almost every entry comes from the Wiktionary
inventory; none has a SVALex frequency.

The band exists because SVALex measures coursebooks, and that produces
specific, checkable holes. `stänga av` and `slå på` — the two verbs a learner
needs on day one to operate a phone — appear nowhere in 457 rows. `följa med`
and `ha på sig` are absent, and both are A1 vocabulary. `flytta ut` is ranked
129 while `flytta in` is absent. Reflexive particle verbs are missing as an
entire class, because the extraction keyed on verb+particle and the pronoun
sits between or after them.

Five of these are already shipped and verified in `particleVerbData.ts`
(`stänga av`, `höra av sig`, `ge sig av`, `gå igenom`, `komma på`), which is
independent support for the band being real rather than my invention.

| #   | Partikelverb    | Basverb | Partikel | Betydelse (EN)                                | CEFR | Betonad |
| --- | --------------- | ------- | -------- | --------------------------------------------- | ---- | ------- |
| 244 | följa med       | följa   | med      | to come along, to accompany                   | A1   | ja      |
| 245 | ha på sig       | ha      | på       | to wear (clothes)                             | A1   | ja ⚠    |
| 246 | ta på sig       | ta      | på       | to put on (clothes); to take on (a task)      | A2   | ja ⚠    |
| 247 | ta av sig       | ta      | av       | to take off (clothes)                         | A2   | ja      |
| 248 | stänga av       | stänga  | av       | to turn off, to switch off                    | A2   | ja      |
| 249 | sätta på        | sätta   | på       | to turn on, to switch on                      | A2   | ja ⚠    |
| 250 | slå på          | slå     | på       | to turn on, to switch on                      | A2   | ja ⚠    |
| 251 | slå av          | slå     | av       | to switch off; to knock off (a price)         | A2   | ja      |
| 252 | ha med sig      | ha      | med      | to have with one, to bring                    | A2   | ja      |
| 253 | klä på sig      | klä     | på       | to get dressed                                | A2   | ja      |
| 254 | klä av sig      | klä     | av       | to undress                                    | A2   | ja      |
| 255 | sätta sig ner   | sätta   | ner      | to sit down                                   | A2   | ja      |
| 256 | slå sig ner     | slå     | ner      | to sit down; to settle somewhere              | B1   | ja      |
| 257 | stiga på        | stiga   | på       | to come in, to step in (_stig på!_)           | A2   | ja ⚠    |
| 258 | passa på        | passa   | på       | to take the opportunity                       | B1   | ja ⚠    |
| 259 | ta reda på      | ta      | reda på  | to find out                                   | A2   | ja      |
| 260 | få reda på      | få      | reda på  | to find out, to learn                         | B1   | ja      |
| 261 | bry sig om      | bry     | om       | to care about                                 | A2   | ja      |
| 262 | höra av sig     | höra    | av       | to get in touch                               | B1   | ja      |
| 263 | ge sig av       | ge      | av       | to depart, to set off                         | B1   | ja      |
| 264 | komma överens   | komma   | överens  | to agree; to get along                        | B1   | ja      |
| 265 | gå igenom       | gå      | igenom   | to go through, to review item by item         | B1   | ja      |
| 266 | komma på        | komma   | på       | to think of; to realise                       | B1   | ja ⚠    |
| 267 | fylla i         | fylla   | i        | to fill in (a form)                           | A2   | ja      |
| 268 | fylla på        | fylla   | på       | to refill, to top up                          | A2   | ja ⚠    |
| 269 | lägga på        | lägga   | på       | to hang up (the phone); to put on top         | A2   | ja ⚠    |
| 270 | flytta in       | flytta  | in       | to move in                                    | A2   | ja      |
| 271 | gå av           | gå      | av       | to come off, to break; to get off (a vehicle) | A2   | ja ⚠    |
| 272 | skriva under    | skriva  | under    | to sign                                       | B1   | ja ⚠    |
| 273 | skriva på       | skriva  | på       | to sign (a contract)                          | B1   | ja ⚠    |
| 274 | skriva in       | skriva  | in       | to enter, to register                         | B1   | ja      |
| 275 | torka av        | torka   | av       | to wipe off, to wipe down                     | A2   | ja      |
| 276 | plocka bort     | plocka  | bort     | to remove, to clear away                      | A2   | ja      |
| 277 | ställa fram     | ställa  | fram     | to put out, to set out                        | A2   | ja      |
| 278 | packa ihop      | packa   | ihop     | to pack up                                    | A2   | ja      |
| 279 | städa upp       | städa   | upp      | to clean up, to tidy up                       | A2   | ja      |
| 280 | checka in       | checka  | in       | to check in                                   | A2   | ja      |
| 281 | checka ut       | checka  | ut       | to check out                                  | A2   | ja      |
| 282 | ringa tillbaka  | ringa   | tillbaka | to call back                                  | A2   | ja      |
| 283 | skicka tillbaka | skicka  | tillbaka | to send back                                  | A2   | ja      |
| 284 | komma ner       | komma   | ner      | to come down                                  | A2   | ja      |
| 285 | gå iväg         | gå      | iväg     | to leave, to head off                         | A2   | ja      |
| 286 | åka bort        | åka     | bort     | to go away, to be away                        | A2   | ja      |
| 287 | hoppa upp       | hoppa   | upp      | to jump up                                    | A2   | ja      |
| 288 | vara tillbaka   | vara    | tillbaka | to be back                                    | A2   | ja      |
| 289 | tänka igenom    | tänka   | igenom   | to think through                              | B1   | ja      |
| 290 | tänka över      | tänka   | över     | to think over, to consider                    | B1   | ja ⚠    |
| 291 | läsa igenom     | läsa    | igenom   | to read through                               | B1   | ja      |
| 292 | se över         | se      | över     | to review, to look over                       | B2   | ja ⚠    |
| 293 | se sig om       | se      | om       | to look around                                | B1   | ja      |
| 294 | se tillbaka     | se      | tillbaka | to look back                                  | B2   | ja      |
| 295 | titta ut        | titta   | ut       | to look out                                   | B1   | ja      |
| 296 | titta upp       | titta   | upp      | to look up                                    | B1   | ja      |
| 297 | titta fram      | titta   | fram     | to peek out, to appear                        | B1   | ja      |
| 298 | titta förbi     | titta   | förbi    | to drop by                                    | B1   | ja      |
| 299 | komma förbi     | komma   | förbi    | to come by, to drop by                        | B1   | ja      |
| 300 | kolla in        | kolla   | in       | to check out, to have a look at               | B1   | ja      |
| 301 | hålla i         | hålla   | i        | to hold on to; to host (an event)             | B1   | ja ⚠    |
| 302 | hålla ut        | hålla   | ut       | to hold out, to persevere                     | B1   | ja      |
| 303 | hålla igång     | hålla   | igång    | to keep going, to keep running                | B1   | ja      |
| 304 | hålla om        | hålla   | om       | to hold, to hug                               | B1   | ja ⚠    |
| 305 | hålla av        | hålla   | av       | to be fond of                                 | B2   | ja      |
| 306 | hålla inne      | hålla   | inne     | to hold back, to withhold                     | B2   | ja      |
| 307 | slå till        | slå     | till     | to strike; to take the offer                  | B1   | ja      |
| 308 | stå på sig      | stå     | på       | to stand one's ground                         | B1   | ja ⚠    |
| 309 | sitta kvar      | sitta   | kvar     | to stay seated; to be held back a year        | B1   | ja      |
| 310 | stanna till     | stanna  | till     | to stop by, to pause                          | B1   | ja      |
| 311 | stanna upp      | stanna  | upp      | to come to a halt                             | B2   | ja      |
| 312 | lägga sig i     | lägga   | i        | to interfere, to meddle                       | B1   | ja ⚠    |
| 313 | lägga på sig    | lägga   | på       | to put on weight                              | B1   | ja ⚠    |
| 314 | lägga ihop      | lägga   | ihop     | to add up                                     | B1   | ja      |
| 315 | räkna ihop      | räkna   | ihop     | to add up, to total                           | B1   | ja      |
| 316 | räkna in        | räkna   | in       | to count in, to include                       | B2   | ja      |
| 317 | räkna med       | räkna   | med      | to count on, to expect                        | B1   | ja ⚠    |
| 318 | dra igång       | dra     | igång    | to kick off, to get going                     | B1   | ja      |
| 319 | dra på sig      | dra     | på       | to incur, to bring on oneself                 | B2   | ja ⚠    |
| 320 | dra åt          | dra     | åt       | to tighten                                    | B2   | ja      |
| 321 | dra ifrån       | dra     | ifrån    | to subtract; to draw (curtains)               | B1   | ja      |
| 322 | dra sig undan   | dra     | undan    | to withdraw, to keep to oneself               | B2   | ja      |
| 323 | dela in         | dela    | in       | to divide into (groups)                       | B1   | ja      |
| 324 | samla in        | samla   | in       | to collect, to gather                         | B1   | ja      |
| 325 | plocka in       | plocka  | in       | to bring in, to pick up                       | B1   | ja      |
| 326 | plocka ut       | plocka  | ut       | to pick out, to select                        | B1   | ja      |
| 327 | lämna ut        | lämna   | ut       | to hand out; to disclose                      | B1   | ja      |
| 328 | hämta ut        | hämta   | ut       | to collect, to pick up (a parcel)             | B1   | ja      |
| 329 | hämta in        | hämta   | in       | to fetch in; to catch up (a deficit)          | B2   | ja      |
| 330 | betala tillbaka | betala  | tillbaka | to pay back                                   | B1   | ja      |
| 331 | betala av       | betala  | av       | to pay off                                    | B1   | ja      |
| 332 | betala in       | betala  | in       | to pay in, to deposit                         | B1   | ja      |
| 333 | köpa in         | köpa    | in       | to buy in, to purchase                        | B1   | ja      |
| 334 | sälja ut        | sälja   | ut       | to sell off, to sell out                      | B1   | ja      |
| 335 | bygga upp       | bygga   | upp      | to build up, to establish                     | B1   | ja      |
| 336 | bygga in        | bygga   | in       | to build in, to integrate                     | B2   | ja      |
| 337 | stänga in       | stänga  | in       | to shut in, to confine                        | B2   | ja      |
| 338 | stänga ut       | stänga  | ut       | to shut out, to exclude                       | B2   | ja      |
| 339 | öppna upp       | öppna   | upp      | to open up                                    | B2   | ja      |
| 340 | riva ner        | riva    | ner      | to tear down, to demolish                     | B1   | ja      |
| 341 | riva upp        | riva    | upp      | to tear up; to reopen (an issue)              | B2   | ja      |
| 342 | bryta in        | bryta   | in       | to cut in, to interrupt                       | B2   | ja      |
| 343 | bryta sig in    | bryta   | in       | to break in (burglary)                        | B2   | ja      |
| 344 | byta in         | byta    | in       | to trade in                                   | B1   | ja      |
| 345 | byta upp sig    | byta    | upp      | to trade up                                   | B2   | ja      |
| 346 | få fram         | få      | fram     | to get across; to produce                     | B1   | ja      |
| 347 | få tillbaka     | få      | tillbaka | to get back                                   | A2   | ja      |
| 348 | få ut           | få      | ut       | to get out of, to gain from                   | B1   | ja      |
| 349 | få in           | få      | in       | to get in, to receive                         | B1   | ja      |
| 350 | få med          | få      | med      | to bring along; to include                    | B1   | ja      |
| 351 | få bort         | få      | bort     | to get rid of, to remove                      | B1   | ja      |
| 352 | få igång        | få      | igång    | to get going, to start up                     | B1   | ja      |
| 353 | få upp          | få      | upp      | to get open; to get up                        | B1   | ja      |
| 354 | få för sig      | få      | för      | to take it into one's head                    | B2   | ja      |
| 355 | ge sig ut       | ge      | ut       | to set out, to venture out                    | B1   | ja      |
| 356 | ge sig på       | ge      | på       | to attack, to go after                        | B2   | ja      |
| 357 | ge sig iväg     | ge      | iväg     | to set off, to head off                       | B1   | ja      |
| 358 | ge sig in i     | ge      | in       | to get involved in                            | B2   | ja      |
| 359 | göra av med     | göra    | av       | to spend; to get rid of                       | B2   | ja      |
| 360 | göra bort sig   | göra    | bort     | to embarrass oneself                          | B2   | ja      |
| 361 | göra sig till   | göra    | till     | to put on airs, to show off                   | B2   | ja      |
| 362 | säga åt         | säga    | åt       | to tell someone to; to tell off               | B1   | ja      |
| 363 | säga upp sig    | säga    | upp      | to resign, to quit a job                      | B1   | ja      |
| 364 | känna av        | känna   | av       | to feel the effects of                        | B2   | ja      |
| 365 | känna på sig    | känna   | på       | to have a feeling, to sense                   | B2   | ja ⚠    |
| 366 | höra ihop       | höra    | ihop     | to belong together                            | B1   | ja      |
| 367 | gå med på       | gå      | med      | to agree to, to consent to                    | B1   | ja      |
| 368 | gå omkring      | gå      | omkring  | to walk around                                | B1   | ja      |
| 369 | gå runt         | gå      | runt     | to go around; to break even                   | B1   | ja      |
| 370 | gå om           | gå      | om       | to overtake; to repeat (a school year)        | B1   | ja      |
| 371 | gå isär         | gå      | isär     | to come apart; to split up                    | B2   | ja      |
| 372 | gå ur           | gå      | ur       | to come out (of a stain); to withdraw from    | B2   | ja      |
| 373 | gå fram         | gå      | fram     | to advance, to go forward                     | B1   | ja      |
| 374 | gå före         | gå      | före     | to go first; to take priority                 | B1   | ja      |
| 375 | gå in för       | gå      | in       | to commit to, to throw oneself into           | B2   | ja      |
| 376 | komma med       | komma   | med      | to come along; to come up with                | B1   | ja      |
| 377 | komma av sig    | komma   | av       | to lose one's thread                          | B2   | ja      |
| 378 | ta i            | ta      | i        | to exert oneself; to touch                    | B1   | ja ⚠    |
| 379 | ta på           | ta      | på       | to touch                                      | B1   | ja ⚠    |
| 380 | ta sig an       | ta      | an       | to take on, to take charge of                 | B2   | ja      |
| 381 | ta till sig     | ta      | till     | to take in, to absorb                         | B2   | ja      |
| 382 | ta åt sig       | ta      | åt       | to take it personally                         | B2   | ja      |
| 383 | ta ut sig       | ta      | ut       | to wear oneself out                           | B2   | ja      |
| 384 | köra över       | köra    | över     | to run over; to steamroll (a person)          | B1   | ja ⚠    |
| 385 | köra upp        | köra    | upp      | to take the driving test                      | B1   | ja      |
| 386 | köra ut         | köra    | ut       | to drive out; to deliver                      | B1   | ja      |
| 387 | slänga ut       | slänga  | ut       | to throw out                                  | B1   | ja      |
| 388 | hoppa in        | hoppa   | in       | to fill in, to step in for someone            | B1   | ja      |
| 389 | koka upp        | koka    | upp      | to bring to the boil                          | B1   | ja      |
| 390 | skära upp       | skära   | upp      | to cut up, to slice                           | B1   | ja      |
| 391 | hälla ut        | hälla   | ut       | to pour out                                   | B1   | ja      |
| 392 | hälla i         | hälla   | i        | to pour in                                    | B1   | ja      |
| 393 | frysa in        | frysa   | in       | to freeze (food)                              | B1   | ja      |

### Band 7 — corpus tail (SVALex freq < 1) — order inside this band is noise

Most of this band rests on one coursebook hit. Do not read rank 400 as more
frequent than rank 470. I kept the entries a learner plausibly meets and cut
the rest; the cuts are named in section 4.3.

| #   | Partikelverb   | Basverb | Partikel | Betydelse (EN)                                   | CEFR | Betonad |
| --- | -------------- | ------- | -------- | ------------------------------------------------ | ---- | ------- |
| 394 | ladda ner      | ladda   | ner      | to download                                      | C1   | ja      |
| 395 | ladda upp      | ladda   | upp      | to upload; to charge (a battery)                 | C1   | ja      |
| 396 | logga in       | logga   | in       | to log in                                        | C1   | ja      |
| 397 | logga ut       | logga   | ut       | to log out                                       | B1   | ja      |
| 398 | komma åt       | komma   | åt       | to reach, to get at                              | C1   | ja      |
| 399 | komma över     | komma   | över     | to get over; to come across                      | C1   | ja      |
| 400 | hoppa av       | hoppa   | av       | to drop out; to jump off                         | C1   | ja      |
| 401 | hålla ihop     | hålla   | ihop     | to stick together                                | C1   | ja      |
| 402 | hålla uppe     | hålla   | uppe     | to keep up, to sustain                           | B2   | ja      |
| 403 | hålla igen     | hålla   | igen     | to hold back, to restrain oneself                | B1   | ja      |
| 404 | hålla samman   | hålla   | samman   | to hold together (formal)                        | B2   | ja      |
| 405 | slå fast       | slå     | fast     | to establish, to state firmly                    | C1   | ja      |
| 406 | slå samman     | slå     | samman   | to merge, to amalgamate                          | C1   | ja      |
| 407 | slå ihop       | slå     | ihop     | to merge; to fold up                             | B2   | ja      |
| 408 | ställa om      | ställa  | om       | to readjust, to switch over                      | C1   | ja      |
| 409 | stöta ihop     | stöta   | ihop     | to bump into (someone)                           | C1   | ja      |
| 410 | sudda ut       | sudda   | ut       | to erase, to rub out                             | C1   | ja      |
| 411 | ta miste       | ta      | miste    | to be mistaken                                   | C1   | ja      |
| 412 | ta tillbaka    | ta      | tillbaka | to take back, to retract                         | B1   | ja      |
| 413 | tänka ut       | tänka   | ut       | to think up, to devise                           | C1   | ja      |
| 414 | fundera ut     | fundera | ut       | to figure out, to work out                       | C1   | ja      |
| 415 | vakna upp      | vakna   | upp      | to wake up                                       | C1   | ja      |
| 416 | flytta fram    | flytta  | fram     | to move forward; to push to a later time         | C1   | ja      |
| 417 | hänga ut       | hänga   | ut       | to hang out (washing); to expose publicly        | C1   | ja      |
| 418 | köra bort      | köra    | bort     | to drive away, to chase off                      | C1   | ja      |
| 419 | köra fast      | köra    | fast     | to get stuck, to reach an impasse                | C1   | ja      |
| 420 | köpa upp       | köpa    | upp      | to buy up                                        | C1   | ja      |
| 421 | lära upp       | lära    | upp      | to train (a person)                              | C1   | ja      |
| 422 | lära om        | lära    | om       | to relearn, to learn afresh                      | A2   | ja      |
| 423 | leta upp       | leta    | upp      | to look up, to track down                        | B2   | ja      |
| 424 | leta fram      | leta    | fram     | to dig out, to find by searching                 | B2   | ja      |
| 425 | räkna upp      | räkna   | upp      | to list, to enumerate                            | C1   | ja      |
| 426 | skaffa fram    | skaffa  | fram     | to obtain, to procure                            | C1   | ja      |
| 427 | skaka av       | skaka   | av       | to shake off                                     | C1   | ja      |
| 428 | skaka om       | skaka   | om       | to shake up                                      | B2   | ja      |
| 429 | slita ut       | slita   | ut       | to wear out                                      | C1   | ja      |
| 430 | trötta ut      | trötta  | ut       | to tire out                                      | B2   | ja      |
| 431 | stiga ner      | stiga   | ner      | to step down, to descend                         | C1   | ja      |
| 432 | stiga av       | stiga   | av       | to get off (a vehicle)                           | B1   | ja      |
| 433 | träda tillbaka | träda   | tillbaka | to step down, to withdraw                        | C1   | ja      |
| 434 | turas om       | turas   | om       | to take turns — base is deponent _turas_         | C1   | ja      |
| 435 | hjälpas åt     | hjälpas | åt       | to help one another — base is deponent _hjälpas_ | B2   | ja      |
| 436 | växa bort      | växa    | bort     | to grow out of (a problem)                       | C1   | ja      |
| 437 | dra av         | dra     | av       | to deduct; to pull off                           | B2   | ja      |
| 438 | dra ihop       | dra     | ihop     | to contract, to pull together                    | B2   | ja      |
| 439 | dra ner        | dra     | ner      | to pull down; to cut back                        | B2   | ja      |
| 440 | duka upp       | duka    | upp      | to lay out a spread of food                      | B2   | ja      |
| 441 | duka av        | duka    | av       | to clear the table                               | B1   | ja      |
| 442 | ge igen        | ge      | igen     | to get back at, to retaliate                     | B2   | ja      |
| 443 | gripa in       | gripa   | in       | to intervene                                     | B2   | ja      |
| 444 | ha sönder      | ha      | sönder   | to break (something)                             | B2   | ja      |
| 445 | lämna kvar     | lämna   | kvar     | to leave behind                                  | B2   | ja      |
| 446 | rulla upp      | rulla   | upp      | to roll up                                       | B2   | ja      |
| 447 | rulla ut       | rulla   | ut       | to roll out                                      | B1   | ja      |
| 448 | skjuta av      | skjuta  | av       | to fire off (a shot)                             | B2   | ja      |
| 449 | skrämma upp    | skrämma | upp      | to startle, to frighten                          | B2   | ja      |
| 450 | skräpa ner     | skräpa  | ner      | to litter                                        | B2   | ja      |
| 451 | skära ut       | skära   | ut       | to cut out                                       | B2   | ja      |
| 452 | skära ner      | skära   | ner      | to cut back, to reduce                           | B1   | ja      |
| 453 | slumra till    | slumra  | till     | to doze off                                      | B2   | ja      |
| 454 | springa in     | springa | in       | to run in                                        | B2   | ja      |
| 455 | spåra upp      | spåra   | upp      | to track down                                    | B2   | ja      |
| 456 | störta in      | störta  | in       | to rush in; to cave in                           | B2   | ja      |
| 457 | störta ner     | störta  | ner      | to plunge down, to crash                         | B2   | ja      |
| 458 | tona ner       | tona    | ner      | to tone down, to play down                       | B2   | ja      |
| 459 | välja om       | välja   | om       | to re-elect                                      | B2   | ja      |
| 460 | gifta bort     | gifta   | bort     | to marry off                                     | B2   | ja      |
| 461 | se efter       | se      | efter    | to check, to have a look; to look after          | B2   | ja ⚠    |
| 462 | se upp         | se      | upp      | to watch out, to look out                        | B2   | ja      |
| 463 | sträcka ut     | sträcka | ut       | to stretch out                                   | B2   | ja      |
| 464 | gå samman      | gå      | samman   | to join forces, to merge                         | B1   | ja      |
| 465 | packa ner      | packa   | ner      | to pack (into a bag)                             | A2   | ja      |
| 466 | packa upp      | packa   | upp      | to unpack                                        | A2   | ja      |
| 467 | göra av        | göra    | av       | to do with (_vad ska jag göra av det?_)          | B1   | ja      |
| 468 | lägga fram     | lägga   | fram     | to put forward, to present                       | B1   | ja      |
| 469 | rösta fram     | rösta   | fram     | to vote in, to elect                             | B1   | ja      |
| 470 | smälla igen    | smälla  | igen     | to slam shut                                     | B1   | ja      |
| 471 | smörja in      | smörja  | in       | to rub in (cream)                                | B1   | ja      |
| 472 | tvätta bort    | tvätta  | bort     | to wash off                                      | B1   | ja      |
| 473 | sköta om       | sköta   | om       | to look after, to take care of                   | B2   | ja      |

### Band 8 — SweLLex only, no SVALex frequency

These appear in learner production but carry no coursebook frequency, so they
have **no defensible rank at all**. The CEFR column is the SweLLex first
level, a weaker signal than the SVALex one: it records where learners _used_
the form, not where a course _taught_ it.

| #   | Partikelverb | Basverb | Partikel | Betydelse (EN)                           | CEFR | Betonad |
| --- | ------------ | ------- | -------- | ---------------------------------------- | ---- | ------- |
| 474 | gå på        | gå      | på       | to go on, to continue; to be taken in by | A2   | ja ⚠    |
| 475 | se till      | se      | till     | to make sure, to see to it               | B2   | ja ⚠    |
| 476 | ta över      | ta      | över     | to take over                             | C1   | ja      |
| 477 | tappa bort   | tappa   | bort     | to lose, to mislay                       | B2   | ja      |
| 478 | stanna kvar  | stanna  | kvar     | to stay behind, to remain                | B2   | ja      |
| 479 | slänga bort  | slänga  | bort     | to throw away                            | B1   | ja      |
| 480 | skriva upp   | skriva  | upp      | to write down, to note down              | C1   | ja      |
| 481 | känna efter  | känna   | efter    | to check how one feels                   | C1   | ja      |
| 482 | lugna ner    | lugna   | ner      | to calm down (_lugna ner sig_)           | B2   | ja      |
| 483 | ta isär      | ta      | isär     | to take apart                            | B2   | ja      |
| 484 | gå ihop      | gå      | ihop     | to add up; to break even                 | B2   | ja      |
| 485 | rinna ut     | rinna   | ut       | to run out, to leak out                  | B2   | ja      |
| 486 | koppla bort  | koppla  | bort     | to disconnect, to switch off             | C1   | ja      |
| 487 | lämna bort   | lämna   | bort     | to hand over, to give away               | C1   | ja      |
| 488 | rasa ihop    | rasa    | ihop     | to collapse                              | C1   | ja      |
| 489 | smälta ihop  | smälta  | ihop     | to melt together, to fuse                | C1   | ja      |
| 490 | knyta ihop   | knyta   | ihop     | to tie together; to tie up (loose ends)  | C1   | ja      |
| 491 | sprida ut    | sprida  | ut       | to spread out, to disseminate            | C1   | ja      |
| 492 | skruva ner   | skruva  | ner      | to turn down (the volume)                | C1   | ja      |
| 493 | skruva upp   | skruva  | upp      | to turn up (the volume)                  | B1   | ja      |
| 494 | komma ikapp  | komma   | ikapp    | to catch up                              | C1   | ja      |
| 495 | nöta ut      | nöta    | ut       | to wear out                              | B1   | ja      |
| 496 | åka in       | åka     | in       | to go in; to be put inside (jailed)      | B1   | ja      |
| 497 | arbeta bort  | arbeta  | bort     | to work off                              | C1   | ja      |
| 498 | dyrka upp    | dyrka   | upp      | to pick (a lock)                         | B2   | ja      |
| 499 | knappa in    | knappa  | in       | to key in, to type in                    | C1   | ja      |
| 500 | ta tillvara  | ta      | tillvara | to make use of                           | C1   | ja      |

### Band 9 — source C inventory (judgment-ordered)

569 entries from source C that neither SVALex nor Wiktionary had. **This band
is judgment, not evidence**, and must not be mixed with bands 1–5 in an
automated sort.

Ordering rule, stated so it is auditable: entries whose base verb already
resolves in `VERB_DATA` come first (they are the shippable ones), then entries
on other high-frequency base verbs, then the rest alphabetically. Position
inside those groups carries no frequency claim.

The **CEFR column here is coarse and rule-derived**, not per-entry judgment.
The rule: use the SVALex band where one exists (25 entries); otherwise C1 if
the gloss is marked slang, pejorative or impersonal; otherwise B1 if the base
verb is a common everyday verb; otherwise B2. I am stating the rule rather
than implying 569 individual decisions I did not make. Every one of these
needs a human pass before it drives what a learner sees.

The last column replaces **Betonad** with **Klass**, which is more informative
here: source C only contains particle verbs, so every entry is stressed by
construction, whereas the three structural classes below need different
handling in the data model (section 3.6).

- `plain` — verb + particle (430)
- `refl` — reflexive, pronoun position significant (97)
- `v+p+prep` — verb + particle + preposition, e.g. _hålla fast vid_,
  _bli av med_, _råka ut för_ (42)

| #    | Partikelverb       | Basverb | Partikel | Betydelse (EN)                                                                                                           | CEFR | Klass    |
| ---- | ------------------ | ------- | -------- | ------------------------------------------------------------------------------------------------------------------------ | ---- | -------- |
| 501  | bli av med         | bli     | av       | lose; get rid of                                                                                                         | B1   | v+p+prep |
| 502  | bli ifrån sig      | bli     | ifrån    | become beside oneself, distraught                                                                                        | B1   | refl     |
| 503  | bli till           | bli     | till     | come into existence                                                                                                      | B1   | plain    |
| 504  | bli till sig       | bli     | till     | get very excited or worked up                                                                                            | B1   | refl     |
| 505  | få av              | få      | av       | manage to get off, remove                                                                                                | B1   | plain    |
| 506  | få hem             | få      | hem      | get delivered into stock or home                                                                                         | B1   | plain    |
| 507  | få igen            | få      | igen     | get properly shut; get back (something lent); get paid back (revenge)                                                    | B1   | plain    |
| 508  | få igenom          | få      | igenom   | get others to accept                                                                                                     | B1   | plain    |
| 509  | få med sig         | få      | med      | manage to bring along; win over as supporters                                                                            | B1   | refl     |
| 510  | få till            | få      | till     | manage to produce; spin a fanciful tale                                                                                  | B1   | plain    |
| 511  | få undan           | få      | undan    | clear away; get (a chore) done                                                                                           | B1   | plain    |
| 512  | få ur              | få      | ur       | manage to squeeze out; coax (information) out of someone                                                                 | B1   | plain    |
| 513  | få över            | få      | över     | get transferred; have left over                                                                                          | B1   | plain    |
| 514  | ge efter           | ge      | efter    | yield, relent; give way physically                                                                                       | B1   | plain    |
| 515  | ge ifrån sig       | ge      | ifrån    | hand over; emit (a sound)                                                                                                | B1   | refl     |
| 516  | ge med sig         | ge      | med      | relent; ease off (pain); give way physically                                                                             | B1   | refl     |
| 517  | ge sig ut för      | ge      | ut       | pass oneself off as                                                                                                      | B1   | refl     |
| 518  | ge till            | ge      | till     | let out (a cry, a laugh)                                                                                                 | B1   | plain    |
| 519  | gå av och an       | gå      | av       | pace back and forth                                                                                                      | B1   | v+p+prep |
| 520  | gå efter           | gå      | efter    | walk behind; run slow (a clock); go fetch                                                                                | B1   | plain    |
| 521  | gå emellan         | gå      | emellan  | mediate, step in between                                                                                                 | B1   | plain    |
| 522  | gå emot            | gå      | emot     | walk into; oppose, go against                                                                                            | B1   | plain    |
| 523  | gå för sig         | gå      | för      | be suitable, be permissible                                                                                              | B1   | refl     |
| 524  | gå förbi           | gå      | förbi    | pass by, overtake                                                                                                        | B1   | plain    |
| 526  | gå ifrån           | gå      | ifrån    | leave one's post briefly; abandon (a partner)                                                                            | B1   | plain    |
| 527  | gå igång           | gå      | igång    | start (an engine)                                                                                                        | B1   | plain    |
| 528  | gå itu             | gå      | itu      | break in two                                                                                                             | B1   | plain    |
| 529  | gå ner sig         | gå      | ner      | sink through ice or bog; let oneself decline                                                                             | B1   | refl     |
| 530  | gå tillbaka        | gå      | tillbaka | go back; slowly recede                                                                                                   | B1   | plain    |
| 531  | gå under           | gå      | under    | go beneath; sink, be destroyed                                                                                           | B1   | plain    |
| 532  | gå upp för         | gå      | upp      | become clear to, dawn on (impersonal)                                                                                    | C1   | v+p+prep |
| 533  | gå upp i           | gå      | upp      | be absorbed into; immerse oneself in                                                                                     | B1   | v+p+prep |
| 534  | gå ut på           | gå      | ut       | aim at, be about                                                                                                         | B1   | v+p+prep |
| 535  | gå ut över         | gå      | ut       | take its toll on, hit negatively                                                                                         | B1   | v+p+prep |
| 536  | gå utför           | gå      | utför    | go downhill, deteriorate                                                                                                 | B1   | plain    |
| 537  | göra ner           | göra    | ner      | criticize harshly, demolish                                                                                              | B1   | plain    |
| 538  | ha emot            | ha      | emot     | object to, dislike                                                                                                       | B1   | plain    |
| 539  | ha för sig         | ha      | för      | be up to, be occupied with; have a vague belief                                                                          | B1   | refl     |
| 540  | ha över            | ha      | över     | have left over                                                                                                           | B1   | plain    |
| 541  | hålla efter        | hålla   | efter    | keep in check, supervise                                                                                                 | B1   | plain    |
| 542  | hålla fast vid     | hålla   | fast     | stick to, remain loyal to                                                                                                | B1   | v+p+prep |
| 543  | hålla i sig        | hålla   | i        | hold on to avoid falling; persist (weather, impersonal)                                                                  | C1   | refl     |
| 544  | hålla inne med     | hålla   | inne     | keep secret                                                                                                              | B1   | v+p+prep |
| 545  | hålla på med       | hålla   | på       | be occupied with                                                                                                         | B1   | v+p+prep |
| 546  | hålla sig undan    | hålla   | undan    | hide, stay out of reach                                                                                                  | B1   | refl     |
| 547  | hålla sig uppe     | hålla   | uppe     | stay awake, stay upright                                                                                                 | B1   | refl     |
| 548  | höra av            | höra    | av       | receive word from                                                                                                        | B1   | plain    |
| 549  | höra efter         | höra    | efter    | inquire, ask                                                                                                             | B1   | plain    |
| 550  | höra hit           | höra    | hit      | be relevant; belong to a group                                                                                           | B1   | plain    |
| 551  | höra på            | höra    | på       | listen attentively                                                                                                       | B1   | plain    |
| 552  | höra sig för       | höra    | för      | make inquiries, ask around                                                                                               | B1   | refl     |
| 553  | höra upp           | höra    | upp      | listen up                                                                                                                | B1   | plain    |
| 554  | komma an på        | komma   | an       | depend on                                                                                                                | B1   | v+p+prep |
| 555  | komma av           | komma   | av       | get off (a vehicle); result from                                                                                         | B1   | plain    |
| 556  | komma efter        | komma   | efter    | follow later; fall behind                                                                                                | B1   | plain    |
| 557  | komma före         | komma   | före     | arrive ahead of                                                                                                          | B1   | plain    |
| 558  | komma ifrån        | komma   | ifrån    | get away from one's post                                                                                                 | B1   | plain    |
| 559  | komma igenom       | komma   | igenom   | get through; overcome (a hard period)                                                                                    | B1   | plain    |
| 560  | komma ihop sig     | komma   | ihop     | quarrel, fall out                                                                                                        | B1   | refl     |
| 561  | komma iväg         | komma   | iväg     | get going, get off                                                                                                       | B1   | plain    |
| 562  | komma loss         | komma   | loss     | come free; get away; loosen up                                                                                           | B1   | plain    |
| 563  | komma om           | komma   | om       | overtake                                                                                                                 | B1   | plain    |
| 564  | komma runt         | komma   | runt     | get around (an obstacle or problem)                                                                                      | B1   | plain    |
| 565  | komma sig upp      | komma   | upp      | advance in life                                                                                                          | B1   | refl     |
| 567  | känna på           | känna   | på       | try out what something feels like                                                                                        | B1   | plain    |
| 568  | ligga av sig       | ligga   | av       | get rusty from disuse                                                                                                    | B1   | refl     |
| 569  | ligga bakom        | ligga   | bakom    | be behind, be the cause of                                                                                               | B1   | plain    |
| 570  | ligga efter        | ligga   | efter    | drive behind; be behind schedule; nag                                                                                    | B1   | plain    |
| 571  | ligga för          | ligga   | för      | suit someone's nature (impersonal)                                                                                       | C1   | plain    |
| 572  | ligga före         | ligga   | före     | be ahead                                                                                                                 | B1   | plain    |
| 573  | ligga i            | ligga   | i        | work hard, keep at it                                                                                                    | B1   | plain    |
| 574  | ligga inne         | ligga   | inne     | be in hospital; do military service indoors                                                                              | B1   | plain    |
| 575  | ligga inne med     | ligga   | inne     | hold, have in one's possession (claims, stock)                                                                           | B1   | v+p+prep |
| 576  | ligga nere         | ligga   | nere     | be at a standstill                                                                                                       | B1   | plain    |
| 577  | ligga på           | ligga   | på       | beat down strongly (sun); keep pressing, nag                                                                             | B1   | plain    |
| 578  | ligga till         | ligga   | till     | be positioned, stand (in a competition); be the state of things (impersonal)                                             | C1   | plain    |
| 579  | ligga till sig     | ligga   | till     | improve by resting, ripen                                                                                                | B1   | refl     |
| 580  | ligga under        | ligga   | under    | be trailing, be behind in score                                                                                          | B1   | plain    |
| 581  | ligga ute          | ligga   | ute      | camp outdoors; be out somewhere                                                                                          | B1   | plain    |
| 582  | ligga ute med      | ligga   | ute      | have money lent out, be owed                                                                                             | B1   | v+p+prep |
| 583  | ligga över         | ligga   | över     | stay overnight; be leading in score; weigh on someone                                                                    | B1   | plain    |
| 584  | lägga an på        | lägga   | an       | make a play for, court                                                                                                   | B1   | v+p+prep |
| 585  | lägga emellan      | lägga   | emellan  | pay the difference                                                                                                       | B1   | plain    |
| 586  | lägga för          | lägga   | för      | put in the way of; serve (food) onto a plate                                                                             | B2   | plain    |
| 587  | lägga sig till med | lägga   | till     | acquire (a new look or habit)                                                                                            | B1   | refl     |
| 588  | lägga sig ut för   | lägga   | ut       | put in a good word for                                                                                                   | B1   | refl     |
| 589  | lägga undan        | lägga   | undan    | put aside; save up                                                                                                       | B1   | plain    |
| 590  | lägga under sig    | lägga   | under    | conquer, subjugate                                                                                                       | B1   | refl     |
| 591  | läsa av            | läsa    | av       | read off (a meter)                                                                                                       | B1   | plain    |
| 592  | läsa upp           | läsa    | upp      | read aloud                                                                                                               | C1   | plain    |
| 593  | läsa ut            | läsa    | ut       | make sense of (a text)                                                                                                   | B1   | plain    |
| 594  | se fram emot       | se      | fram     | look forward to                                                                                                          | B1   | v+p+prep |
| 595  | se ner på          | se      | ner      | despise, look down on                                                                                                    | B1   | v+p+prep |
| 596  | se upp till        | se      | upp      | admire                                                                                                                   | B1   | v+p+prep |
| 597  | skriva av          | skriva  | av       | copy in writing                                                                                                          | B1   | plain    |
| 598  | skriva in sig      | skriva  | in       | register, enroll                                                                                                         | B1   | refl     |
| 599  | skriva om          | skriva  | om       | rewrite; write about                                                                                                     | B1   | plain    |
| 600  | skriva över        | skriva  | över     | overwrite; sign over (property)                                                                                          | B1   | plain    |
| 601  | stå bakom          | stå     | bakom    | be behind, be responsible for; back, support                                                                             | B1   | plain    |
| 602  | stå emot           | stå     | emot     | withstand, resist                                                                                                        | B1   | plain    |
| 603  | stå fast vid       | stå     | fast     | stand by, not change one's position                                                                                      | B1   | v+p+prep |
| 604  | stå fram           | stå     | fram     | step forward publicly                                                                                                    | B1   | plain    |
| 605  | stå framme         | stå     | framme   | be left out (food); stand at the front                                                                                   | B1   | plain    |
| 606  | stå för            | stå     | för      | block (a view); provide, be responsible for                                                                              | B1   | plain    |
| 607  | stå före           | stå     | före     | be ahead in a queue                                                                                                      | B1   | plain    |
| 608  | stå i              | stå     | i        | bustle, work busily                                                                                                      | B1   | plain    |
| 609  | stå inne           | stå     | inne     | remain deposited (money in the bank)                                                                                     | B1   | plain    |
| 610  | stå på             | stå     | på       | be going on (impersonal); be happening                                                                                   | B1   | plain    |
| 611  | stå över           | stå     | över     | pass, skip one's turn                                                                                                    | B1   | plain    |
| 612  | ställa av          | ställa  | av       | set down; deregister (a vehicle) temporarily                                                                             | B1   | plain    |
| 613  | ställa in sig      | ställa  | in       | prepare oneself mentally for                                                                                             | B1   | refl     |
| 614  | ställa om sig      | ställa  | om       | adapt one's way of life                                                                                                  | B1   | refl     |
| 615  | ställa sig in      | ställa  | in       | ingratiate oneself                                                                                                       | B1   | refl     |
| 616  | ställa tillbaka    | ställa  | tillbaka | put back; set (a clock) back                                                                                             | B1   | plain    |
| 617  | säga efter         | säga    | efter    | repeat after someone                                                                                                     | B1   | plain    |
| 618  | säga emot          | säga    | emot     | contradict, object                                                                                                       | B1   | plain    |
| 619  | säga ifrån         | säga    | ifrån    | speak up in protest                                                                                                      | B1   | plain    |
| 621  | säga till om       | säga    | till     | have authority over                                                                                                      | B1   | v+p+prep |
| 622  | sätta av           | sätta   | av       | drop off (a passenger); set aside (money); dash off                                                                      | B2   | plain    |
| 623  | sätta efter        | sätta   | efter    | set off in pursuit                                                                                                       | B1   | plain    |
| 624  | sätta fram         | sätta   | fram     | put out (dishes)                                                                                                         | B1   | plain    |
| 625  | sätta för          | sätta   | för      | put in front of, cover with                                                                                              | B1   | plain    |
| 626  | sätta ner          | sätta   | ner      | put down; reduce (prices)                                                                                                | B1   | plain    |
| 627  | sätta om           | sätta   | om       | repot (plants); reset (printed text)                                                                                     | B1   | plain    |
| 628  | sätta på sig       | sätta   | på       | put on (one's clothes)                                                                                                   | B1   | refl     |
| 629  | sätta sig emot     | sätta   | emot     | oppose actively                                                                                                          | B1   | refl     |
| 630  | sätta sig in i     | sätta   | in       | familiarize oneself with                                                                                                 | B1   | refl     |
| 631  | sätta sig upp mot  | sätta   | upp      | defy, rebel against                                                                                                      | B1   | refl     |
| 632  | sätta sig över     | sätta   | över     | disregard, put oneself above                                                                                             | B1   | refl     |
| 633  | sätta till         | sätta   | till     | add (ingredients)                                                                                                        | B1   | plain    |
| 634  | sätta undan        | sätta   | undan    | put out of reach; save for later                                                                                         | B1   | plain    |
| 635  | ta för sig         | ta      | för      | help oneself; grab without regard for others                                                                             | B1   | refl     |
| 636  | ta igen            | ta      | igen     | make up (lost ground)                                                                                                    | B1   | plain    |
| 637  | ta igen sig        | ta      | igen     | rest, recover                                                                                                            | B1   | refl     |
| 638  | ta in på           | ta      | in       | close the gap on                                                                                                         | B1   | v+p+prep |
| 639  | ta itu med         | ta      | itu      | get down to; take someone to task                                                                                        | B1   | v+p+prep |
| 640  | ta sig fram        | ta      | fram     | make one's way, get ahead                                                                                                | B1   | refl     |
| 641  | ta sig för         | ta      | för      | occupy oneself with                                                                                                      | B1   | refl     |
| 642  | ta sig före        | ta      | före     | undertake, decide to do                                                                                                  | B1   | refl     |
| 643  | ta sig till        | ta      | till     | do, resort to doing                                                                                                      | B1   | refl     |
| 644  | ta sig ut          | ta      | ut       | get out; look, appear                                                                                                    | B1   | refl     |
| 645  | ta undan           | ta      | undan    | clear away; set aside for oneself                                                                                        | B1   | plain    |
| 646  | ta ur              | ta      | ur       | take out of; gut (a bird); disabuse someone of a belief                                                                  | B1   | plain    |
| 647  | ta vid             | ta      | vid      | take over where another stops                                                                                            | B1   | plain    |
| 648  | ta vid sig         | ta      | vid      | take (a remark) to heart                                                                                                 | B1   | refl     |
| 649  | tycka till         | tycka   | till     | voice one's opinion                                                                                                      | B1   | plain    |
| 650  | tänka sig in i     | tänka   | in       | imagine oneself in                                                                                                       | B1   | refl     |
| 651  | tänka till         | tänka   | till     | put in real thought                                                                                                      | B1   | plain    |
| 652  | vara av            | vara    | av       | be broken in two                                                                                                         | B1   | plain    |
| 653  | vara av med        | vara    | av       | be rid of                                                                                                                | B1   | v+p+prep |
| 654  | vara efter         | vara    | efter    | chase; be behind with                                                                                                    | B1   | plain    |
| 655  | vara emot          | vara    | emot     | be against, oppose                                                                                                       | B1   | plain    |
| 656  | vara för           | vara    | för      | be drawn (curtains); be in favor of                                                                                      | B1   | plain    |
| 657  | vara ifrån sig     | vara    | ifrån    | be beside oneself                                                                                                        | B1   | refl     |
| 658  | vara kvar          | vara    | kvar     | remain, be left                                                                                                          | B1   | plain    |
| 659  | vara med om        | vara    | med      | experience, be involved in                                                                                               | B1   | v+p+prep |
| 660  | vara med på        | vara    | med      | accept, agree to                                                                                                         | B1   | v+p+prep |
| 661  | vara om sig        | vara    | om       | be thrifty, look out for one's own advantage                                                                             | B1   | refl     |
| 662  | vara på            | vara    | på       | be switched on; keep close watch on someone                                                                              | A2   | plain    |
| 663  | vara till för      | vara    | till     | exist for the purpose of                                                                                                 | B1   | v+p+prep |
| 664  | vara till sig      | vara    | till     | be worked up, excited                                                                                                    | B1   | refl     |
| 665  | veta av            | veta    | av       | tolerate, want to hear of                                                                                                | B1   | plain    |
| 666  | veta med sig       | veta    | med      | be privately aware                                                                                                       | B1   | refl     |
| 667  | visa bort          | visa    | bort     | turn away, dismiss                                                                                                       | B1   | plain    |
| 668  | visa tillbaka      | visa    | tillbaka | reject (accusations)                                                                                                     | B1   | plain    |
| 669  | visa ut            | visa    | ut       | show out; expel from the premises                                                                                        | B1   | plain    |
| 670  | bygga för          | bygga   | för      | block something by building                                                                                              | B2   | plain    |
| 671  | bygga på           | bygga   | på       | add height or a storey; supplement (education)                                                                           | B2   | plain    |
| 672  | bygga till         | bygga   | till     | enlarge by building an extension                                                                                         | B2   | plain    |
| 673  | bära av            | bära    | av       | set off (impersonal)                                                                                                     | C1   | plain    |
| 674  | bära emot          | bära    | emot     | feel hard or unpleasant to do (impersonal)                                                                               | C1   | plain    |
| 675  | bära iväg          | bära    | iväg     | carry off; head off (impersonal)                                                                                         | C1   | plain    |
| 676  | bära sig åt        | bära    | åt       | behave; go about doing something                                                                                         | B2   | refl     |
| 677  | bära upp           | bära    | upp      | carry upstairs; wear (clothes) elegantly                                                                                 | B2   | plain    |
| 678  | börja på           | börja   | på       | begin; start at (a school, job)                                                                                          | B2   | plain    |
| 679  | kunna med          | kunna   | med      | stand, tolerate (usually negated)                                                                                        | B2   | plain    |
| 680  | riva av            | riva    | av       | tear off; rattle off (a tune)                                                                                            | B2   | plain    |
| 681  | riva i             | riva    | i        | snap angrily; rummage roughly                                                                                            | B2   | plain    |
| 682  | riva ut            | riva    | ut       | tear out (a page)                                                                                                        | B2   | plain    |
| 683  | riva åt sig        | riva    | åt       | snatch up                                                                                                                | B2   | refl     |
| 684  | stänga igen        | stänga  | igen     | shut properly                                                                                                            | B2   | plain    |
| 685  | stänga till        | stänga  | till     | close temporarily, push shut                                                                                             | B2   | plain    |
| 686  | stänga ute         | stänga  | ute      | keep out, shut out                                                                                                       | B2   | plain    |
| 687  | dra bort           | dra     | bort     | pull away; subtract; move away (weather)                                                                                 | B1   | plain    |
| 688  | dra fram           | dra     | fram     | pull out; keep dredging up; sweep through in a group                                                                     | B1   | plain    |
| 689  | dra för            | dra     | för      | pull (curtains) closed                                                                                                   | B1   | plain    |
| 690  | dra ihop sig       | dra     | ihop     | contract; be approaching (impersonal, e.g. storm)                                                                        | C1   | refl     |
| 691  | dra in på          | dra     | in       | cut down on                                                                                                              | B1   | v+p+prep |
| 692  | dra ner på         | dra     | ner      | cut back on                                                                                                              | B1   | v+p+prep |
| 694  | dra på             | dra     | på       | pull on (clothing, with effort); speed up; carry (an illness) around                                                     | B1   | plain    |
| 695  | dra sig fram       | dra     | fram     | scrape by financially                                                                                                    | B1   | refl     |
| 696  | dra sig tillbaka   | dra     | tillbaka | retreat, move away; retire from activity                                                                                 | B1   | refl     |
| 697  | dra sig ur         | dra     | ur       | pull out of, quit an undertaking                                                                                         | B1   | refl     |
| 698  | dra till           | dra     | till     | tighten; pull shut                                                                                                       | B1   | plain    |
| 699  | dra till med       | dra     | till     | blurt out a guess                                                                                                        | B1   | v+p+prep |
| 700  | dra till sig       | dra     | till     | attract                                                                                                                  | B1   | refl     |
| 701  | dra ut på          | dra     | ut       | run over, take longer than planned                                                                                       | B1   | v+p+prep |
| 702  | dra åt sig         | dra     | åt       | pull toward oneself; absorb                                                                                              | B1   | refl     |
| 703  | dra över           | dra     | över     | run over (allotted time); pull (a cover) over                                                                            | C1   | plain    |
| 704  | hoppa i            | hoppa   | i        | jump into (water)                                                                                                        | B1   | plain    |
| 705  | hoppa på           | hoppa   | på       | jump onto (a bus); seize on trying; attack with criticism                                                                | B1   | plain    |
| 706  | hoppa till         | hoppa   | till     | give a start, jump in surprise                                                                                           | B1   | plain    |
| 707  | hämta ner          | hämta   | ner      | download to one's computer                                                                                               | B1   | plain    |
| 708  | hänga av sig       | hänga   | av       | hang up one's outdoor clothes                                                                                            | B1   | refl     |
| 709  | hänga efter        | hänga   | efter    | trail after someone annoyingly                                                                                           | B1   | plain    |
| 710  | hänga på           | hänga   | på       | follow close behind; hang out at a place                                                                                 | B1   | plain    |
| 711  | hänga sig på       | hänga   | på       | tag along uninvited                                                                                                      | B1   | refl     |
| 712  | hänga upp sig      | hänga   | upp      | jam, freeze (a machine); fixate on a detail                                                                              | B1   | refl     |
| 713  | hänga över         | hänga   | över     | move (clothes) over; loom over, worry; pore over                                                                         | B1   | plain    |
| 714  | kasta av           | kasta   | av       | throw off (a rider)                                                                                                      | B1   | plain    |
| 715  | kasta fram         | kasta   | fram     | toss out hastily; float (a proposal)                                                                                     | B1   | plain    |
| 716  | kasta i sig        | kasta   | i        | wolf down food                                                                                                           | B1   | refl     |
| 717  | kasta om           | kasta   | om       | throw again; reverse the order of                                                                                        | B1   | plain    |
| 718  | kasta omkull       | kasta   | omkull   | knock over                                                                                                               | B1   | plain    |
| 719  | kasta upp          | kasta   | upp      | throw upward; vomit                                                                                                      | C1   | plain    |
| 720  | klä av             | klä     | av       | undress                                                                                                                  | B1   | refl     |
| 721  | klä om             | klä     | om       | change clothes; reupholster                                                                                              | B2   | refl     |
| 722  | klä på             | klä     | på       | dress                                                                                                                    | B1   | refl     |
| 723  | klä upp            | klä     | upp      | dress up in fine clothes                                                                                                 | B1   | refl     |
| 724  | köpa hem           | köpa    | hem      | buy in (groceries)                                                                                                       | B1   | plain    |
| 725  | köpa ut            | köpa    | ut       | buy alcohol for someone; buy out a co-owner                                                                              | B1   | plain    |
| 726  | köra av            | köra    | av       | drive off (the road)                                                                                                     | B1   | plain    |
| 727  | köra ihop          | köra    | ihop     | collide; heap together carelessly                                                                                        | B1   | plain    |
| 728  | köra ihop sig      | köra    | ihop     | become chaotic (impersonal)                                                                                              | C1   | refl     |
| 729  | köra iväg          | köra    | iväg     | drive off; chase away                                                                                                    | B1   | plain    |
| 730  | sitta emellan      | sitta   | emellan  | be caught in the middle, suffer from others' conflict                                                                    | B1   | plain    |
| 731  | sitta i            | sitta   | i        | linger, persist (pain)                                                                                                   | B1   | plain    |
| 732  | sitta ihop         | sitta   | ihop     | be stuck together                                                                                                        | B1   | plain    |
| 733  | sitta inne         | sitta   | inne     | stay indoors; serve a prison sentence                                                                                    | B1   | plain    |
| 734  | sitta inne med     | sitta   | inne     | possess (knowledge)                                                                                                      | B1   | v+p+prep |
| 735  | sitta upp          | sitta   | upp      | mount (a horse); sit upright                                                                                             | B1   | plain    |
| 736  | sitta uppe         | sitta   | uppe     | stay up late                                                                                                             | B1   | plain    |
| 737  | sitta åt           | sitta   | åt       | fit tightly                                                                                                              | B1   | plain    |
| 738  | slå an             | slå     | an       | strike (a chord)                                                                                                         | B1   | plain    |
| 739  | slå an på          | slå     | an       | appeal to, charm                                                                                                         | B1   | v+p+prep |
| 740  | slå av på          | slå     | av       | ease off (the pace)                                                                                                      | B1   | v+p+prep |
| 742  | slå bort           | slå     | bort     | knock away; pour off; brush aside (criticism)                                                                            | B1   | plain    |
| 743  | slå i              | slå     | i        | hammer in; bump (a toe); pour into; make someone believe a lie                                                           | B1   | plain    |
| 744  | slå ifrån          | slå     | ifrån    | switch off (power)                                                                                                       | B1   | plain    |
| 745  | slå ifrån sig      | slå     | ifrån    | refuse to accept, fend off (accusations)                                                                                 | B1   | refl     |
| 746  | slå igen           | slå     | igen     | shut (a book, a door); close down (a business)                                                                           | B1   | plain    |
| 747  | slå igenom         | slå     | igenom   | achieve one's breakthrough, become famous                                                                                | B1   | plain    |
| 748  | slå in på          | slå     | in       | take up (a new path or career)                                                                                           | B1   | v+p+prep |
| 749  | slå ner på         | slå     | ner      | swoop on; single out for criticism                                                                                       | B1   | v+p+prep |
| 750  | slå om             | slå     | om       | tie around; change suddenly (weather, impersonal)                                                                        | C1   | plain    |
| 751  | slå omkull         | slå     | omkull   | knock over                                                                                                               | B1   | plain    |
| 752  | slå runt           | slå     | runt     | overturn completely; party hard                                                                                          | B1   | plain    |
| 753  | slå sig på         | slå     | på       | take up, go in for                                                                                                       | B1   | refl     |
| 754  | slå över           | slå     | över     | pour into another container; overdo it emotionally                                                                       | B1   | plain    |
| 755  | spela av           | spela   | av       | win off someone at gambling; copy (a recording)                                                                          | B1   | plain    |
| 756  | spela bort         | spela   | bort     | gamble away                                                                                                              | B1   | plain    |
| 757  | spela om           | spela   | om       | play again; gamble for (money)                                                                                           | B1   | plain    |
| 758  | spela ut           | spela   | ut       | play off (rivals) against each other                                                                                     | B1   | plain    |
| 759  | spela över         | spela   | över     | record over; overact                                                                                                     | B1   | plain    |
| 760  | springa bort       | springa | bort     | run away, go missing                                                                                                     | B1   | plain    |
| 761  | springa efter      | springa | efter    | run after; run and fetch; chase (romantically)                                                                           | B1   | plain    |
| 762  | springa om         | springa | om       | overtake while running                                                                                                   | B1   | plain    |
| 763  | springa på         | springa | på       | collide with while running; bump into (a person)                                                                         | B1   | plain    |
| 764  | vika av            | vika    | av       | turn off (a road)                                                                                                        | B1   | plain    |
| 765  | vänta in           | vänta   | in       | wait for (to arrive)                                                                                                     | B2   | plain    |
| 766  | vänta ut           | vänta   | ut       | wait out, outlast                                                                                                        | B1   | plain    |
| 767  | åka dit            | åka     | dit      | get caught and punished                                                                                                  | B1   | plain    |
| 768  | åka med            | åka     | med      | get a lift                                                                                                               | B1   | plain    |
| 769  | åka om             | åka     | om       | overtake                                                                                                                 | B1   | plain    |
| 770  | åka på             | åka     | på       | be landed with (a chore); catch (something bad)                                                                          | B1   | plain    |
| 771  | åka ur             | åka     | ur       | go off course; be relegated                                                                                              | B1   | plain    |
| 772  | åka ut             | åka     | ut       | go out (to the country); be thrown out; be eliminated                                                                    | B1   | plain    |
| 773  | äta upp sig        | äta     | upp      | regain weight by eating                                                                                                  | B1   | refl     |
| 774  | arbeta av          | arbeta  | av       | pay off a debt through work rather than money                                                                            | B2   | plain    |
| 775  | arbeta av sig      | arbeta  | av       | get rid of a feeling by working                                                                                          | B2   | refl     |
| 776  | arbeta fram        | arbeta  | fram     | produce or finish something through work                                                                                 | B2   | plain    |
| 777  | arbeta ifatt       | arbeta  | ifatt    | catch up on delayed work                                                                                                 | B2   | plain    |
| 778  | arbeta in          | arbeta  | in       | work extra hours to bank time off; make a name or product established; knead or mix in; keep working as long as possible | B2   | plain    |
| 779  | arbeta om          | arbeta  | om       | rework, revise                                                                                                           | B2   | plain    |
| 780  | arbeta på          | arbeta  | på       | keep on working                                                                                                          | B2   | plain    |
| 781  | arbeta undan       | arbeta  | undan    | get pending work out of the way                                                                                          | B2   | plain    |
| 782  | arbeta ut          | arbeta  | ut       | devise and complete (a plan)                                                                                             | B2   | plain    |
| 783  | arbeta ut sig      | arbeta  | ut       | exhaust oneself by overworking                                                                                           | B2   | refl     |
| 784  | arbeta över        | arbeta  | över     | work overtime                                                                                                            | B2   | plain    |
| 785  | backa på           | backa   | på       | collide with something while reversing                                                                                   | B2   | plain    |
| 786  | backa upp          | backa   | upp      | support; reverse a vehicle up to something                                                                               | B2   | plain    |
| 787  | backa ur           | backa   | ur       | back out, withdraw from participation                                                                                    | B2   | plain    |
| 788  | bena ut            | bena    | ut       | untangle, analyze (a problem)                                                                                            | B2   | plain    |
| 789  | binda för          | binda   | för      | tie something over (e.g. blindfold)                                                                                      | B2   | plain    |
| 790  | binda in           | binda   | in       | bind (books) in hard covers                                                                                              | B2   | plain    |
| 791  | binda upp          | binda   | upp      | tie up high (hair, plants)                                                                                               | C1   | plain    |
| 792  | binda upp sig      | binda   | upp      | commit oneself                                                                                                           | B2   | refl     |
| 794  | bita av            | bita    | av       | bite off; cut someone short rudely                                                                                       | B2   | plain    |
| 795  | bita ifrån         | bita    | ifrån    | defend oneself sharply in words                                                                                          | B2   | refl     |
| 796  | bjuda emot         | bjuda   | emot     | be repugnant, feel distasteful (impersonal)                                                                              | C1   | plain    |
| 797  | bjuda till         | bjuda   | till     | make an effort                                                                                                           | B2   | plain    |
| 798  | bjuda upp          | bjuda   | upp      | ask someone to dance                                                                                                     | B2   | plain    |
| 799  | bjuda ut           | bjuda   | ut       | take someone out (restaurant etc); offer for sale                                                                        | B2   | plain    |
| 800  | bjuda ut sig       | bjuda   | ut       | offer oneself sexually (pejorative)                                                                                      | C1   | refl     |
| 801  | bjuda över         | bjuda   | över     | invite to one's home; outbid                                                                                             | B2   | plain    |
| 802  | bre på             | bre     | på       | spread on; exaggerate                                                                                                    | B2   | plain    |
| 803  | bre ut             | bre     | ut       | spread out flat                                                                                                          | B1   | plain    |
| 804  | bre ut sig         | bre     | ut       | take up much room; spread over an area                                                                                   | B2   | refl     |
| 805  | brinna av          | brinna  | av       | go off, be fired (a shot); burn with eagerness                                                                           | B2   | plain    |
| 806  | brinna ner         | brinna  | ner      | burn to the ground                                                                                                       | B2   | plain    |
| 807  | brinna upp         | brinna  | upp      | be destroyed by fire                                                                                                     | B1   | plain    |
| 808  | brinna ut          | brinna  | ut       | burn out slowly                                                                                                          | B2   | plain    |
| 809  | bryta av           | bryta   | av       | break in two                                                                                                             | B2   | plain    |
| 810  | bryta igenom       | bryta   | igenom   | force a way through; achieve a breakthrough to fame                                                                      | B2   | plain    |
| 811  | bryta ihop         | bryta   | ihop     | collapse, break down emotionally                                                                                         | B2   | plain    |
| 812  | bryta ner          | bryta   | ner      | weaken severely; decompose (chemistry)                                                                                   | B2   | plain    |
| 813  | bryta samman       | bryta   | samman   | collapse in despair; fail (negotiations)                                                                                 | B2   | plain    |
| 814  | bränna ner         | bränna  | ner      | burn down completely                                                                                                     | B2   | plain    |
| 815  | bränna upp         | bränna  | upp      | destroy by burning                                                                                                       | B2   | plain    |
| 816  | bränna vid         | bränna  | vid      | let food scorch in the pan                                                                                               | B2   | plain    |
| 817  | böja av            | böja    | av       | turn, curve off (a road)                                                                                                 | B2   | plain    |
| 818  | cykla på           | cykla   | på       | keep cycling; hit someone while cycling                                                                                  | B2   | plain    |
| 819  | dela av            | dela    | av       | partition into smaller units                                                                                             | B2   | plain    |
| 820  | dela med sig       | dela    | med      | share what one has                                                                                                       | B2   | refl     |
| 821  | dikta ihop         | dikta   | ihop     | make up (a false story)                                                                                                  | B2   | plain    |
| 822  | dikta upp          | dikta   | upp      | invent, fabricate (a tale)                                                                                               | B2   | plain    |
| 823  | driva igenom       | driva   | igenom   | push through despite resistance                                                                                          | B2   | plain    |
| 824  | driva in           | driva   | in       | herd in; collect (debts) by force                                                                                        | B2   | plain    |
| 825  | driva omkring      | driva   | omkring  | drift about aimlessly                                                                                                    | B2   | plain    |
| 826  | driva på           | driva   | på       | urge to hurry                                                                                                            | B2   | plain    |
| 827  | droppa in          | droppa  | in       | leak in; arrive one by one unplanned                                                                                     | B2   | plain    |
| 828  | duka fram          | duka    | fram     | set out food on the table                                                                                                | B2   | plain    |
| 829  | duka under         | duka    | under    | perish, succumb                                                                                                          | B2   | plain    |
| 830  | duka ut            | duka    | ut       | carry dishes back out to the kitchen                                                                                     | B2   | plain    |
| 831  | dyka på            | dyka    | på       | accost someone abruptly                                                                                                  | B2   | plain    |
| 832  | dö bort            | dö      | bort     | fade away slowly (sound)                                                                                                 | B2   | plain    |
| 833  | falla ifrån        | falla   | ifrån    | pass away, die                                                                                                           | B2   | plain    |
| 834  | falla igenom       | falla   | igenom   | fail (an exam)                                                                                                           | B2   | plain    |
| 835  | falla någon in     | falla   | in       | occur to someone (impersonal)                                                                                            | C1   | v+p+prep |
| 836  | falla på           | falla   | på       | set in (darkness, an urge)                                                                                               | B2   | plain    |
| 837  | falla undan        | falla   | undan    | stop resisting, give in (to)                                                                                             | B2   | plain    |
| 838  | falla ut           | falla   | ut       | fall out; turn out, develop                                                                                              | B2   | plain    |
| 840  | fara på            | fara    | på       | attack fiercely                                                                                                          | B2   | plain    |
| 841  | fara upp           | fara    | upp      | jump up abruptly                                                                                                         | B2   | plain    |
| 842  | fara ut mot        | fara    | ut       | lash out verbally at                                                                                                     | B2   | v+p+prep |
| 843  | festa om           | festa   | om       | party hard                                                                                                               | B2   | plain    |
| 844  | festa upp          | festa   | upp      | squander (money) on partying                                                                                             | B2   | plain    |
| 845  | flyga i            | flyga   | i        | suddenly possess, get into someone (impersonal)                                                                          | C1   | plain    |
| 846  | flyga på           | flyga   | på       | attack physically                                                                                                        | B2   | plain    |
| 847  | flyga upp          | flyga   | upp      | fly up; jump up abruptly; fly open (a door)                                                                              | B2   | plain    |
| 848  | flyta in           | flyta   | in       | float in; come in steadily (money)                                                                                       | B2   | plain    |
| 849  | fresta på          | fresta  | på       | be a strain, be taxing                                                                                                   | B2   | plain    |
| 851  | frysa på           | frysa   | på       | turn much colder, freeze over (weather)                                                                                  | B2   | plain    |
| 852  | frysa till         | frysa   | till     | freeze to ice                                                                                                            | C1   | plain    |
| 853  | frysa ut           | frysa   | ut       | ostracize, freeze out socially                                                                                           | B2   | plain    |
| 854  | fråga om           | fråga   | om       | ask again                                                                                                                | B2   | plain    |
| 855  | fråga ut           | fråga   | ut       | question in detail, interrogate                                                                                          | B2   | plain    |
| 856  | fälla ut           | fälla   | ut       | fold out, spread out; precipitate (chemistry)                                                                            | B2   | plain    |
| 857  | följa upp          | följa   | upp      | follow up, monitor the result of                                                                                         | B1   | plain    |
| 858  | föra med sig       | föra    | med      | bring along; entail, cause                                                                                               | B2   | refl     |
| 859  | föra upp           | föra    | upp      | enter, record (in accounts)                                                                                              | B1   | plain    |
| 860  | föra över          | föra    | över     | transfer (money between accounts)                                                                                        | B2   | plain    |
| 861  | gripa sig an       | gripa   | an       | set about, tackle (a task)                                                                                               | B2   | refl     |
| 862  | haka på            | haka    | på       | latch on close behind, tag along                                                                                         | B2   | plain    |
| 863  | haka upp sig       | haka    | upp      | jam, get stuck (a machine); fixate on                                                                                    | B2   | refl     |
| 864  | hinna upp          | hinna   | upp      | catch up with                                                                                                            | B2   | plain    |
| 865  | hugga av           | hugga   | av       | chop off                                                                                                                 | B2   | plain    |
| 866  | hugga för sig      | hugga   | för      | grab a big share brazenly                                                                                                | B2   | refl     |
| 867  | hugga till         | hugga   | till     | hurt with a sudden stab                                                                                                  | B2   | plain    |
| 868  | hugga till med     | hugga   | till     | venture a guess                                                                                                          | B2   | v+p+prep |
| 869  | hugga upp          | hugga   | upp      | chop up (firewood)                                                                                                       | B2   | plain    |
| 870  | hyra in            | hyra    | in       | hire (temporary staff)                                                                                                   | B2   | plain    |
| 871  | härda ut           | härda   | ut       | endure, stick it out                                                                                                     | B2   | plain    |
| 872  | häva upp           | häva    | upp      | heave up; let out (a loud cry)                                                                                           | B2   | plain    |
| 873  | häva ur sig        | häva    | ur       | blurt out (something offensive)                                                                                          | B2   | refl     |
| 874  | kamma hem          | kamma   | hem      | win, pull off a success                                                                                                  | B2   | plain    |
| 875  | kamma in           | kamma   | in       | rake in (money)                                                                                                          | B2   | plain    |
| 876  | kavla upp          | kavla   | upp      | roll up (sleeves)                                                                                                        | B2   | plain    |
| 877  | kavla ut           | kavla   | ut       | roll out flat (dough)                                                                                                    | B2   | plain    |
| 878  | klappa igen        | klappa  | igen     | shut down (a shop)                                                                                                       | B2   | plain    |
| 879  | klappa ihop        | klappa  | ihop     | collapse physically                                                                                                      | B2   | plain    |
| 880  | klappa på          | klappa  | på       | knock (on the door)                                                                                                      | B2   | plain    |
| 881  | klara upp          | klara   | upp      | solve (a crime), clear up                                                                                                | B2   | plain    |
| 882  | klara ut           | klara   | ut       | sort out, resolve                                                                                                        | B2   | plain    |
| 883  | klippa av          | klippa  | av       | cut through; cut someone off curtly                                                                                      | B2   | plain    |
| 884  | klippa ner         | klippa  | ner      | cut back, prune (plants)                                                                                                 | B2   | plain    |
| 885  | klippa till        | klippa  | till     | hit someone; strike while the chance is there; cut to shape                                                              | B2   | plain    |
| 886  | klämma fram        | klämma  | fram     | force out (words) reluctantly                                                                                            | B2   | plain    |
| 887  | klämma i           | klämma  | i        | burst into loud song or playing                                                                                          | B2   | plain    |
| 888  | klämma i sig       | klämma  | i        | force food down                                                                                                          | B2   | refl     |
| 889  | klämma till        | klämma  | till     | squeeze hard; hit, hurt                                                                                                  | B2   | plain    |
| 890  | klämma till med    | klämma  | till     | venture a guess                                                                                                          | B2   | v+p+prep |
| 891  | klämma åt          | klämma  | åt       | squeeze tight; crack down on someone                                                                                     | B2   | plain    |
| 892  | knyta an till      | knyta   | an       | connect to, relate to                                                                                                    | B2   | v+p+prep |
| 893  | knyta till sig     | knyta   | till     | recruit, attach (people) to oneself                                                                                      | B2   | refl     |
| 894  | knyta upp          | knyta   | upp      | untie                                                                                                                    | B2   | plain    |
| 895  | knyta åt           | knyta   | åt       | tie tightly                                                                                                              | B2   | plain    |
| 896  | knäppa av          | knäppa  | av       | switch off                                                                                                               | B2   | plain    |
| 897  | knäppa ihop        | knäppa  | ihop     | button up, fasten together                                                                                               | B2   | plain    |
| 898  | knäppa på          | knäppa  | på       | switch on; pluck (strings)                                                                                               | B2   | plain    |
| 899  | knäppa till        | knäppa  | till     | fasten (a button); turn suddenly cold                                                                                    | B2   | plain    |
| 900  | koppla på          | koppla  | på       | switch on (electricity)                                                                                                  | B2   | plain    |
| 901  | koppla ur          | koppla  | ur       | disconnect (electricity)                                                                                                 | B2   | plain    |
| 902  | kosta på           | kosta   | på       | invest money in; be taxing (impersonal)                                                                                  | C1   | plain    |
| 903  | kränga av sig      | kränga  | av       | pull off (clothes) hastily                                                                                               | B2   | refl     |
| 904  | kränga på sig      | kränga  | på       | pull on (clothes) hastily                                                                                                | B2   | refl     |
| 906  | kännas vid         | kännas  | vid      | acknowledge, own up to                                                                                                   | B2   | plain    |
| 908  | ladda om           | ladda   | om       | reload                                                                                                                   | B2   | plain    |
| 909  | ladda ur           | ladda   | ur       | discharge (a battery)                                                                                                    | B2   | plain    |
| 910  | leva kvar          | leva    | kvar     | survive, live on                                                                                                         | B2   | plain    |
| 911  | leva om            | leva    | om       | live over again; make a mess or racket                                                                                   | B1   | plain    |
| 912  | leva sig in i      | leva    | in       | immerse oneself in, empathize with                                                                                       | B2   | refl     |
| 913  | leva upp           | leva    | upp      | use up (money); come back to life                                                                                        | B2   | plain    |
| 914  | leva upp till      | leva    | upp      | live up to                                                                                                               | B2   | v+p+prep |
| 915  | leva ut            | leva    | ut       | act out, give expression to                                                                                              | B2   | plain    |
| 916  | linda in           | linda   | in       | wrap up; soften, sugar-coat (criticism)                                                                                  | B2   | plain    |
| 917  | linda om           | linda   | om       | bandage, wrap around                                                                                                     | B2   | plain    |
| 918  | lugna ner sig      | lugna   | ner      | calm down                                                                                                                | B2   | refl     |
| 919  | lura av            | lura    | av       | trick someone out of (money)                                                                                             | B2   | plain    |
| 920  | lura i             | lura    | i        | make someone believe a falsehood                                                                                         | B2   | plain    |
| 921  | lura på            | lura    | på       | foist something unwanted onto; ponder                                                                                    | B2   | plain    |
| 922  | lura till sig      | lura    | till     | obtain by trickery                                                                                                       | B2   | refl     |
| 923  | lura ur            | lura    | ur       | coax (secrets) out by trickery                                                                                           | B2   | plain    |
| 924  | lura ut            | lura    | ut       | entice someone out; figure out                                                                                           | B2   | plain    |
| 925  | lysa upp           | lysa    | upp      | light up (a room); brighten (a face)                                                                                     | B2   | plain    |
| 927  | låsa sig ute       | låsa    | ute      | lock oneself out                                                                                                         | B2   | refl     |
| 928  | låsa upp           | låsa    | upp      | unlock                                                                                                                   | B2   | plain    |
| 929  | lämna av           | lämna   | av       | drop off, deliver                                                                                                        | B2   | plain    |
| 930  | lämna upp          | lämna   | upp      | deliver up                                                                                                               | B2   | plain    |
| 931  | lätta upp          | lätta   | upp      | lighten (a mood)                                                                                                         | B2   | plain    |
| 932  | lösa av            | lösa    | av       | relieve, take over from                                                                                                  | B2   | plain    |
| 933  | lösa in            | lösa    | in       | cash, redeem                                                                                                             | B2   | plain    |
| 934  | lösa upp           | lösa    | upp      | dissolve                                                                                                                 | B2   | plain    |
| 935  | lösa ut            | lösa    | ut       | trigger (an alarm); collect against payment                                                                              | B2   | plain    |
| 936  | muta in            | muta    | in       | stake a claim to (land, a research field)                                                                                | B2   | plain    |
| 937  | måla av            | måla    | av       | paint a likeness of                                                                                                      | B2   | plain    |
| 938  | måla om            | måla    | om       | repaint                                                                                                                  | B2   | plain    |
| 939  | måla upp           | måla    | upp      | paint a tempting picture of                                                                                              | C1   | plain    |
| 940  | måla ut            | måla    | ut       | portray negatively                                                                                                       | B2   | plain    |
| 941  | mäta ut            | mäta    | ut       | measure out a position; seize property for debt                                                                          | B2   | plain    |
| 942  | nöta in            | nöta    | in       | drill in by repetition                                                                                                   | B2   | plain    |
| 944  | ordna in           | ordna   | in       | arrange into a system                                                                                                    | B2   | plain    |
| 945  | ordna om           | ordna   | om       | rearrange                                                                                                                | B2   | plain    |
| 946  | ordna upp          | ordna   | upp      | put in order, sort out                                                                                                   | B2   | plain    |
| 947  | packa om           | packa   | om       | repack                                                                                                                   | B2   | plain    |
| 948  | packa sig iväg     | packa   | iväg     | clear off quickly                                                                                                        | B2   | refl     |
| 949  | passa upp          | passa   | upp      | wait on, serve                                                                                                           | B2   | plain    |
| 950  | plocka av          | plocka  | av       | pick everything off; help oneself from                                                                                   | B2   | plain    |
| 951  | plocka ner         | plocka  | ner      | take down; dismantle                                                                                                     | B2   | plain    |
| 952  | plöja igenom       | plöja   | igenom   | plough through (a lot of text)                                                                                           | B2   | plain    |
| 953  | plöja ner          | plöja   | ner      | plough under; invest heavily                                                                                             | B2   | plain    |
| 954  | plöja upp          | plöja   | upp      | plough up (a field)                                                                                                      | B2   | plain    |
| 955  | prata av sig       | prata   | av       | unburden oneself by talking                                                                                              | B2   | refl     |
| 956  | prata bort         | prata   | bort     | chat away (time); talk someone's objections aside                                                                        | B2   | plain    |
| 958  | prata på           | prata   | på       | keep on talking                                                                                                          | B2   | plain    |
| 959  | pröva på           | pröva   | på       | get a taste of, experience                                                                                               | B2   | plain    |
| 960  | pröva ut           | pröva   | ut       | test until right, calibrate                                                                                              | B2   | plain    |
| 961  | pyssla om          | pyssla  | om       | tend to, care for                                                                                                        | B2   | plain    |
| 962  | reda upp           | reda    | upp      | straighten out (a tangled situation)                                                                                     | B2   | plain    |
| 964  | rikta in sig på    | rikta   | in       | aim for, set one's sights on                                                                                             | B2   | refl     |
| 965  | rusta ner          | rusta   | ner      | disarm, reduce armaments                                                                                                 | B2   | plain    |
| 966  | rusta upp          | rusta   | upp      | rearm; renovate                                                                                                          | B2   | plain    |
| 967  | rycka till         | rycka   | till     | flinch, jerk                                                                                                             | B2   | plain    |
| 968  | rycka till sig     | rycka   | till     | snatch to oneself                                                                                                        | B2   | refl     |
| 969  | rycka upp sig      | rycka   | upp      | pull oneself together, cheer up                                                                                          | B2   | refl     |
| 970  | rycka ut           | rycka   | ut       | yank out; rush out on an emergency call; finish military service                                                         | C1   | plain    |
| 971  | ryka ihop          | ryka    | ihop     | fly at each other                                                                                                        | B2   | plain    |
| 972  | ryka på            | ryka    | på       | attack, fly at                                                                                                           | B2   | plain    |
| 973  | rå för             | rå      | för      | be to blame for, be able to help                                                                                         | B2   | plain    |
| 974  | rå om              | rå      | om       | own                                                                                                                      | B2   | plain    |
| 975  | rå på              | rå      | på       | be stronger than, get the better of                                                                                      | B2   | plain    |
| 976  | råka på            | råka    | på       | run into by chance                                                                                                       | B2   | plain    |
| 977  | råka ut för        | råka    | ut       | be the victim of, meet with                                                                                              | B2   | v+p+prep |
| 978  | röra ihop          | röra    | ihop     | stir together quickly; mix up, confuse                                                                                   | B2   | plain    |
| 979  | röra ner           | röra    | ner      | stir in                                                                                                                  | B2   | plain    |
| 980  | röra om            | röra    | om       | stir around                                                                                                              | B2   | plain    |
| 981  | röra till          | röra    | till     | make a mess                                                                                                              | B2   | plain    |
| 982  | röra upp           | röra    | upp      | stir up (dust); stir up (feelings)                                                                                       | B2   | plain    |
| 983  | röra ut            | röra    | ut       | dissolve by stirring                                                                                                     | B2   | plain    |
| 984  | sadla av           | sadla   | av       | unsaddle                                                                                                                 | B2   | plain    |
| 985  | sadla om           | sadla   | om       | change career or direction                                                                                               | B2   | plain    |
| 986  | sjunga ut          | sjunga  | ut       | speak one's mind openly                                                                                                  | B2   | plain    |
| 987  | skjuta fram        | skjuta  | fram     | push forward; postpone                                                                                                   | B2   | plain    |
| 988  | skjuta ner         | skjuta  | ner      | shoot down                                                                                                               | B2   | plain    |
| 989  | skjuta på          | skjuta  | på       | push from behind; postpone                                                                                               | B2   | plain    |
| 990  | skjuta till        | skjuta  | till     | push shut; contribute (money)                                                                                            | B2   | plain    |
| 991  | skratta till       | skratta | till     | give a sudden laugh                                                                                                      | B2   | plain    |
| 992  | skratta ut         | skratta | ut       | laugh someone to scorn; laugh oneself out                                                                                | B2   | plain    |
| 993  | skruva av          | skruva  | av       | unscrew                                                                                                                  | B2   | plain    |
| 994  | skruva i           | skruva  | i        | screw in                                                                                                                 | B2   | plain    |
| 995  | skruva på          | skruva  | på       | turn on (a tap)                                                                                                          | B2   | plain    |
| 996  | skynda till        | skynda  | till     | rush to help                                                                                                             | B2   | plain    |
| 997  | skälla ut          | skälla  | ut       | scold, tell off                                                                                                          | B2   | plain    |
| 998  | skära ihop         | skära   | ihop     | seize up (an engine)                                                                                                     | B2   | plain    |
| 999  | smälla av          | smälla  | av       | set off (fireworks); explode with emotion (slang)                                                                        | C1   | plain    |
| 1000 | smälla ihop        | smälla  | ihop     | slam shut; concoct (an excuse)                                                                                           | B2   | plain    |
| 1001 | smälla till        | smälla  | till     | swat, strike                                                                                                             | B2   | plain    |
| 1002 | smälla upp         | smälla  | upp      | throw up (buildings) quickly                                                                                             | B2   | plain    |
| 1004 | snappa upp         | snappa  | upp      | pick up (news) by chance                                                                                                 | B2   | plain    |
| 1005 | snappa åt sig      | snappa  | åt       | snatch up                                                                                                                | B2   | refl     |
| 1006 | spåra ur           | spåra   | ur       | derail (a train); degenerate (a discussion)                                                                              | B2   | plain    |
| 1007 | spänna av          | spänna  | av       | unfasten; relax (colloquial)                                                                                             | B2   | plain    |
| 1008 | spänna fast        | spänna  | fast     | fasten, buckle                                                                                                           | A2   | plain    |
| 1009 | spänna åt          | spänna  | åt       | tighten (a belt)                                                                                                         | B2   | plain    |
| 1010 | spärra av          | spärra  | av       | cordon off, block                                                                                                        | B2   | plain    |
| 1011 | spärra in          | spärra  | in       | lock up, imprison                                                                                                        | B2   | plain    |
| 1012 | spärra upp         | spärra  | upp      | open wide (the eyes)                                                                                                     | B2   | plain    |
| 1013 | spöka ut sig       | spöka   | ut       | dress up outlandishly                                                                                                    | B2   | refl     |
| 1014 | sticka av          | sticka  | av       | stand out against the surroundings                                                                                       | C1   | plain    |
| 1015 | sticka emellan     | sticka  | emellan  | interject                                                                                                                | B2   | plain    |
| 1016 | sticka till        | sticka  | till     | give a sudden stab of pain; slip something to someone secretly                                                           | B2   | plain    |
| 1017 | sticka åt          | sticka  | åt       | slip to someone secretly                                                                                                 | B2   | plain    |
| 1018 | stjälpa av         | stjälpa | av       | tip off (a load)                                                                                                         | B2   | plain    |
| 1019 | stjälpa i sig      | stjälpa | i        | gulp down (a drink)                                                                                                      | B2   | refl     |
| 1020 | streta emot        | streta  | emot     | resist, struggle against                                                                                                 | B2   | plain    |
| 1021 | streta på          | streta  | på       | toil on despite difficulty                                                                                               | B2   | plain    |
| 1022 | stryka av          | stryka  | av       | wipe off                                                                                                                 | B2   | plain    |
| 1023 | stryka för         | stryka  | för      | mark, highlight (in a text)                                                                                              | B2   | plain    |
| 1024 | stryka med         | stryka  | med      | perish, be lost                                                                                                          | B2   | plain    |
| 1025 | stryka om          | stryka  | om       | iron again                                                                                                               | B2   | plain    |
| 1026 | stryka på          | stryka  | på       | brush on (paint)                                                                                                         | B2   | plain    |
| 1027 | stryka under       | stryka  | under    | underline; emphasize                                                                                                     | B2   | plain    |
| 1028 | stryka ut          | stryka  | ut       | spread out evenly (paint); erase                                                                                         | B2   | plain    |
| 1029 | stråla samman      | stråla  | samman   | converge from different directions                                                                                       | B2   | plain    |
| 1031 | stöta bort         | stöta   | bort     | push away, repel (people)                                                                                                | B2   | plain    |
| 1032 | stöta ihop med     | stöta   | ihop     | run into unexpectedly                                                                                                    | B2   | v+p+prep |
| 1033 | stöta på           | stöta   | på       | bump into (a person); prompt, remind; make a pass at                                                                     | B2   | plain    |
| 1034 | stöta till         | stöta   | till     | bump into accidentally                                                                                                   | B2   | plain    |
| 1035 | stöta upp          | stöta   | upp      | bring up, regurgitate                                                                                                    | B2   | plain    |
| 1036 | stöta ut           | stöta   | ut       | push out (a boat); ostracize                                                                                             | B2   | plain    |
| 1037 | suga ut            | suga    | ut       | suck out (air); exploit, bleed dry                                                                                       | B2   | plain    |
| 1038 | suga åt sig        | suga    | åt       | absorb                                                                                                                   | B2   | refl     |
| 1039 | sy in              | sy      | in       | take in (a garment); imprison (slang)                                                                                    | C1   | plain    |
| 1040 | sy om              | sy      | om       | alter (a garment)                                                                                                        | B2   | plain    |
| 1041 | sy upp             | sy      | upp      | shorten (a garment); sew up a batch                                                                                      | B2   | plain    |
| 1042 | titta efter        | titta   | efter    | check carefully; gaze after                                                                                              | B2   | plain    |
| 1043 | titta till         | titta   | till     | look in on, check on                                                                                                     | B2   | plain    |
| 1044 | titta över         | titta   | över     | drop by; review                                                                                                          | B2   | plain    |
| 1045 | tjäna av           | tjäna   | av       | serve out (a prison sentence)                                                                                            | B2   | plain    |
| 1046 | tjäna in           | tjäna   | in       | save (time or money)                                                                                                     | B2   | plain    |
| 1047 | tjäna ut           | tjäna   | ut       | be worn out after long service                                                                                           | B2   | plain    |
| 1048 | tona bort          | tona    | bort     | fade away (sound)                                                                                                        | B2   | plain    |
| 1049 | tona fram          | tona    | fram     | emerge into view                                                                                                         | B2   | plain    |
| 1050 | tona ut            | tona    | ut       | fade out (sound)                                                                                                         | B2   | plain    |
| 1051 | trycka av          | trycka  | av       | pull the trigger                                                                                                         | B2   | plain    |
| 1053 | trycka upp         | trycka  | upp      | push up into; call (an elevator); print a large run                                                                      | B2   | plain    |
| 1054 | träda emellan      | träda   | emellan  | intervene, mediate                                                                                                       | B2   | plain    |
| 1055 | träda fram         | träda   | fram     | come forward, reveal oneself                                                                                             | B2   | plain    |
| 1056 | tända på           | tända   | på       | set fire to; be turned on by                                                                                             | B2   | plain    |
| 1057 | tända till         | tända   | till     | flare up in anger; spark (attraction, impersonal)                                                                        | C1   | plain    |
| 1058 | varva ner          | varva   | ner      | slow the revs; wind down, relax                                                                                          | B1   | plain    |
| 1059 | veckla av          | veckla  | av       | unwrap                                                                                                                   | B2   | plain    |
| 1060 | veckla in          | veckla  | in       | wrap up                                                                                                                  | B2   | plain    |
| 1061 | veckla in sig      | veckla  | in       | get tangled up in (explanations)                                                                                         | B2   | refl     |
| 1062 | veckla ut          | veckla  | ut       | unfold                                                                                                                   | B2   | plain    |
| 1063 | vräka i sig        | vräka   | i        | devour, gobble                                                                                                           | B2   | refl     |
| 1064 | vräka ur sig       | vräka   | ur       | blurt out (offensive things)                                                                                             | B2   | refl     |
| 1065 | växla in           | växla   | in       | be switched onto another track; exchange (currency)                                                                      | B2   | plain    |
| 1066 | växla ner          | växla   | ner      | shift to a lower gear                                                                                                    | B2   | plain    |
| 1067 | växla om           | växla   | om       | take turns; switch (channels)                                                                                            | B2   | plain    |
| 1068 | ösa på             | ösa     | på       | ladle on more; speed up (slang)                                                                                          | C1   | plain    |
| 1069 | ösa över           | ösa     | över     | pour into another container; shower (someone with gifts)                                                                 | B2   | plain    |

---

## 2. Mest förväxlade

46 pairs and sets, in four kinds.

### 2a. Stress minimal pairs (16)

Same letters, same order, different stress, different meaning. The particle
reading stresses the particle and de-stresses the verb. The prepositional
reading stresses the verb or the object. Nothing on the page distinguishes
them, which is why audio must stay off for these until someone has listened to
the actual output on the target device.

| #   | Betonad partikel                          | Obetonad preposition                   | Difference in one line                                                |
| --- | ----------------------------------------- | -------------------------------------- | --------------------------------------------------------------------- |
| 1   | hälsa PÅ någon — to visit                 | hälsa på någon — to greet              | Visiting takes an afternoon; greeting takes a second.                 |
| 2   | tycka OM någon — to like                  | tycka om något — to have a view on     | Affection versus opinion.                                             |
| 3   | tala OM något — to tell someone           | tala om något — to discuss             | Transferring information versus covering a topic.                     |
| 4   | slå PÅ radion — to switch on              | slå på någon — to strike at            | Operating a device versus hitting a person.                           |
| 5   | lägga PÅ luren — to hang up               | lägga på bordet — to put on top        | Ending a call versus placing an object.                               |
| 6   | ta PÅ sig jackan — to put on              | ta på något — to touch                 | Dressing versus making contact with a surface.                        |
| 7   | hålla PÅ med något — to be busy doing     | hålla på något — to hold onto          | Activity in progress versus a physical grip.                          |
| 8   | gå PÅ — to continue; to be taken in       | gå på bio — to go to the cinema        | Idiomatic versus plain destination.                                   |
| 9   | stå PÅ — to be going on (_vad står på?_)  | stå på golvet — to stand on            | Something is happening versus something is located.                   |
| 10  | läsa PÅ — to study up, to swot            | läsa på tåget — to read on the train   | Preparation versus place.                                             |
| 11  | köra PÅ någon — to hit, to run into       | köra på vägen — to drive on the road   | Collision versus route.                                               |
| 12  | veta OM — to be aware of                  | veta om — to know whether              | Here _om_ is not even a preposition; it is the conjunction "whether". |
| 13  | räkna MED — to count on, to expect        | räkna med fingrarna — to count using   | Expectation versus instrument.                                        |
| 14  | gå TILL — to happen (_hur går det till?_) | gå till skolan — to walk to school     | Manner versus destination.                                            |
| 15  | passa PÅ — to seize the opportunity       | passa på barnen — to mind the children | Taking a chance versus looking after.                                 |
| 16  | hålla OM någon — to hug                   | hålla om det — (no particle reading)   | _om_ after _hålla_ is a particle only in the embrace sense.           |

**One correction worth making explicitly.** `tänka på` is **not** a particle
verb. It is verb + preposition, and the stress falls on the object
(`jag tänker på DIG`). It appeared in the original task brief alongside
`tänka ut / efter / om / igenom`, which are all genuine particle verbs. The
adjective `påtänkt` ("under consideration") is a lexicalised leftover and is
not evidence of a live particle verb. Keep `tänka på` out of the dataset.

The same applies to `titta på` and `bero på`. The repo's own SVALex README
names `titta på` as a genuine particle verb; **I disagree**. `titta på TV`
stresses the object, not the preposition, and there is no `*påtittad` to match
`omtyckt` (← tycka om) or `avstängd` (← stänga av). Both are excluded.
Wiktionary lists `titta på`, which does not settle it — that appendix mixes
particle verbs with plain reflexives, as its own 19 particle-less rows show.

### 2b. Loose particle verb versus solid compound (16)

Swedish often has both a two-word particle verb and a one-word compound built
from the same parts. The compound moves the particle in front and **de-stresses
it into a prefix**. Rule of thumb: the loose form is concrete and everyday,
the solid form is abstract, formal, or specialised. The rule of thumb is not
reliable enough to derive from, which is the point.

| #   | Loose (particle stressed)                      | Solid (prefix unstressed)                           | Difference in one line                                                   |
| --- | ---------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------ |
| 1   | bryta av — to snap, to break off physically    | avbryta — to interrupt, to cut short                | One breaks a stick; the other breaks a conversation.                     |
| 2   | gå av — to come off, to snap; to get off a bus | avgå — to resign; to depart (of trains)             | Physical detachment versus leaving a post or a platform.                 |
| 3   | gå ut — to go out; to expire                   | utgå — to be omitted; to proceed from               | Leaving a room versus being left out of a document.                      |
| 4   | se ut — to look, to appear                     | utse — to appoint, to select                        | Appearance versus choosing a person.                                     |
| 5   | ge ut — to publish, to issue                   | utge sig för — to pass oneself off as               | Releasing a book versus claiming a false identity.                       |
| 6   | gå in — to enter                               | ingå — to be included; to enter into (an agreement) | Walking through a door versus being part of a whole.                     |
| 7   | gå under — to perish, to go under              | undergå — to undergo                                | Being destroyed versus being subjected to something.                     |
| 8   | komma undan — to get away                      | undkomma — to escape                                | Same idea; the compound is formal and written.                           |
| 9   | ta över — to take over                         | överta — to take over                               | Meaning matches; register does not. The compound is bureaucratic.        |
| 10  | gå över — to subside; to cross                 | övergå — to turn into, to transition to             | Pain stopping versus one state becoming another.                         |
| 11  | se över — to review, to look over              | överse med — to overlook, to tolerate               | Inspecting a thing versus deciding not to mind it.                       |
| 12  | ta med — to bring along                        | medtagen — worn out, exhausted                      | The participle of the compound has drifted to a different word entirely. |
| 13  | ställa in — to cancel; to adjust               | inställa sig — to report, to present oneself        | Cancelling a meeting versus turning up at one.                           |
| 14  | sätta in — to insert; to deposit               | insatt — well-informed, up to speed                 | The compound's participle describes a person, not a deposit.             |
| 15  | slå fast — to establish, to state firmly       | fastslå — to establish                              | Both current, both standard. Genuinely interchangeable; unusual.         |
| 16  | ta åt sig — to take it personally              | åta sig — to undertake, to take on                  | Being offended versus accepting a duty.                                  |

Pair 15 is in the list on purpose. A learner told "the compound always means
something different" will get `slå fast` / `fastslå` wrong. The honest rule is
"usually different, sometimes not".

### 2c. One base verb, several particles with close meanings (8 sets)

These collide because the meanings are near neighbours, not because they look
alike. This is where a scheduler that introduces two entries with the same
base verb in the same week does real damage — the design spec already forbids
that, and this section is the reason why.

| #   | Base   | The set                                                                                                          | Where the collision is                                                                                                                                                                                                                |
| --- | ------ | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | tänka  | ut (devise) / efter (reflect) / om (change one's mind) / igenom (think through) / över (consider)                | _efter_, _igenom_ and _över_ are all "think carefully". _efter_ is a pause before answering, _igenom_ is systematic and complete, _över_ is deliberation before deciding.                                                             |
| 2   | ta     | upp (raise a topic) / fram (get out ready to use) / ut (withdraw, remove) / bort (delete) / av (remove clothing) | _fram_ and _upp_ both put an object in view; _fram_ makes it usable, _upp_ makes it a subject of discussion. _bort_ and _ut_ both remove; _bort_ discards.                                                                            |
| 3   | gå     | ut (leave) / över (subside) / av (snap) / sönder (break) / åt (be used up)                                       | _av_ and _sönder_ both break. _av_ snaps in two; _sönder_ stops working. _över_ and _åt_ are both "be finished", but _över_ is pain ending and _åt_ is stock running down.                                                            |
| 4   | komma  | på (think of) / ihåg (recall) / åt (reach) / över (get over) / undan (escape)                                    | _på_ is a new idea arriving; _ihåg_ is an old one returning. Learners use _komma på_ for both.                                                                                                                                        |
| 5   | hålla  | på (be busy doing) / med (agree) / ut (persevere) / i (grip; host) / fast vid (stick to a position)              | _ut_ and _fast vid_ both mean persist. _ut_ is enduring hardship; _fast vid_ is refusing to change a stance.                                                                                                                          |
| 6   | slå    | på (switch on) / av (switch off) / upp (look up) / ut (eliminate; bloom) / in (wrap; come true)                  | _på_/_av_ are the device pair. _upp_ has nothing to do with them and is the one learners lose.                                                                                                                                        |
| 7   | sätta  | på (switch on) / in (insert, deposit) / upp (put up, stage) / ut (put out, discontinue) / igång (start)          | _på_ and _igång_ both start something. _på_ takes a device; _igång_ takes an activity.                                                                                                                                                |
| 8   | skriva | ner (write down) / upp (note down) / ut (print) / under (sign) / på (sign a contract)                            | _ner_ and _upp_ are near-synonyms and both correct in most frames — exactly what `acceptedParticles` exists for; the shipped `skriva ner` already accepts ner/ned/upp. _under_ and _på_ both mean sign, and are near-interchangeable. |

### 2d. Reflexive position — same base, opposite slot (6)

This kind is new, and it is only visible because the Wiktionary inventory
preserves the position of `sig` in the lemma. Of its 197 reflexive particle
verbs, **111 put the pronoun after the particle and 86 before it**. The base
verb does not predict which: `ta` alone has 12 before and 5 after.

The headline case settles the question outright:

> **`ställa sig in`** (before) — to ingratiate oneself with someone
> **`ställa in sig`** (after) — to brace oneself, to prepare mentally

Same base verb, same particle, opposite pronoun slot, different meaning. This
is proof that `ReflexivePosition` is lexical and meaning-bearing, and that no
rule derives it. Guessing it produces `*jag hör sig av`.

| #   | Före partikeln                        | Efter partikeln                         | Note                                                         |
| --- | ------------------------------------- | --------------------------------------- | ------------------------------------------------------------ |
| 1   | ge sig av — to depart                 | höra av sig — to get in touch           | The pair already shipped in `particleVerbData.ts`.           |
| 2   | ställa sig in — to ingratiate oneself | ställa in sig — to brace oneself        | Same base _and_ same particle. The decisive case.            |
| 3   | ta sig an — to take charge of         | ta på sig — to put on; to take on       | Same base verb, opposite slot.                               |
| 4   | bryta sig in — to burgle              | skriva in sig — to register             | Both with _in_; the slot differs by lexeme, not by particle. |
| 5   | komma sig för — to get round to       | få för sig — to take it into one's head | Both with _för_.                                             |
| 6   | lägga sig i — to meddle               | lägga på sig — to gain weight           | Same base verb, different particle _and_ different slot.     |

---

## 3. Datafält

The existing `ParticleVerbData` interface in `src/data/particleVerbData.ts`
already handles most of what this list needs. My recommendation is three
additions, two things to leave out, and one claim from the original brief that
I checked and found needs restating.

### 3.1 The word-order claim, checked

The brief said particle placement matters, "e.g. _ta på sig den_ not
_ta på den sig_", and asked me not to copy that blindly. The example is right
and the reasoning behind it is not what it looks like.

`ta på sig den` is correct and `*ta på den sig` is wrong. But that ordering is
not a particle rule. `sig` is an indirect object and `den` a direct object,
and Swedish puts the indirect object first the same way it does with any verb
(`jag gav henne den`). The particle is not what decides it.

The real particle rules, which I state as facts I am willing to defend:

1. **The object follows the particle, always — including pronoun objects.**
   `Jag skriver ner numret.` `Jag skriver ner det.` Not `*Jag skriver det ner.`
   This is where Swedish parts company with English ("write it down") and with
   Norwegian and Danish, which permit both orders. A learner coming through
   English will produce the wrong one.
2. **The verb and the particle are not always adjacent.** Three things get
   between them: a sentence adverb in a main clause
   (`Vi ger aldrig upp`, `Han skriver inte ner det`), the subject under V2
   inversion (`I går skrev han ner numret.` `Skriver du ner det?`), and a
   predicative complement in `se ut`-type frames (`Du ser trött ut`). The
   shipped example sentences already exercise all three, which is good
   authoring.
   So the accurate rule is _the particle sits immediately before the object_,
   not _immediately after the verb_.
3. **Reflexive position is lexical and cannot be derived.** Section 2d now
   proves this rather than asserting it: `ställa sig in` and `ställa in sig`
   share a base verb and a particle and differ only in the pronoun slot — and
   in meaning. The existing
   `reflexive: 'none' | 'beforeParticle' | 'afterParticle'` field is correct
   and necessary. Keep it, and populate it from the Wiktionary lemma order,
   which encodes it for all 197 reflexive entries.

### 3.2 Do not store preteritum or supinum. Derive them.

My position: the separable forms are fully derivable and storing them would
create a drift surface for no linguistic gain.

The particle never inflects. `skriva ner` → `skriver ner` / `skrev ner` /
`har skrivit ner` / `skriv ner`. Every form is
`${VERB_DATA form of baseInfinitive} + " " + particle`, with the reflexive
slot inserted per the `reflexive` field. `verbs.ts` already exposes
`conjugateVerb(infinitive)`, so the derivation is one join on `baseInfinitive`
— which the dataset already requires to be resolvable.

Storing them instead would duplicate `VERB_DATA` across 500 rows and let the
two copies disagree. That is the failure mode the CSV-versus-`VERB_DATA` drift
already demonstrates in this repo.

**One trap to write down so nobody derives past the safe boundary.** The
adjectival and nominal derivations of a particle verb are _solid_ compounds
with the particle in front: `stänga av` → `avstängd`, `ställa in` →
`inställd`, `skriva upp` → `uppskriven`, `ta med` → `medtagen`. Naive
concatenation would produce `*stängd av`, which is wrong. The app does not
teach perfect particip today, so this is a reason to keep the derivation
narrow — the four tested forms and supinum only — rather than a reason to add
a participle field.

### 3.3 Three fields worth adding

| Field               | Type                                         | Why it cannot be derived                                                                                                                                                                                                                                                                                                                                                              |
| ------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `freqRank`          | `number` (optional)                          | Introduction order should follow frequency, and the data is currently ordered by CEFR band alone. Bands 1–5 give a defensible number; bands 6–8 leave it unset rather than carry a fake one.                                                                                                                                                                                          |
| `particleSpellings` | `string[]` (optional)                        | Multi-word and variant particles: `ner`/`ned`, `igång`/`i gång`, `iväg`/`i väg`. SAOL admits both in each case. Grading one wrong is the same correctness violation `acceptedParticles` exists to prevent, but it is an orthographic axis rather than a lexical one, and merging them into `acceptedParticles` would make that list mean two things. 13 entries in this list need it. |
| `solidCompound`     | `{ form: string; gloss: string }` (optional) | The section 2b pairs. Per-entry, non-derivable, and the largest source of learner error after stress. Only ~16 entries need it.                                                                                                                                                                                                                                                       |

`freqRank` is the only genuinely new thing this research produces. Everything
else fits the existing shape.

### 3.4 What I recommend against adding

- **A per-entry object-placement field.** The word-order rules in 3.1 are
  general, not lexical. One shared note on the feedback screen covers every
  entry; 500 copies of the same string would not.
- **A participle or derived-compound form field.** Out of scope, and 3.2
  explains why a naive one would ship wrong Swedish.
- **A second CEFR taxonomy.** The existing `cefr` plus
  `cefrEvidence: 'svalex' | 'judgment'` pair already expresses what this list
  needs. Bands 1–5 and 7–8 are `'svalex'`; band 6 is `'judgment'`. No enum
  change.

### 3.5 The constraint that governs rollout

Restated because it decides sequencing: 654 of the 1069 entries have a base
verb that is not in `VERB_DATA`, and the dataset test requires
`baseInfinitive` to resolve. **415 are shippable today.** Adding particle
verbs and adding base verbs are the same project, and the table at the top of
this document names the twelve base verbs that would unblock the most.

### 3.6 Three structural classes, not one

Source C forces a shape question the earlier sources let me avoid. Its 834
entries split three ways, and the current `ParticleVerbData` interface only
models the first cleanly.

**`plain` — verb + particle (430 of the new entries).** Fully handled today.

**`refl` — reflexive (97).** Handled by the existing `reflexive` field, and
section 2d shows the pronoun slot is lexical. Populate it from the Wiktionary
lemma order where available; source C preserves it too, so the two sources
cross-check each other on this.

**`v+p+prep` — verb + particle + preposition (42).** _Not_ handled.
`hålla fast vid`, `bli av med`, `råka ut för`, `komma an på`, `slå an på`,
`gå ut över`, `ta itu med`, `lägga an på`, `sätta sig upp mot`. The
preposition is fixed and part of the lexical unit: `hålla fast` without `vid`
means something different, and a learner who produces `*hålla fast med` is
wrong. But `baseInfinitive` + `particle` has nowhere to put it.

My recommendation is a `preposition?: string` field rather than folding it
into `particle`. Two reasons. The cloze answer stays the particle alone, so
`acceptedParticles` keeps meaning one thing. And the stress facts differ: the
particle is stressed, the trailing preposition is not, so merging them into
one string would misrepresent the pronunciation the app is trying to teach.

The same field would let `ta reda på` and `få reda på` (section 4.4) be
modelled honestly at last — though those have a _noun_ in the middle rather
than a particle, so they need their own call.

---

## 4. Not changed, needs human check

Nothing in a production file was changed. This section lists what I declined
to assert.

### 4.1 Wiktionary rows with no particle — excluded (19)

The lead flagged 19 rows with an empty particle column. I checked them against
`wiktionary-partikelverb-raw.txt`. The particle field is genuinely empty in
the source (`|[[uttrycka sig]]||||sig`), and all 19 are the same thing: plain
reflexive verbs with no particle at all.

`fega sig`, `få sig`, `föra sig`, `lösa sig`, `passa sig`, `reta sig`,
`rikta sig`, `ringla sig`, `släpa sig`, `släppa sig`, `sträcka sig`,
`ta sig`, `utspela sig`, `uttrycka sig`, `utveckla sig`, `utvidga sig`,
`vila sig`, `vräka sig`, `värma sig`.

They are excluded. Reflexive verbs are a different category from particle
verbs, and the Wiktionary appendix says so itself in its header
("Listan innehåller lösa (inte bara reflexiva) partikelverb"). This also means
the appendix is not a clean particle-verb inventory and should not be treated
as authoritative on membership.

### 4.2 Meaning not confidently assigned (17, down from 24)

Real corpus rows I can read in context but will not publish a guessed gloss
for. Each needs a check against SO or SAOL on svenska.se.

`lämna fram`, `stoppa upp`, `släpa fram`, `rida in`, `segla om`, `åka av`,
`sträcka upp`, `få fast`, `kränga på`, `lämna igen`, `sparka upp`,
`locka upp`, `sticka ner`, `rinna iväg`, `burra upp`, `rulla av`,
`sätta igen`.

**Seven resolved by source C.** It independently supplied glosses that
match the readings I had been unwilling to commit to, so these move into the
list: `vara på` (be switched on; keep watch on someone), `sätta av` (drop off
a passenger; set aside money), `lägga för` (serve food onto a plate),
`leva om` (live it up; make a racket), `föra upp` (enter in accounts),
`ligga för` (suit someone's nature), and `vara av` — "be broken in two", which
is the one I could not get at all. Independent agreement between a corpus row
and a curated teaching inventory is the strongest evidence available here
short of SAOL.

`trycka på` also gained a source-C gloss ("press a button; apply pressure to
hurry"), which confirms both readings exist but does **not** settle my actual
question: whether the button sense is a particle verb or a prepositional verb.
It is removed from the table on that ground rather than on meaning (revision 2026-08-09).

### 4.3 Corpus rows deliberately excluded (94 total)

Every SVALex row not in the ranked list, so the cuts are auditable. Three
reasons:

**Not particle verbs (2)** — `bero på`, `titta på`. See section 2a.

**Meaning not confident (24)** — the section 4.2 list.

**Too rare to teach (68)** — all sit at a single coursebook occurrence, and
including them would be padding:
`binda fast`, `binda ihop`, `binda upp`, `bo över`, `bre ut`, `brinna upp`,
`bunta ihop`, `burra upp`, `dra över`, `dryga ut`, `fiska upp`, `flamma upp`,
`flika in`, `forsa fram`, `frysa till`, `följa upp`, `föra bort`, `gröpa ur`,
`hetsa upp`, `häfta ihop`, `hägna in`, `jaga bort`, `kasta upp`, `klä om`,
`knåpa ihop`, `leva med`, `ligga för`, `limma ihop`, `läsa upp`,
`muntra upp`, `måla upp`, `möta upp`, `passa upp`, `piggna till`,
`piska upp`, `platta till`, `plugga in`, `rabbla upp`, `ramla ner`,
`rasa ner`, `rationalisera bort`, `rinna bort`, `ropa till`, `rycka ut`,
`räcka till`, `röva bort`, `segla ut`, `skrapa bort`, `smula sönder`,
`sova ut`, `sova över`, `spara in`, `sparka ut`, `spänna fast`,
`stamma fram`, `sticka av`, `sticka ut`, `stuva in`, `städa undan`,
`stå emot`, `stå på`, `svetsa samman`, `torka bort`, `tufsa till`,
`tyna bort`, `varva ner`, `visa in`, `väga upp`, `vänta in`.

A few of these are defensible promotions if the lead wants a longer list —
`följa upp`, `stå emot`, `sova över`, `räcka till`, `sticka ut` and
`stå på` are the strongest candidates. I left them out rather than pad.

### 4.4 Shape undecided — cannot enter the dataset as-is (5)

`ta reda på` (rank 258) and `få reda på` (259) are in the ranked list because
omitting them from a Swedish particle-verb list is a bigger error than
including them with a caveat. But neither fits `baseInfinitive` + `particle`:
`reda` is a noun and the expression has three parts. The same applies to
`ta hand om`, `bli av med` and `bjuda på`, which I left out of the list
entirely.

`particleVerbData.ts` already excludes `ta reda på` and `komma överens` on
exactly these grounds. I did include `komma överens` (rank 263), because
`överens` is an adverb rather than a noun and the two-part shape holds —
flagging it anyway, since the shipped dataset chose otherwise.

The decision here is a data-shape call for the lead plus `staff-engineer`, not
a linguistic one.

### 4.5 CEFR tags I do not believe (5)

Derived from SVALex first-nonzero-level, so they are reproducible, but they
contradict what an A1 or A2 learner actually meets:

| Verb      | SVALex band       | Problem                                                                                               |
| --------- | ----------------- | ----------------------------------------------------------------------------------------------------- |
| komma för | A1                | _det kommer för mig_ is a low-frequency idiom, not beginner material.                                 |
| tråka ut  | A2                | Marginal everyday verb; B1 at the earliest.                                                           |
| rycka in  | A2                | Workplace register.                                                                                   |
| sätta på  | A2 at freq 0.1387 | The band may be right; the frequency is certainly wrong. An everyday verb sitting in the bottom band. |
| dricka ur | C1                | Concrete, transparent, and used with children. C1 is not credible.                                    |

The general shape of the problem: SVALex first-nonzero-level rewards a verb
for appearing once in an A1 coursebook and punishes a verb that coursebooks
happen not to drill. Use it as a prior, not as a verdict.

### 4.6 Reflexive position — now derivable, still needs a check (13 entries)

Section 2d resolves the method: the Wiktionary lemma order encodes
`ReflexivePosition` for all 197 of its reflexive entries, and I have used it
for the ones that appear there.

Four entries in my band 6 are **not** in Wiktionary, so their position is
still unassigned and must not be guessed: `ta av sig`, `bry sig om`,
`ha på sig`, `dra på sig`. My reading of all four is `afterParticle` except
`bry sig om`, which is `beforeParticle` — but that is judgment, not evidence,
and `ställa sig in` versus `ställa in sig` shows how expensive a wrong guess
is.

The remaining nine reflexives in band 6 carry a Wiktionary-attested position
and can be populated directly.

### 4.7 Source C: rejected outright (4)

Forms I cannot confirm exist in Swedish at all. Not included at any
confidence level.

| Rejected        | Source gloss                    | Why                                                                                                                                                                                                                                                    |
| --------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `klappa igenom` | collapse physically from strain | `klappa ihop` is the standard form and is separately present in the source. This looks like an extraction artifact, not a word.                                                                                                                        |
| `bena ur`       | remove the bones from           | `bena ut` (untangle, analyse) is standard and is also separately present. I cannot confirm an _ur_ variant meaning "debone".                                                                                                                           |
| `gå i`          | be believed                     | Human review 2026-08-12 (#330): the standard verb for this sense is `gå på` (_låta sig luras_). The _i_ form is a book or OCR slip. The other `gå i` senses ("get into (water)", "fit into") are not particle-verb senses and do not rescue the entry. |
| `ladda in`      | shovel in (food)                | Human review 2026-08-12 (#330): the attested verb is `lassa in`. `ladda`/`lassa` confusion.                                                                                                                                                            |

All four are the same failure shape: a real particle verb sitting next to a
near-identical form that I cannot attest. That is what a scanned-source OCR
pipeline
would be expected to produce if it produced anything, and four out of 834 is a
low rate.

The last two entered this section on 2026-08-12, promoted from section 4.8 by
the human review ruling on issue #330. They are permanent exclusions, not
restorable ones.

### 4.8 Source C: human review complete — 14 confirmed, 2 excluded (16)

These were in band 9, each flagged **NEEDS HUMAN CHECK** inline. Revision
2026-08-09: removed from the table and the CSV by lead decision, pending
human review (PR #338). Revision 2026-08-12: the human review is **done** —
ruling on issue #330, sources SAOB, Synonymer.se, WordReference, Cambridge,
Livsmedelsverket and gu.se. No `NEEDS HUMAN CHECK` flag is open any more.

The ruling confirms 14 of the 16 as real Swedish and excludes 2. My earlier
doubts are overturned where the table below says so; read the ruling, not the
doubt, as the current position.

**Confirmed, no change to the entry (8).** The original gloss stands.

| Entry             | Ruling                                                                                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `slå av sig`      | Real: "go flat" (a drink). Synonymer.se — _bli avslagen_.                                                                                                                |
| `binda åt`        | Real. SAOB — _knyta hårdare_.                                                                                                                                            |
| `kränga till`     | Real. SAOB — _spårvagnen kränger till_.                                                                                                                                  |
| `lysa ut`         | Real and contemporary — _lysa ut två doktorandplatser_ (gu.se). The compound `utlysa` does not displace it.                                                              |
| `nötas av`        | Real. It is the **s-passive of `nöta`, not a deponent**. My "deponent base" note was wrong. `nöta` conjugates normally; do not add `nötas` to `VERB_DATA` as a deponent. |
| `prata omkull`    | Real. SAOB records _omkullpratad_.                                                                                                                                       |
| `snappa till sig` | Real. SAOB records it. `till sig` and `åt sig` differ in nuance, so the pair is not a duplicate.                                                                         |
| `stråla ut`       | Real. The **"(impersonal)" tag is removed** — it was wrong. Not one of the 19 in section 4.9.                                                                            |

**Confirmed, gloss corrected (6).** The entry is real; the stored meaning must
change before it is used.

| Entry           | Old gloss                                           | Corrected gloss and note                                                                                                                                           |
| --------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `komma upp sig` | rise socially or professionally                     | Sense stands (SAOB). The canonical order is **`komma sig upp`** — prefer that as the headword.                                                                     |
| `säga om`       | say again; object to                                | **"say again" only** (SAOB — _upprepa_). The "object to" sense is `säga emot` and is dropped from this entry.                                                      |
| `dra omkring`   | scatter about, make a mess of things                | **"roam, wander about"** (SAOB — _färdas/resa omkring_). The book gloss was wrong; my reading was right.                                                           |
| `falla ut med`  | yield as a result (e.g. a win)                      | **"result in"**. Weak headword — teach it through `falla ut` instead.                                                                                              |
| `frysa om`      | freeze again                                        | **"refreeze"** — the book was right and I was wrong (Livsmedelsverket — _frysa om mat_). `frysa om fötterna` is a separate body-part construction, not this entry. |
| `resa upp`      | raise upright; travel north; spend money travelling | **"raise upright"**. The "spend money travelling" sense is real (SAOB) but colloquial and low priority.                                                            |

**Excluded permanently (2).** Both moved to section 4.7 with their reason:
`gå i` "be believed" (the standard verb is `gå på`) and `ladda in` "shovel in
(food)" (the attested verb is `lassa in`). They are not restorable.

**Restoration status.** The 14 confirmed entries are **still absent** from the
table and from `partikelverb-list.csv` in this repo — PR #338 removed all 16
rows and this revision does not put any row back. Restoring them is a separate,
lead-gated change: it re-adds 14 rows at their preserved ranks (566, 620, 693,
741, 793, 839, 850, 905, 926, 943, 957, 963, 1003, 1030), drops the
`NEEDS HUMAN CHECK` flag, and applies the six corrected glosses above. Until
that happens, this section is the only record of the ruling.

### 4.9 Impersonal particle verbs — a class the data model has no slot for (19)

Source C marks nineteen entries as impersonal: they take `det` or no personal
subject at all. `det bär av`, `det bär emot`, `det faller mig in`,
`det går upp för mig`, `det ligger för honom`, `det drar ihop sig`,
`det kostar på`, `det slår om`, `det tänder till`, and ten more.

This matters for card authoring, not for the lexicon. A cloze frame generated
from a first-person template (`Jag ___ av`) is ungrammatical for every one of
them, and the recall direction is worse: the citation form has no natural
subject to prompt with. `particleVerbData.ts` currently has no way to express
this, so these entries would silently generate broken Swedish.

Recommendation: an `impersonal?: boolean` flag, and exclude impersonal entries
from any automatically templated frame. I have not added the flag to the list
because it is a data-model decision, but the 19 are identifiable by the
"(impersonal)" tag in their gloss.

Source C marks 19, but one of those marks is wrong: the human review ruling of
2026-08-12 (#330) strips the impersonal tag from `stråla ut` (section 4.8).
Whoever restores that entry must not carry the tag back with it. The tag count
in the CSV is lower again, because several of the 19 sit in rows that other
sections of this list already exclude.

### 4.10 Deponent base verbs (4)

`andas in`, `andas ut`, `turas om`, `hjälpas åt`. Their `baseInfinitive` is
the deponent form — `andas`, `turas`, `hjälpas` — not `*anda`, `*tura`,
`*hjälpa`. They keep the `-s` in every form (`turas` / `turades` / `turats`).
If any is promoted, the base verb added to `VERB_DATA` must be the `-s` form,
or the conjugation shown beside the particle will be wrong.
