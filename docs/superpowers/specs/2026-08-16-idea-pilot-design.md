# idea-pilot — idea intake and ticketing workflow

**Date:** 2026-08-16
**Status:** Implemented
**Artifact:** `.claude/workflows/idea-pilot.js` (Workflow tool script, same family as `ticket-pilot` and `deps-pilot`)

## Problem

The human sends raw ideas in free form: "should we add X?", "do not forget
Y", "what if Z worked differently?". Today there is no defined path from such
a note to work on the board. Each note needs the same treatment: the team
examines it, the team decides if it has value, and approved ideas become
scoped tickets. `idea-pilot` makes this path one repeatable workflow.

## Decisions (agreed with the human)

1. **Value comes first.** Four assessors judge value before anyone
   discusses requirements or implementation: the three business owners
   (`srs-engine`, `swedish-linguist`, `learning-designer`) judge learner
   value, and the `ui-ux-expert` judges experience value (flow, mobile
   ergonomics, cognitive load). An idea with no value stops there.
2. **The team debates.** The assessors assess blind and in parallel. The
   `design-critic` then attacks their reasoning. Challenged assessors get
   one rebuttal round. The debate is bounded: one critique, at most one
   rebuttal per assessor.
3. **Fable rules.** A Fable agent acts as the product owner's delegate and
   speaks last: `pursue` with a settled scope, `reject` with a reason, or
   `needs-human` with exactly one precise question. Rejection is a normal
   outcome, not a failure.
4. **`staff-engineer` gates feasibility.** Only pursued ideas reach this
   stage. The staff engineer checks architecture fit and splits the scope
   into tickets.
5. **Tickets are scoped for parallel work.** One ticket has one owner, and
   every file in it belongs to that owner. Tickets in one batch
   (`parallelGroup`) have disjoint owners and disjoint files. Real build
   order constraints become `dependsOn` edges across batches. This shape
   lets `ticket-pilot` run a batch in parallel.
6. **The workflow stops at the board.** It creates one epic issue plus
   sub-issues in the GitHub Project (status Todo) and returns a `runPlan`.
   It never implements. The lead then asks the human whether to launch
   `ticket-pilot` with the run plan. The human's explicit yes is required.

## Phases

| Phase       | Who                         | Output                                     |
| ----------- | --------------------------- | ------------------------------------------ |
| Intake      | 1 agent                     | distinct ideas, deduped against the board  |
| Value       | 3 owners + ui-ux, blind     | worth + rationale + concerns per assessor  |
| Debate      | design-critic (+ rebuttals) | challenges, contested flag, narrowed scope |
| Verdict     | Fable as product owner      | pursue / reject / needs-human              |
| Feasibility | staff-engineer              | ticket breakdown with batches and edges    |
| Ticketize   | 1 board scribe, serialized  | epic + sub-issues on the project board     |

Ideas flow through the pipeline independently. Only board writes serialize,
so two ideas never race `gh project item-add`.

## Hard rules

- No implementation and no production-code edits in any stage.
- A ticket that changes a localStorage shape carries `risky=true` and states
  the version bump plus forward migration in its acceptance criteria. The
  merge also needs the human's schema approval (CLAUDE.md rule).
- Verb-data content changes carry `risky=true` for the same reason: wrong
  Swedish is worse than missing Swedish.
- Unsettled pedagogy or product questions become `decision` tickets in batch
  1. Implementation tickets depend on them.
- `needs-human` verdicts skip the board. The lead relays the question and
  waits.
- The lead never launches `ticket-pilot` without the human's explicit yes.

## Error handling

- An agent that returns `null` fails only its own idea. The idea is reported
  as `failed` in the summary; other ideas continue.
- Ideas that an open issue already covers are reported as `alreadyTracked`
  and are not re-processed.
- Every bounded decision (missing assessment, failed stage) is logged via
  `log()` — no silent drops.

## Out of scope

- Implementation of the tickets (`ticket-pilot` owns that).
- Recurring or scheduled runs.
- Changes to existing board items or epics.
