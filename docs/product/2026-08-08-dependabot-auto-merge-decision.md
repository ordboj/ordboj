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

Consequently the existing workflow
`.github/workflows/dependabot-auto-merge.yml` (merged in PR #72, bumped in
#73, formatted in #208) **is ratified as the implementation**. It is exactly
the workflow path 1 described — approve plus `gh pr merge --auto --squash`,
gated by required checks — and it was only ever unsafe without branch
protection. With protection in place it is safe, and its merge history
proves the loop closes (section 4).

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
`gh pr merge --auto` on an unprotected branch degrades to "merge
immediately, checks pending" — the exact hazard #49 refused to ship. On any
downgrade, `devops` disables the workflow (delete the file or guard the job
with `if: false`) in the same change. This is the one condition under which
the workflow comes out.

**P3 — Scope stays patch + minor.** Major bumps are never auto-merged, in
either grouped or single form. They go through the `deps-pilot` process
(epic #259): changelog analysis, a fresh CI run, and a human approval queue
for any PR where application code had to change. This note does not move
that line; widening auto-merge to majors would need a new decision here.

**P4 — Close the required-checks gap.** Two CI jobs run on every PR but are
not required: `Format check` and `Validate verb data`. That is a real hole:
a Prettier minor bump that changes formatting rules currently auto-merges
with a red `Format check`. All seven jobs in `ci.yml` are unconditional (no
path filters, no `if`), so none can hang a PR in "Expected". `devops`
therefore sets the required contexts to all seven:

```sh
gh api -X PATCH repos/ordboj/ordboj/branches/main/protection/required_status_checks \
  -f strict=true \
  -f "contexts[]=Format check" -f "contexts[]=Lint" -f "contexts[]=Typecheck" \
  -f "contexts[]=Validate verb data" -f "contexts[]=Unit tests" \
  -f "contexts[]=Build" -f "contexts[]=E2E (Playwright)"
```

This is a repo-settings change, not a file change; it is the only action
item this note creates.

**P5 — Keep the approve step.** `required_approving_review_count` is 0, so
the workflow's `gh pr review --approve` is currently redundant. Keep it
anyway: it costs one API call and keeps the pipeline working unchanged if
the review requirement is ever raised to 1.

**P6 — Stalled PRs.** Strict up-to-date checks mean a Dependabot PR that
falls behind `main` must be rebased before it can merge. Dependabot rebases
its own PRs; if one visibly stalls, comment `@dependabot rebase` — never
merge it by hand with checks pending.

## 3. Reconciling with "not implemented pending decision"

Issue #49 ended with "no auto-merge workflow has been added", but PR #72
later added one without a recorded product decision. This note is that
decision, made retroactively and in the workflow's favor: the artifact that
shipped is the artifact path 1 specified, and the gate it depends on now
exists. Nothing needs to be reverted; what was missing was the ruling, not
the code.

## 4. Evidence the pipeline works

- Auto-merged by the gate (patch/minor, green checks): PRs #75, #77, #80,
  #81, #82, #210 — including the grouped `production-dependencies` and
  `dev-dependencies` PRs.
- Correctly left for humans (majors): PRs #211–#218 (zod 4, react-router 7,
  tailwind-merge 3, lucide 1.x, and others) — open or closed manually,
  none auto-merged.

## 5. Out of scope

- Making the repository public, and any licensing question that would raise.
- Automating major bumps beyond the `deps-pilot` approval queue.
- Tuning `dependabot.yml` (grouping, cadence, PR limits) — unchanged here.
- Merge queues, rulesets, or required reviews above zero — none needed for
  a one-seat org; revisit only if a second human joins.
