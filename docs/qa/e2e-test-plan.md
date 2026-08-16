# Ordböj E2E test catalog

Author: qa · Status: **implemented** (issue #412) · Supersedes the scratchpad
drafts (`draft-v1.md`, `critique-design.md`, `critique-staff.md`,
`draft-v2.md`) this catalog was built from — this file is the checked-in
record; those were working notes and are not duplicated here.

## Phase 0 — prerequisite fix (done)

**Defect (staff-engineer, severity high), fixed:** `e2e/support/seed.ts` used
to write a bare `{ itemId: ..., ...state }` map straight to
`swedish-verbs-srs-progress`, with no `{ version, items }` envelope — the
legacy pre-v3 shape. Every seeded E2E run was silently exercising
`rebaseLegacyEase` and the legacy migration path instead of the current v3
read path.

Fixed:

1. `seed.ts` now exposes `toV3Envelope(items)`, which every spec but one
   calls before writing `SRS_STORAGE_KEY`: `{ version: 3, items }`, with
   `itemId` stripped from every item (matching `toStoredItems`'s contract,
   issue #53).
2. All 6 pre-existing specs were re-run against the fixed seed and pass
   (see "Measured run" below). No spec's assertions turned out to be quietly
   depending on a migration side effect (e.g. a rebased ease value) — nothing
   needed a follow-up ticket.
3. `queue-desync-bug-15.spec.ts` renamed to `queue-desync-bug-103.spec.ts`
   (the file's own body already used #103 throughout; only the filename and
   one cross-reference in `full-loop.spec.ts`'s comment were stale).
4. `buildLegacyV1Seed()` was added as a separate, unmistakably-named export
   — never the default `buildFullSeed` — and is the _only_ seed builder
   allowed to produce the legacy shape. Exactly one spec uses it:
   `legacy-migration-boot.spec.ts` (catalog #12). Its first review (the
   adversarial review below, finding F1) caught that it initially produced
   canonical- rather than positionally-keyed ids, which made the id re-key
   migration branch an untested identity pass; fixed before this doc's
   status went to "implemented".

## Final spec catalog

### P0 — critical path (smoke gate)

| #   | Spec                           | Story                                                                                    | Status |
| --- | ------------------------------ | ---------------------------------------------------------------------------------------- | ------ |
| 1   | `first-run.spec.ts`            | New user opens the app for the first time                                                | done   |
| 2   | `full-loop.spec.ts`            | Answer a card correctly, check Progress                                                  | done   |
| 3   | `settings-persistence.spec.ts` | Multiple-choice mode survives a reload                                                   | done   |
| 4   | `backup-round-trip.spec.ts`    | Export progress, restore on a "new device", import doesn't clobber settings being viewed | done   |

### P1 — important (smoke gate)

| #   | Spec                                                  | Story                                                                                   | Status          |
| --- | ----------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------- |
| 5   | `due-count-sanity.spec.ts`                            | Due badge matches what Practice serves, including after narrowing CEFR levels           | done (extended) |
| 6   | `queue-desync-bug-103.spec.ts`                        | Answering the first of several due cards doesn't blank the page                         | done (renamed)  |
| 7   | `particle-mode.spec.ts`                               | `/practice-particles` entry point, one typed answer, completion, Progress reflects it   | done            |
| 8   | `reset-progress.spec.ts`                              | Reset is a real gate and a real wipe (cancel/confirm/reload, PR #311)                   | done            |
| 9   | `page-tour.spec.ts` + `e2e/support/errorCollector.ts` | Settings and empty/idle Progress states, suite-wide error fixture applied to specs 1-11 | done            |

### P2 — pre-release gate only (not in routine smoke)

| #   | Spec                             | Story                                                                       | Status                                                                          |
| --- | -------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 10  | `csp-violations.spec.ts`         | Production build doesn't violate its own CSP                                | done (existing, switched to the shared error fixture)                           |
| 11  | `malformed-storage-boot.spec.ts` | Corrupted localStorage doesn't white-screen the app                         | done                                                                            |
| 12  | `legacy-migration-boot.spec.ts`  | Pre-v3 bare-map install boots and migrates cleanly, including the id re-key | done (Phase 0 follow-through, `buildLegacyV1Seed`; see "Adversarial review" F1) |

**Cut entirely:** read-only-banner-on-newer-version store (v1 case 13). See
"Contested points" below — resolved, cut stands.

**Total: 12 specs**, 15 test cases across them (`due-count-sanity`,
`malformed-storage-boot` and `reset-progress` each hold 2).

## Smoke-gate subset (routine ticket-pilot pass)

Specs **1–9** (all P0 + P1), `playwright test --project=mobile-chrome`,
against `npm run dev` (port 4173) — no production build in the routine path.
Specs 10–12 run only at the pre-release gate.

## Determinism rules

1. **Seed via localStorage, before `goto`, always** — with one documented
   exception (see rule 2's note on `reset-progress.spec.ts` and
   `backup-round-trip.spec.ts` below). Every spec needing a specific
   due/not-due or progress state calls a `seed.ts` builder and writes it
   before the app's first mount, via `context.addInitScript`.
2. **`buildFullSeed`/`buildSingleDueSeed` always write the current v3
   envelope** via `toV3Envelope`. `buildLegacyV1Seed` is the sole,
   explicitly named exception, used by exactly one spec (#12).

   Implementation note found while building #4 and #8: `context.addInitScript`
   re-runs before _every_ navigation in a context, including a `reload()`.
   A spec that wipes storage or resets progress and then reloads to prove
   the wipe persisted cannot seed with `addInitScript`, because the init
   script would silently resurrect the pre-wipe seed on that same reload and
   make the assertion vacuous. `backup-round-trip.spec.ts` and
   `reset-progress.spec.ts`'s confirm case instead seed with one
   `page.evaluate(...)` write immediately after the first `goto`, followed
   by one `page.reload()` — a one-shot seed of the first real mount, with no
   ongoing effect to fight the test's own later reload(s).

3. **`first-run.spec.ts` stays unseeded** — a genuinely empty context is
   itself the fixture for "brand new install."
4. **Hard rule, no exceptions without staff-engineer review: E2E never
   mocks the clock.** `page.clock` is rejected as precedent — it doesn't
   survive the real reloads several specs depend on, and would silently
   start testing the mock instead of the app. Date-boundary behavior (DST,
   month rollover, end-of-day `isDue` clamp) stays exclusively in
   `srs.test.ts` under `vi.setSystemTime`.
5. Item ids are hardcoded against known-stable verbs (`vara`, `komma`,
   `unna`, `tycka`; infinitive-keyed per issue #53), safe specifically
   because `verbs.test.ts` pins id stability upstream — if that contract
   ever changes, the unit test fails first and loudly.
6. Suite-wide error collection (case 9) is pattern-matched
   (`e2e/support/errorCollector.ts`), not "fail on any console message" —
   the same discipline `csp-violations.spec.ts` already used, generalized
   and applied to every spec 1–11 (not 12: `legacy-migration-boot.spec.ts`
   deliberately seeds console.error-producing migration paths on purpose and
   stays on the plain `@playwright/test` import to keep that scoping
   explicit).
7. **Coalesced writes.** The SRS store's writer debounces ~500ms and
   flushes on `pagehide`/`visibilitychange`→hidden (`src/lib/storage.ts`).
   A spec that answers a card and then needs the write to be visible to a
   _freshly mounted_ page (a real navigation, not the same mounted
   component) dispatches a synthetic `pagehide` event via `page.evaluate`
   first, rather than racing the debounce timer. `backup-round-trip.spec.ts`
   and `legacy-migration-boot.spec.ts` both do this.

## Ownership

`CLAUDE.md`'s qa row reads
`*.test.ts(x), *.spec.ts, src/test/**, e2e/**, vitest.config.ts, playwright.config.ts`
(applied by the lead, human approval confirmed — see "Adversarial review" F4
below). `playwright.config.ts` and `vitest.config.ts`'s header comments read
"Owned by qa" instead of the stale "test-engineer" (a role that was never in
CLAUDE.md's team table).

## Sandbox portability fix (found while measuring, not part of the original catalog)

Two environment issues blocked every run on the measurement box and are
fixed in `playwright.config.ts`:

- **No IPv6 stack.** Vite's default dev/preview bind is dual-stack; a bare
  `::` bind fails with `EAFNOSUPPORT` on a host with no `/proc/net/if_inet6`.
  Both webServer commands pass `--host 127.0.0.1` explicitly, and
  `BASE_URL`/`PROD_BASE_URL` use the literal `127.0.0.1` instead of
  `localhost`. Harmless on every host class — no gate needed.
- **Chromium revision mismatch, no network access to fetch a new one.** The
  installed `@playwright/test@1.62.1` expects Chromium build 1234; the
  measurement box only had 1194 pre-provisioned, and `npx playwright install`
  is blocked by egress policy (`cdn.playwright.dev` denied — reported, not
  worked around). `resolveLocalChromiumExecutable()` in `playwright.config.ts`
  falls back to whatever `chromium-<rev>` build actually exists under
  `PLAYWRIGHT_BROWSERS_PATH`. **Gated behind `ORDBOJ_PW_CHROMIUM_FALLBACK=1`**
  (fixed per the adversarial review's F2 finding below) — unset by default,
  including in real CI, where `PLAYWRIGHT_BROWSERS_PATH` is a normal env var
  and firing on its mere presence would have silently accepted a
  version-mismatched browser cache instead of failing loudly. Set the env
  var only when actually running on this specific sandbox; it prints a
  console warning naming the exact substitution whenever it fires.

## Measured run (issue #412, resolves staff Decision 4.5 — no longer an estimate)

Environment: sandbox VM, `node_modules` installed via `npm ci`, Chromium
1194 (see portability note above), `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`,
`ORDBOJ_PW_CHROMIUM_FALLBACK=1` (sandbox-only, see above).

```
$ time npx playwright test
Running 15 tests using 2 workers
  15 passed (28.7s)

real    0m29.868s
user    0m26.121s
sys     0m12.268s
```

That is the full suite, both projects (`mobile-chrome`, specs 1–9 and
11–12, plus `csp-prod-build`'s `csp-violations.spec.ts`, #10) — 15 test
cases across 12 spec files. `mobile-chrome` alone (`--project=mobile-chrome`,
the routine ticket-pilot smoke-gate command) measured 14 passed in 23–24s
across repeated runs on this box, `workers: undefined` (CPU-count-based
parallelism locally, not the CI-pinned 2).

Both land comfortably under the ≈5–6 minute target the unmeasured v2 draft
estimated — real parallel wall-clock time, not the ≈4m05s serial estimate
that draft carried forward from a smaller PR #409 run.

## Adversarial review (design-critic, post-implementation)

A second reviewer re-ran the suite independently against `git diff
origin/main...HEAD` rather than trusting the pasted output, and returned
REJECT with a narrow, bounded remediation scope (full report:
`review-final.md` in the working scratchpad). Two findings required a code
fix; both are applied and re-verified:

- **F1 (blocker) — `buildLegacyV1Seed` didn't produce what a real pre-v3
  install has on disk.** It returned `buildFullSeed`'s bare map verbatim,
  which is keyed by **canonical** (infinitive) ids. A real pre-#53 store was
  keyed **positionally** (`1-presens`, not `vara-presens`) —
  `useSrsProgress.ts`'s `LEGACY_CONJUGATION_KEY` regex only matches
  `^\d+-<form>$`, and `migrateConjugationKeys` exists specifically to re-key
  that onto today's canonical id on load. With infinitive keys the regex
  never matched, so the migration ran as a silent identity pass — the
  riskiest branch of the legacy migration (re-keying learner data across the
  id-scheme change) had zero real coverage while the spec's own comments and
  this doc claimed otherwise. Fixed: `buildLegacyV1Seed` now builds genuine
  positional keys (`e2e/support/seed.ts`'s `positionalItemId` /
  `getVerbPosition`), and `legacy-migration-boot.spec.ts` asserts three
  things the old version didn't: the answered item lands under its canonical
  id (`vara-presens`) in the migrated v3 store, the pre-v3 backup preserves
  the _positional_ key verbatim, and (the review's suggested bonus, included)
  a second seeded item's ease factor is visibly rebased from 1.3 to the 1.8
  floor by the one-time legacy rebase.
- **F2 (major) — the Chromium fallback fired on any host with
  `PLAYWRIGHT_BROWSERS_PATH` set.** That env var is the standard mechanism
  real CI uses for browser caching, not a sandbox-specific signal; picking
  the highest `chromium-<rev>` on disk without checking it against what
  `@playwright/test` actually expects would silently accept a
  version-mismatched build on a normal CI host instead of failing loudly.
  Fixed: gated behind `ORDBOJ_PW_CHROMIUM_FALLBACK=1` (opt-in, sandbox-only,
  never set in CI), with a console warning naming the exact substituted
  binary whenever it fires. Re-verified both ways: unset, the suite fails
  with Playwright's own correct "Executable doesn't exist… run playwright
  install" error; set, all 15 specs pass.
- **F3 (major) — the ticket-pilot smoke-stage acceptance criterion.**
  Resolved by the lead directly (`.claude/workflows/ticket-pilot.js`, commit
  `e4402a4`): the ship stage now runs the `mobile-chrome` smoke suite after
  CI goes green, with a stated-reason skip (not a silent pass) on a box that
  cannot run browsers.
- **F4/F5 (minor, no code change required).** F4 (CLAUDE.md ownership
  approval) — the lead applied the row edit directly (commit `cc99e4a`),
  closing the "asserted, not verifiable" gap this doc flagged. F5
  (`/Refused to/i` broader than CSP in `errorCollector.ts`) — accepted as a
  watch item, not a defect; no pattern-list change made.

## Contested points — resolved

1. **CLAUDE.md ownership extension.** Resolved: the lead applied the row
   edit directly (commit `cc99e4a`, human approval confirmed) — see
   "Adversarial review" F4 above.
2. **Legacy-migration fixture (`buildLegacyV1Seed` + spec #12).** Resolved:
   built as originally proposed (Phase 0), and flagged here for a PR-review
   pass by staff-engineer / design-critic specifically because it is new
   surface area neither prior critique had signed off on — the same
   standard every other spec in this catalog got.
3. **Timed budget run (staff Decision 4.5).** Resolved: see "Measured run"
   above. No longer a blocker for wiring the smoke gate into ticket-pilot on
   the budget-number question; the sandbox portability fixes above are a
   new, separate finding from doing the measurement, not a re-opening of
   this point.
