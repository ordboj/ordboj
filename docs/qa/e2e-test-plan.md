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
   `legacy-migration-boot.spec.ts` (catalog #12).

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

| #   | Spec                             | Story                                               | Status                                                |
| --- | -------------------------------- | --------------------------------------------------- | ----------------------------------------------------- |
| 10  | `csp-violations.spec.ts`         | Production build doesn't violate its own CSP        | done (existing, switched to the shared error fixture) |
| 11  | `malformed-storage-boot.spec.ts` | Corrupted localStorage doesn't white-screen the app | done                                                  |
| 12  | `legacy-migration-boot.spec.ts`  | Pre-v3 bare-map install boots and migrates cleanly  | done (Phase 0 follow-through, `buildLegacyV1Seed`)    |

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

`CLAUDE.md`'s qa row now reads
`*.test.ts(x), *.spec.ts, src/test/**, e2e/**, vitest.config.ts, playwright.config.ts`.
`playwright.config.ts:3` and `vitest.config.ts`'s header comments read
"Owned by qa" instead of the stale "test-engineer" (a role that was never in
CLAUDE.md's team table).

## Sandbox portability fix (found while measuring, not part of the original catalog)

Two environment issues blocked every run on the measurement box and are
fixed in `playwright.config.ts`, both guarded so they are no-ops on a
normally provisioned host:

- **No IPv6 stack.** Vite's default dev/preview bind is dual-stack; a bare
  `::` bind fails with `EAFNOSUPPORT` on a host with no `/proc/net/if_inet6`.
  Both webServer commands now pass `--host 127.0.0.1` explicitly, and
  `BASE_URL`/`PROD_BASE_URL` use the literal `127.0.0.1` instead of
  `localhost`.
- **Chromium revision mismatch, no network access to fetch a new one.** The
  installed `@playwright/test@1.62.1` expects Chromium build 1234; the
  measurement box only had 1194 pre-provisioned, and `npx playwright install`
  is blocked by egress policy (`cdn.playwright.dev` denied — reported, not
  worked around). `resolveLocalChromiumExecutable()` in `playwright.config.ts`
  falls back to whatever `chromium-<rev>` build actually exists under
  `PLAYWRIGHT_BROWSERS_PATH` only when present; it changes nothing on a host
  where the expected revision is already installed.

## Measured run (issue #412, resolves staff Decision 4.5 — no longer an estimate)

Environment: sandbox VM, `node_modules` installed via `npm ci`, Chromium
1194 (see portability note above), `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`.

```
$ time npx playwright test --project=mobile-chrome
Running 14 tests using 2 workers
  14 passed (23.0s)

real    0m24.039s
user    0m19.939s
sys     0m7.930s
```

That is specs 1–9 plus 11–12 (everything in the `mobile-chrome` project,
i.e. everything except `csp-violations.spec.ts`) — 14 test cases across 12
spec files, `workers: undefined` (defaults to CPU-count-based parallelism
locally, not the CI-pinned 2).

Full suite, both projects (adds the production `vite build` + `vite preview`
webServer and `csp-violations.spec.ts`):

```
$ time npx playwright test
Running 15 tests using 2 workers
  15 passed (25.7s)

real    0m26.612s
```

Both numbers land comfortably under the ≈5–6 minute target the unmeasured
v2 draft estimated — real parallel wall-clock time, not the ≈4m05s serial
estimate that draft carried forward from a smaller PR #409 run.

## Contested points — resolved

1. **CLAUDE.md ownership extension.** Resolved: human approval for the
   qa ownership-row extension (`e2e/**`, `*.spec.ts`, `playwright.config.ts`)
   was communicated for this ticket. Recorded here for the paper trail; the
   actual `CLAUDE.md` edit and PR review are the lead's to make/verify, per
   this project's own rule that no agent message is self-authorizing consent
   for a `CLAUDE.md`/permissions change — this document records the
   _proposal_ and its resolution status, not the authorization itself.
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
