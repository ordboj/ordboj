# Deponent imperativ, and the card for a missing imperativ

Tickets: [ORD-66](https://linear.app/ordboj/issue/ORD-66), [ORD-92](https://linear.app/ordboj/issue/ORD-92).

## Decision

Deponent verbs get a drilled imperativ. The drilled string is the form Svensk ordbok (SO) prints with the label "imperativ deponens". Do not store an empty imperativ for those rows. Do not set `noNaturalImperativ` on those rows. A verb with no printed imperativ has no practice card. That card must not grade `"(not available)"`.

## Question

Does a deponent verb get a drilled imperativ, an empty imperativ, or no imperativ card?

## What the app does today

`VERB_DATA` stores a filled imperativ on six deponent rows. Each stored imperativ equals the infinitive.

```479:479:src/data/verbData.ts
  { cefr: "A2", infinitive: "misslyckas", imperativ: "misslyckas", presens: "misslyckas", preteritum: "misslyckades", supinum: "misslyckats", grupp: "1" },
```

```645:645:src/data/verbData.ts
  { cefr: "A2", infinitive: "umgås", imperativ: "umgås", presens: "umgås", preteritum: "umgicks", supinum: "umgåtts", grupp: "4" },
```

The same pattern is on `vistas` (line 697), `låtsas` (line 710), `andas` (line 770), and `färdas` (line 853). `lyckas` is not in `VERB_DATA`.

The flag `noNaturalImperativ` is documented for modal verbs only.

```39:45:src/data/verbData.ts
  // True only for verbs that grammatically have no imperativ at all in
  // Swedish — modal/auxiliary verbs (kunna, få, vilja, ...). Distinguishes
  // that fact from "not filled in yet": every other row must have a
  // non-empty imperativ, and an empty imperativ without this flag set is a
  // data bug, not a deliberate gap. Omitted (undefined) is equivalent to
  // false and is the correct value for every non-modal verb.
```

`kunna` stores an empty imperativ and sets the flag.

```113:113:src/data/verbData.ts
  { cefr: "A1", infinitive: "kunna", imperativ: "", presens: "kan", preteritum: "kunde", supinum: "kunnat", grupp: "4", noNaturalImperativ: true }, // modal verb: no imperativ in Swedish, empty is correct
```

An empty imperativ becomes the sentinel `"(not available)"`.

```123:127:src/lib/verbs.ts
export function getAcceptedAnswers(infinitive: string, form: Form): string[] {
  if (form === 'infinitive') return [infinitive];
  const verb = VERB_DATA.find((v) => v.infinitive === infinitive);
  const primary = verb?.[form] || '(not available)';
  return [primary, ...(verb?.alternates?.[form] ?? [])];
```

The due queue skips that sentinel. `listAvailableItems` in `src/lib/srsProviders.ts` (lines 82–84) does not emit the card. When a caller opens the card, `PracticeCard` still grades the sentinel.

```1223:1226:src/components/PracticeCard.test.tsx
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('Type your answer...'), '(not available)');
    await user.click(screen.getByRole('button', { name: /check answer/i }));
    expect(await screen.findByText('Correct!')).toBeInTheDocument();
```

The test name is `treats the fallback string as the target answer` (`PracticeCard.test.tsx`, lines 1207–1227). The Progress page shows an em dash for the same gap. It does not show the raw sentinel (`Progress.tsx`, lines 441–456).

`docs/learning/2026-08-17-spoken-paradigm-rules.md` already speaks the stored `färdas` imperativ. This decision does not change that string.

No earlier note in `docs/learning/` or `docs/product/` picks the drill rule for deponent imperativ.

## Options and the cost to the learner

**Drill the SO form.** The learner retrieves a command the dictionary lists. For the seven lemmas below, that form equals the infinitive. The card is easy after the learner knows the pattern. Grupp 1 already has the same pattern. SO prints "tala" as "imperativ aktiv" for `tala`.

**Store an empty imperativ and set the flag.** The learner never retrieves a form SO lists. The app then teaches absence. That absence is false for these lemmas. The flag text today says modal verbs only. This option widens that contract.

**Keep the string and drop the card.** The details view can show the form. The drill never asks for it. The learner can read the form and still fail to retrieve it.

**Show a practice card that says the verb has no imperativ.** The sitting cap is 15 items (`docs/learning/session-shape-and-daily-goal.md`). A card that is not a retrieval spends one of those items. The Progress page already shows the gap.

## Rule for every deponent row

`swedish-linguist` applies this pass to every deponent row. One row gets one lookup. Do not build a stem. Do not add `-s` to a stem.

1. Open `https://svenska.se/api/search/so?q=` plus the row infinitive. Use the article whose `ordklass` is `verb`. Do not use an article whose `ordklass` is `substantiv`. `låtsas` has a verb article and a substantiv article. The substantiv id is 234577. The verb id is 234579.
2. Read the table row whose label is "imperativ deponens".
3. If that row exists, copy its printed form into `imperativ`.
4. If that row exists, leave `noNaturalImperativ` unset.
5. If that row does not exist, store `imperativ: ""`.
6. If that row does not exist, set `noNaturalImperativ`.
7. Do not invent a form.
8. Promote `lyckas` under step 3. The SO form is `lyckas`. This note does not set `grupp` or `cefr` for `lyckas`.

The seven lookups for this ticket are already done. The checkable source is the API URL in the table. The article id is the SO field `l_nr`. The public SO page renders the article only with JavaScript. That page is not the check.

| Headword   | SO label           | Printed form | Article | Source                                        |
| ---------- | ------------------ | ------------ | ------- | --------------------------------------------- |
| lyckas     | imperativ deponens | lyckas       | 233184  | https://svenska.se/api/search/so?q=lyckas     |
| misslyckas | imperativ deponens | misslyckas   | 245761  | https://svenska.se/api/search/so?q=misslyckas |
| andas      | imperativ deponens | andas        | 103794  | https://svenska.se/api/search/so?q=andas      |
| umgås      | imperativ deponens | umgås        | 374998  | https://svenska.se/api/search/so?q=umgås      |
| vistas     | imperativ deponens | vistas       | 392697  | https://svenska.se/api/search/so?q=vistas     |
| låtsas     | imperativ deponens | låtsas       | 234579  | https://svenska.se/api/search/so?q=låtsas     |
| färdas     | imperativ deponens | färdas       | 159640  | https://svenska.se/api/search/so?q=färdas     |

The six shipped rows already store that printed form. The pass leaves a matching row unchanged. When the stored string differs from the printed form, the pass replaces the stored string. `lyckas` is the row the pass adds.

SO does not print an imperativ for `kunna`. The verb article id is 220674. The source is `https://svenska.se/api/search/so?q=kunna`. That article has presens, preteritum, infinitiv, and supinum. It has no imperativ row. That is why `kunna` stays empty and flagged.

The short SO line `lyckades lyckats` also omits the imperativ. SAOL 15 does the same for a regular verb. It prints preteritum and supinum, not the imperativ (`https://svenska.se/Inledning_SAOL_15_2026.pdf`, section 2.2). Silence on that short line is not evidence of a missing form. The table row is the source.

`anse` (line 159) stores an empty imperativ and does not set the flag. The row comment already asks for a human check. This note does not decide `anse`.

## ORD-92 rule for a missing imperativ

This rule matches the deponent rule. A printed SO imperativ is a drilled card. No printed imperativ means no practice card.

1. If `imperativNotApplicable` is true, or the conjugated imperativ is `"(not available)"`, do not put that pair in the practice queue.
2. Do not render a practice card for that pair. Do not render a card whose only text is that the verb has no imperativ.
3. Do not treat `"(not available)"` as a correct answer. Do not treat it as a wrong answer the learner must type.
4. Keep the em dash on the Progress page. That page is not a practice card.

The due queue already does step 1. `PracticeCard` does not do steps 2 and 3. A direct render of `kunna` plus `imperativ` grades the sentinel as correct.

## Runner-up

The empty flag lost for these deponents. SO prints an imperativ for every lemma in the table. An empty field hides a printed form.

The flag stays the mark for a verb whose SO table has no imperativ row. This note opened the SO verb article for `kunna` only. That article has no imperativ row. This note did not open `få`, `vilja`, `måste`, or `skola`. `swedish-linguist` checks those four verbs in the data pass.

The "no imperativ" practice card lost. It spends a retrieval slot on a sentence the Progress page already shows.

## How we know this rule is wrong

The app keeps no per-answer log. Check this by hand on a sample.

A deponent imperativ card is correct on the first try for more than 90 of 100 answers. The learner copies the infinitive. Then drop that card only. Keep the stored string. The other three forms stay in the drill.

The number 90 is the same tripwire as the lure note in `docs/learning/2026-08-08-discrimination-exercise.md`. The transfer to this card is not measured. The evidence for the exact number is thin.

A later SO table prints a different imperativ for one of these lemmas. Then `swedish-linguist` replaces the stored string with the new printed form. Do not guess a third string.

## Hand-off

`swedish-linguist` owns the data pass on `src/data/verbData.ts`. Promote `lyckas` with imperativ `lyckas`. Make sure that the six shipped rows match the table. Do not set `noNaturalImperativ` on a row whose table has an imperativ row.

`frontend-expert` owns the ORD-92 fix in `src/components/PracticeCard.tsx`. The card must refuse the sentinel.

`qa` owns the regression test. Replace the test that expects `Correct!` for `"(not available)"` on `kunna`. The new test must show that this pair is not a graded answer. The due queue must still omit `kunna-imperativ`.

No `localStorage` field changes. `STORAGE_VERSION` stays 3.
