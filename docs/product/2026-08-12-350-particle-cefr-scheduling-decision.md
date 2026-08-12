# cefrLevels scopes particle introductions only (v1)

**Issue:** #350. Related: #343,
[docs/learning/2026-08-09-particle-cefr-majority-decision.md](../learning/2026-08-09-particle-cefr-majority-decision.md).

## Decision

`cefrLevels` filters particle **introductions** only. Due reviews and recall
unlocks stay unfiltered in v1.

## Reason

An item already scheduled belongs to the learner. If the learner narrows
`cefrLevels` after that item entered their queue, filtering the review would
orphan it: the item would sit due forever with no path back into the queue.
Introductions have no such history. They are safe to scope.

## Scope

- `buildParticleSitting` narrows the introduction candidate pool to
  `cefrLevels`.
- Due reviews and recall unlocks read the full particle corpus, regardless
  of `cefrLevels`.
