# Multiple-choice distractors for conjugation cards

Ticket: [ORD-18](https://linear.app/ordboj/issue/ORD-18). The implementation ticket is [ORD-19](https://linear.app/ordboj/issue/ORD-19).

## Decision

A distractor comes from `VERB_DATA`, uses the same form as the answer, and comes from the same grupp. Grupp `2a` and grupp `2b` are the only adjacent pair. Same CEFR is a rank, not a gate. The card has four options, or it is a typed card. A distractor is never a correct form of the same verb.

## Question

Which wrong options does a conjugation card show? When the pool cannot fill four options, what does the card do?

## What the app does today

`src/components/PracticeCard.tsx` has no hardcoded verb list. The old list survives only in a test comment.

```1337:1339:src/components/PracticeCard.test.tsx
    // rows, including every verb in the old hardcoded 8-verb pool except
    // "vara", "ha" and "komma". Against the pre-fix pool
    // (['vara','ha','gå','komma','skriva','läsa','säga','få']) the only
```

The live picker reads `getAllConjugatedVerbs()`, `getVerbGrupp()`, and `getAcceptedAnswers()`. It keeps the same form. It keeps the same grupp, or the pair `2a` and `2b`.

It rejects the sentinel and any form of the target verb. Same CEFR adds one score point. It then takes three distractors. A short list stays short.

```210:226:src/components/PracticeCard.tsx
          // P14 hard constraint: same or adjacent group only, never cross-group.
          if (!isSameGroup && !isAdjacentGroup) return acc;

          seen.add(value);
          let score = isSameGroup ? 20 : 10;
          if (conjugated?.cefr && v.cefr === conjugated.cefr) {
            score += 1;
          }
          acc.push({ value, score });
          return acc;
        }, []);

      const distractors = candidates
        .sort(() => Math.random() - 0.5)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
```

P14 in `docs/learning/2026-08-08-ux-pedagogy-red-lines.md` already forbids a random pool and a cross-group pool. It also forbids a distractor that is another correct form of the target verb. P14 does not set the CEFR rule. P14 does not set the short-pool rule. No note under `docs/learning/` or `docs/product/` sets those two rules.

`VERB_DATA` has 979 rows, not about 50. Counts by grupp and CEFR:

| Grupp | A1  | A2  | B1  | B2  | C1  |
| ----- | --- | --- | --- | --- | --- |
| 1     | 113 | 172 | 138 | 169 | 1   |
| 2a    | 42  | 40  | 21  | 22  | 0   |
| 2b    | 26  | 12  | 15  | 9   | 0   |
| 3     | 6   | 2   | 1   | 2   | 1   |
| 4     | 67  | 42  | 42  | 36  | 0   |

Grupp 3 has 12 rows in total. A hard same-CEFR gate leaves grupp 3 at B1 with no other verb. It leaves grupp 3 at C1 with no other verb. It leaves grupp 1 at C1 with no other verb.

## Options and the cost to the learner

**Same grupp, CEFR as a rank, four options or a typed card.** The learner cannot reject an option by ending shape alone. An A1 card prefers A1 verbs. A rare CEFR cell can still fill three distractors from the rest of the grupp. A short pool does not become an easy guess.

**Hard same-CEFR gate.** The options match the learner band. Grupp 3 at B1 and at C1 cannot fill three distractors. The card then needs the short-pool rule on many ordinary verbs.

**Keep a short choice list.** A two-option card is a coin toss. The scheduler still records a choice success. The learner gets a long interval for a guess. The choice formula does not store the option count, so it cannot discount a short list.

**Fill the gap from another grupp.** The learner spots `talade` among `gick` and `fick` with no Swedish. P14 already forbids this. The success is a lie in the schedule.

## Rule

Use only `getAllConjugatedVerbs()`, `getVerbGrupp()`, and `getAcceptedAnswers()`. Do not add fields to `VERB_DATA`. Compare strings after trim and lower case.

1. Take the same form as the answer. Reject an empty form. Reject the sentinel `"(not available)"`. Reject an imperativ with `imperativNotApplicable`.
2. Reject a string that equals the correct answer.
3. Reject a string that equals any available form of the target verb. The forms are infinitive, presens, preteritum, supinum, and imperativ.
4. Reject a string that is in `getAcceptedAnswers()` for this card. This includes an alternate, such as `lade` beside `la` for `lägga`.
5. When the grupp equals the target grupp, keep the candidate. When the two groups are `2a` and `2b`, keep the candidate too. Reject every other grupp. If the target grupp is missing, reject the candidate.
6. Rank the survivors in this order. Same grupp and same CEFR come first. Same grupp and a different CEFR come second. The adjacent pair and the same CEFR come third. The adjacent pair and a different CEFR come last.
7. Shuffle inside one rank. Take three strings. One string is one button.
8. If fewer than three strings remain, do not show a choice card. Show the typed card. Record the answer as typed.
9. If three strings remain, show four options. Shuffle the position of the correct option.

`2a` and `2b` are the only adjacent pair. They share the presens ending `-er`. Grupp 1, grupp 3, and grupp 4 have no neighbour. Do not treat grupp 3 as a neighbour of `2a`. Grupp 3 has 12 rows, so the same grupp can fill three distractors without a neighbour.

Worked example, all strings from `src/data/verbData.ts`. The target is `tala`, form preteritum, answer `talade`, grupp 1, CEFR A1 (line 167). Legal top-rank distractors include `pratade` (`prata`, line 231), `jobbade` (`jobba`, line 229), and `väntade` (`vänta`, line 228).

`gick` is illegal. It is the preteritum of `gå`, grupp 4 (line 123). `talar` is illegal. It is the presens of `tala`.

Second example. The target is `lägga`, form preteritum, answer `la` (line 158). `lade` is in `alternates.preteritum`. Step 4 rejects `lade`.

Third example. The target is `äga`, form preteritum, answer `ägde`, grupp `2a`, CEFR A1 (line 130). Same-grupp distractors include `behövde` (`behöva`, line 141). If the same grupp runs out, `2b` is legal. `köpte` (`köpa`, line 219) and `tänkte` (`tänka`, line 151) are legal then. `talade` stays illegal.

## Runner-up

The short choice list lost. It raises the chance of a guess, and the schedule cannot see the option count. The typed fallback costs one typed card. That cost is smaller than a false success.

The hard CEFR gate lost because grupp 3 and the C1 cell of grupp 1 cannot fill three distractors inside one band.

## How we know this rule is wrong

The app keeps no per-answer log. Check a hand sample of choice cards.

One distractor is chosen on more than 60 of 100 wrong answers, on one form. The pool is not competitive. `swedish-linguist` then reviews that grupp. The number 60 is the tripwire in `docs/learning/2026-08-12-sentence-completion-distractors.md`. The transfer to conjugation cards is not measured. The evidence for the exact number is thin.

Learners leave multiple choice after this rule, and typed accuracy stays under 50 of 100. The typed card is too hard on a phone. Then keep four options and revisit the typed fallback. Do not fill the gap from another grupp.

Evidence is also thin for the adjacent pair. No study in this note measured which Swedish groups learners mix up. Grupp 3 can fill its own pool, so a wider pair is not required.

## Hand-off

`frontend-expert` owns `src/components/PracticeCard.tsx` under ORD-19. Remove nothing that is already gone. Replace the short-list branch with the typed fallback. Keep the random position of the correct option.

`qa` owns the regression test. A grupp 1 preteritum card must not offer `gick`. A `lägga` preteritum card must not offer `lade`. A pool with fewer than three legal strings must render the typed card, and the test must finish. The test must not loop.

`swedish-linguist` does not edit `VERB_DATA` for this rule.

No `localStorage` field changes. `STORAGE_VERSION` stays 3.
