# Dependabot auto-merge: stay private, gate on branch protection — 2026-08-08

Ticket #49. Owner: `product-manager`. Binding on `devops`.

## 0. Decision

**Path 2 — keep the repository private and rely on real branch protection —
is the ruling, and it is already in force at zero incremental cost.** The
blocker that created ticket #49 no longer exists: the repository moved from
the personal `tugrulcan/ordboj` account (GitHub Free, where branch protection
on a private repo returned `403 Upgrade to GitHub Pro`) to the `ordboj`
organization, which is on the **Team plan** (`gh api orgs/ordboj` reports
`"plan": {"name": "team", "seats": 1}`). Branch protection is active on
`main` today with required status checks and strict up-to-date enforcement.

The existing workflow `.github/workflows/dependabot-auto-merge.yml` (merged
in PR #72, bumped in #73, formatted in #208) is exactly the shape path 1
described — approve plus `gh pr merge --auto --squash`, gated by required
checks — and **that shape is ratified as the design**. But the workflow is
currently **NON-FUNCTIONAL**: it has never enabled auto-merge on a single
PR (section 4). The gate it needs, branch protection, now exists. The
workflow itself must be repaired before this decision is realised.

Rejected:

- **Path 1, make the repository public.** Its only stated motivation was
  free branch protection, and that motivation is gone. Whether the repo
  should ever be public is a separate product decision about licensing and
  exposure, not a dependency-automation question; nothing in this note
  depends on visibility either way.
- **Path 3, scheduled self-checking merge job.** Strictly worse on every
  axis: it duplicates CI logic that then drifts, it has the
  race-window gap the issue itself admits, and its premise — that no
  enforced gate is available — is false. Do not build it. If anyone finds a
  scheduled merge workflow in `.github/workflows`, that is a defect.

## 1. The state this note ratifies

Verified on 2026-08-08 against the live repo:

- `gh repo view ordboj/ordboj` → `visibility: PRIVATE`.
- `gh api repos/ordboj/ordboj/branches/main/protection` → HTTP 200.
  Required status checks (strict, branch must be up to date): `Lint`,
  `Typecheck`, `Unit tests`, `Build`, `E2E (Playwright)`.
  `required_approving_review_count: 0`. Force pushes and deletions blocked.
- `.github/dependabot.yml` — weekly npm + github-actions updates;
  minor/patch grouped (radix / production / dev), majors fall through
  ungrouped into their own PRs.
- `.github/workflows/dependabot-auto-merge.yml` — `pull_request` trigger
  (not `pull_request_target`), acts only when
  `github.actor == 'dependabot[bot]'`, and enables auto-merge only when
  `dependabot/fetch-metadata` reports `semver-patch` or `semver-minor`.
  For grouped PRs, fetch-metadata reports the highest-severity update in
  the group, so a group containing one major is excluded as a whole.

## 2. The standing policy

**P1 — Visibility.** The repository stays private. Changing visibility is a
human decision, out of scope for every agent.

**P2 — The plan is the load-bearing wall.** Auto-merge is safe only while
branch protection is enforced. If the `ordboj` org ever downgrades to Free,
`gh pr merge --auto` loses its gate: on an unprotected branch it is no
longer a wait-for-green promise — the exact hazard #49 refused to ship. On any
downgrade, `devops` disables the workflow (delete the file or guard the job
with `if: false`) in the same change. This is the one condition under which
the workflow comes out.

**P3 — Scope stays patch + minor.** Major bumps are never auto-merged, in
either grouped or single form. They go through the `deps-pilot` process
(epic #259): changelog analysis, a fresh CI run, and a human approval queue
for any PR where application code had to change. This note does not move
that line; widening auto-merge to majors would need a new decision here.

**P4 — Close the required-checks gap.** Two CI jobs run on every PR but are
not required: `Format check` and `Validate verb data`. That is a real hole, latent today and live the moment P5 lands: a Prettier
minor bump that changes formatting rules would auto-merge with a red
`Format check`. Nothing auto-merges at present — the workflow is broken
(section 4) — so this must be fixed before P5, not after. All seven jobs in `ci.yml` are unconditional (no
path filters, no `if`), so none can hang a PR in "Expected". `devops`
therefore sets the required contexts to all seven:

```sh
gh api -X PATCH repos/ordboj/ordboj/branches/main/protection/required_status_checks \
  -F strict=true \
  -f "contexts[]=Format check" -f "contexts[]=Lint" -f "contexts[]=Typecheck" \
  -f "contexts[]=Validate verb data" -f "contexts[]=Unit tests" \
  -f "contexts[]=Build" -f "contexts[]=E2E (Playwright)"
```

Note: `strict` is a boolean field, so it needs `-F` (typed field), not
`-f` (which sends the literal string `"true"` and gets rejected with 422).
The `-f "contexts[]=..."` array entries are strings and are correct as
written.

This is a repo-settings change, not a file change. It is one of two action
items this note creates, tracked as #296 under epic #259 — the other is
P5, repairing the approve step.

**P5 — Repair the approve step (action item, `devops`-owned).** The
workflow's `gh pr review --approve "$PR_URL"` call fails on every run,
because `can_approve_pull_request_reviews` is `false` for this repo (section
4). The failure aborts the step under `bash -e`, so
`gh pr merge --auto --squash` never runs. `devops` must apply one of these
fixes:

- **Preferred:** delete the `gh pr review --approve "$PR_URL"` line from
  the `Approve and enable auto-merge for patch/minor` step in
  `.github/workflows/dependabot-auto-merge.yml`.
  `required_approving_review_count` is 0, so no approval is needed before
  `gh pr merge --auto --squash` can proceed.
- **Alternative, only if a review requirement is ever raised above 0:**
  enable the repo/org setting "Allow GitHub Actions to create and approve
  pull requests" —
  `gh api -X PUT repos/ordboj/ordboj/actions/permissions/workflow -F can_approve_pull_request_reviews=true`.
  Some org configurations still refuse this; in that case a PAT is
  required instead.

This workflow edit is `devops`-owned and is tracked as #297 under epic
#259. This note rules on which fix to take; it does not itself change the
workflow file.

**P6 — Stalled PRs.** Strict up-to-date checks mean a Dependabot PR that
falls behind `main` must be rebased before it can merge. Dependabot rebases
its own PRs; if one visibly stalls, comment `@dependabot rebase` — never
merge it by hand with checks pending.

## 3. Reconciling with "not implemented pending decision"

Issue #49 ended with "no auto-merge workflow has been added", but PR #72
later added one without a recorded product decision. This note is that
decision, made retroactively and in the workflow's favor on shape: the
artifact that shipped is the artifact path 1 specified, and the gate it
depends on now exists. But the artifact does not work (section 4): both the
ruling and a working implementation were missing, and this note only
supplies the first one. The workflow still needs the repair in P5 before
issue #49's goal — Dependabot PRs merging with no human step — is actually
met.

## 4. Current state of the pipeline (broken)

Verified on 2026-08-08 against the live repo:

- Every workflow run that reached the merge step **failed**. It failed at
  the `gh pr review --approve` call with `GraphQL: GitHub Actions is not permitted to approve pull requests. (addPullRequestReview)`.
  Cite runs 31224959360 and 31224781882 (PR #75, `production-dependencies`
  group) and runs 31249179286 and 31249379708 (PR #77, `dev-dependencies`
  group).
- The step runs under `shell: /usr/bin/bash -e`. That means the approve
  failure aborts the step immediately, and `gh pr merge --auto --squash`
  never runs.
- `gh api repos/ordboj/ordboj/actions/permissions/workflow` returns
  `{"default_workflow_permissions":"read","can_approve_pull_request_reviews":false}`.
  That setting is the root cause, and this note is the first place it is
  recorded.
- No PR in the repo has an `auto_merge_enabled` timeline event. Checked:
  #75, #77, #80, #81, #82, #210, #213, #214, #215, #218 — all return 0
  such events. PRs #75, #77, #80, #81, #82 and #210 were merged manually by
  the human `tugrulcan`, not by the workflow.
- Correctly left for humans (majors, filter working as designed): PRs
  #211–#218 (zod 4, react-router 7, tailwind-merge 3, lucide 1.x, and
  others) — the major-bump filter skips the `Approve and enable
auto-merge for patch/minor` **step**; the `auto-merge` job itself still
  reports `success`. Verified on run 31259595634 (PR #218, zod 4): job
  `success`, step `skipped`.
  Note that #80 (jsdom 26.1.0 → 30.0.1), #81 (@testing-library/jest-dom
  6.9.1 → 7.0.0), #82 (globals 15.15.0 → 17.9.0) and #210
  (actions/checkout 4 → 7) are also major bumps; they are not evidence of
  a working patch/minor gate, they were merged by hand.

## 5. Out of scope

- Making the repository public, and any licensing question that would raise.
- Automating major bumps beyond the `deps-pilot` approval queue.
- Tuning `dependabot.yml` (grouping, cadence, PR limits) — unchanged here.
- Merge queues, rulesets, or required reviews above zero — none needed for
  a one-seat org; revisit only if a second human joins.
