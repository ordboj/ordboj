# deps-pilot — Dependabot PR merge workflow

**Date:** 2026-08-08
**Status:** Approved design, pending implementation plan
**Artifact:** `.claude/workflows/deps-pilot.js` (Workflow tool script, same family as `ticket-pilot`)

## Problem

The repo has ~18 open Dependabot PRs. The existing `dependabot-auto-merge.yml`
workflow already approves and auto-merges patch/minor PRs when CI is green,
but it cannot help with:

- PRs opened before that workflow existed (stale branches, auto-merge job never ran)
- Major version bumps (deliberately excluded from auto-merge)
- PRs whose CI fails and needs diagnosis
- Branches that fall behind `main` after every merge

`deps-pilot` closes that gap in a single orchestrated run. The GitHub Actions
auto-merge workflow stays in place for future minor/patch PRs; deps-pilot is
idempotent alongside it.

## Decisions (agreed with the human)

1. **Majors are in scope.** For each major bump the agent reads the release
   notes/changelog, compares breaking changes against actual usage in the
   codebase, and adapts the code when needed.
2. **Merge authority: "pure bump merges itself, code change asks first."**
   - Bump-only PR (no application code touched) + green CI → autonomous
     merge, minor _and_ major.
   - Any PR where an agent had to modify application code (API adaptation,
     CI-failure fix, test update caused by an API change) is prepared but
     **not merged** — it enters an approval queue for the human.
3. **Execution model: parallel analysis, serial merge.** Analysis fans out;
   the merge queue is strictly serial because every merge invalidates the
   other branches' up-to-date status. One-shot run (no cron).

## Phases

### Phase 1 — Inventory (1 agent)

`gh pr list` over open Dependabot PRs. For each: update-type
(patch/minor/major, from title + `gh api`), mergeable/conflict state, CI
status, branch-behind-base. Output: classified PR list (structured JSON).

### Phase 2 — Analysis (parallel, majors only)

One agent per **major** PR (~10–12). Minor/patch grouped PRs skip analysis —
by dependabot config they contain no majors, so they are clean by
definition. This keeps total agent count near the ≤15 guideline.

Each analysis agent:

- fetches release notes / changelog (WebFetch)
- greps the codebase for usage of changed/removed APIs
- returns one of:
  - `clean-bump` — no code impact
  - `needs-adaptation` — with a concrete list of required code changes
  - `blocked` — peer-dependency conflict or similar; parked with reason

### Phase 3 — Serial merge queue

Order: minor/patch groups → single minors → clean majors → adaptation
majors. Per PR:

1. Update branch (`gh pr update-branch`; on conflict, comment
   `@dependabot rebase`).
2. Wait for CI (poll `gh pr checks`).
3. Green + pure bump → squash-merge autonomously.
4. Red CI → diagnosis agent reads the failing job logs and finds the root
   cause. If the fix requires a code change, the agent prepares the fix in a
   worktree, pushes it to the PR branch, gets CI green, and routes the PR to
   the approval queue instead of merging.
5. `needs-adaptation` majors: agent commits the adaptation to the PR branch,
   gets CI green, routes to the approval queue.

### Phase 4 — Approval round (main session, after workflow returns)

One batched question to the human covering every code-changed PR: PR number,
diff summary, files touched, owning role per file (per CLAUDE.md ownership
table). Approved PRs get `gh pr merge --auto --squash` (GitHub handles the
remaining branch-update + CI wait). Rejected PRs are parked with a
`needs-human` label.

## Hard rules

- No autonomous merge of any PR where application code changed.
- Changes touching localStorage schema, verb data
  (`src/data/verbData.ts`, `public/data/swedish_verbs.csv`,
  `src/lib/verbs.ts`), or `src/lib/srs.ts` always require approval and an
  explicit callout in the approval summary.
- Tests are never weakened to pass. A CI failure is closed by fixing the
  cause; a legitimate test update forced by an upstream API change counts as
  a code change (approval queue).
- No infinite retry: if diagnosis cannot resolve a failure, the PR is parked
  with a written report.
- Workflow-script constraints apply: no `Date.now()`/`Math.random()` in the
  script body; timestamps passed via `args` if needed.

## Error handling

- Agent returning `null` (skipped/crashed) → PR stays untouched, reported in
  the final summary as unprocessed.
- `gh` failures (rate limit, network) → the PR is skipped for this run, not
  retried in a loop.
- Every bounded decision (skipped PR, parked PR, truncated analysis) is
  logged via `log()` — no silent drops.

## Out of scope

- Replacing or modifying `dependabot-auto-merge.yml` or `dependabot.yml`.
- Recurring/cron scheduling (can be added later if the one-shot run proves out).
- Non-Dependabot PRs (#76, #83 are untouched).
