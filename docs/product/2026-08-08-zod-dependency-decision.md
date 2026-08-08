# zod: keep the dependency, name its planned consumers — 2026-08-08

Ticket #266. Owner: `product-manager`. Resolves the contradiction that PR
#261 review finding M5 raised, and unblocks closing #22.

## 0. Decision

**Keep zod.** The test rationale is not stale. Issue #115 kept zod on
purpose — its body says verbatim: "KEEP zod (needed by store-validation
tickets)" — and those tickets exist, are open, and are scheduled:

- **#104** "Move settings to a single versioned, zod-validated Context
  provider" — P1, effort S, epic #256. Its acceptance criteria name zod
  explicitly: "Versioned envelope + zod validation, same pattern as the
  SRS store ticket."
- **#251** "Whole-app backup envelope with validated import/load" — epic
  #256, human-approved 2026-08-08, absorbs #10. Import/load validation is
  the exact job zod was kept for.

`dead-deps.test.ts:153-155` gets a comment that names this plan (section
3), and #22 closes with zod kept, per its own acceptance option.

**Runner-up: remove now, re-add when #104 lands.** It lost because it
buys nothing. An unimported dependency never enters Vite's module graph,
so zod ships zero bytes to the learner today — the only cost of keeping
it is a `node_modules` folder and lockfile entries. Removal would cost
two devops PRs (one to remove, one to re-add), two lockfile churns, and
an edit-then-revert of a qa-owned test, to save nothing measurable.
Purity ("a dep enters package.json in the PR that first imports it") is
a fine default for new dependencies; it does not justify churn for a
dependency that two live tickets in the current storage epic already
claim.

## 1. What the code actually does today

- `package.json:47` — `"zod": "^3.25.76"` in `dependencies`.
- Zero zod imports anywhere in `src/**`. The only match for `zod` in the
  source tree is `src/test/dead-deps.test.ts:153-154`, which asserts the
  package.json entry exists; it does not import the library.
- `src/test/dead-deps.test.ts:153` says only "explicitly required by the
  issue" — true, but it does not say which issue or why, which is what
  made PR #261's reviewer read it as possibly stale.
- Existing validation is hand-rolled: `useSrsProgress.ts` validates the
  v2 envelope and per-item fields manually (around lines 140-150). That
  is the "same pattern as the SRS store ticket" that #104 upgrades to
  zod for the settings store.
- History: #101 ("Version the SRS store and validate imports with zod")
  and #10 ("Validate imported and loaded SRS data") both closed as
  duplicates consolidated into epic #256 / #251 — the plan moved, it did
  not die.

## 2. The ruling in one paragraph an engineer can act on

zod stays in `package.json` at `^3.25.76`, untouched. #104 must use zod
for the settings envelope — its ticket already binds that. For #251, the
validation implementation (zod schema vs extending the existing
hand-rolled validators) is `staff-engineer`'s call at review time; this
note does not force zod into #251, it only records that #251 is one of
the two planned consumers. Nobody upgrades zod to v4 as part of this
decision; a major-version bump is epic #259 (dependencies & tooling)
work and needs its own ticket.

## 3. The test change (qa owns the file)

Replace the test at `src/test/dead-deps.test.ts:153-155` with the
following. qa applies it inside the existing `describe` block, at the
surrounding two-space indent; only the comment and the test title
change, the assertion stays identical.

Fenced as plain text, not `ts`, so this repo's `prettier --write` pre-commit
hook does not reformat the embedded snippet back to zero indent — copy it
at the indent shown.

```
  // zod has no src/** import yet, but it is not dead weight: issue #115
  // kept it deliberately ("KEEP zod (needed by store-validation tickets)")
  // and the plan is live on the board — #104 (versioned settings provider
  // with zod validation, epic #256) and #251 (whole-app backup envelope
  // with validated import/load). Ruling:
  // docs/product/2026-08-08-zod-dependency-decision.md.
  // Tripwire: if both #104 and #251 close without importing zod, this
  // rationale is dead — delete this test and file a devops ticket to
  // remove the dependency.
  it('zod is kept (planned: #104 settings validation, #251 backup envelope)', () => {
    expect(pkg.dependencies).toHaveProperty('zod');
  });
```

## 4. Tripwire — when this ruling expires

This ruling is conditional, not permanent. It expires the moment its
premise dies:

- If **both** #104 and #251 close (done or wontfix) and `src/**` still
  has zero zod imports, zod is then a genuinely dead dependency. qa
  deletes the guard test, devops removes zod from `package.json` with
  grep and build evidence, in one PR pair, no new decision note needed —
  this note pre-authorizes it.
- If either ticket lands importing zod, the guard test in section 3
  becomes redundant (the import itself keeps the dependency honest) and
  qa may delete it in that ticket's PR.

Enforcement: a comment on #104 and on #251 links this note, so the
ticket that closes last surfaces the tripwire.

## 5. Acceptance criteria

QA can take these verbatim.

1. `package.json` `dependencies` still contains `zod` at `^3.25.76`
   after the change; `git diff` on the PR does not touch `package.json`
   or `package-lock.json`.
2. `src/test/dead-deps.test.ts` contains the section-3 comment naming
   #104, #251 and this note's path; the assertion
   `expect(pkg.dependencies).toHaveProperty('zod')` is unchanged.
3. `npm run lint`, `npm run typecheck`, `npm test` and `npm run build`
   all pass on this PR.
4. #22 is closed with a comment linking this note and stating the
   outcome: zod kept by decision, all other #22 removals already
   verified by `dead-deps.test.ts`.
5. #266 is closed by this PR, which carries both the note and the
   section-3 test comment.

## 6. Out of scope, and why

- **Removing zod.** Section 0. Re-enters only via the section-4
  tripwire.
- **Upgrading zod to v4.** Major bump, epic #259, own ticket, own
  review. Nothing in #104 or #251 needs the v4 API.
- **Choosing the validation library for #251.** `staff-engineer` decides
  at implementation; both zod and the existing hand-rolled pattern
  satisfy #251's acceptance criteria as written.
- **Adding zod imports now to "justify" the dependency.** Speculative
  code to defend a manifest line is worse than the manifest line.

## 7. Ownership

| Part                                                   | Owner             |
| ------------------------------------------------------ | ----------------- |
| This ruling                                            | `product-manager` |
| Test comment update (section 3)                        | `qa`              |
| `package.json` (no change now; tripwire removal later) | `devops`          |
| #251 validation-library call                           | `staff-engineer`  |
| Closing #22 and #266, board updates                    | lead              |
