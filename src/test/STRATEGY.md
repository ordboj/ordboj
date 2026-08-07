# Test strategy

Ordböj has no backend and no accounts — the two things worth protecting are
correct Swedish and unharmed `localStorage`. This document says which layer
is responsible for catching a regression in each of those, and where a new
test belongs.

## The pyramid, as it actually exists

```
        e2e/*.spec.ts        (Playwright, real Chromium, 5 journeys)
      ───────────────────
   src/pages/*.test.tsx       (RTL + jsdom, one page at a time)
  src/components/*.test.tsx
 src/hooks/*.test.ts
───────────────────────────
   src/lib/*.test.ts          (pure functions, no DOM)
```

- **Unit** (`src/lib/srs.test.ts`, `src/lib/verbs.test.ts`) — pure
  functions, faked clock, no DOM, no React. This is where the SM-2 math,
  ease-factor floor, lapse behavior, and `isDue` boundary live. It is also
  the _only_ layer that tests them: an E2E test asserting exact interval
  math would be slow, flaky (needs real time to pass or a page-level clock
  mock), and duplicate coverage that unit tests do better in milliseconds.
- **Integration** (`src/hooks/*.test.ts`, `src/components/*.test.tsx`,
  `src/pages/*.test.tsx`) — React Testing Library + jsdom. Exercises
  hooks/components/pages wired together, including `localStorage`
  round-trips, but each test still owns one unit of the app (one hook, one
  component, one page) and mocks everything jsdom can't do (audio,
  confetti's canvas, `matchMedia`).
- **E2E** (`e2e/*.spec.ts`) — Playwright + real Chromium, mobile viewport
  (360×640). Exists because jsdom _lies_: it has no soft keyboard, no real
  focus/blur timing, no `speechSynthesis`, no `dvh` viewport units, and
  cannot prove that routing + multiple hooks + multiple pages agree with
  each other after a real page load (localStorage persistence across
  reload is not observable from a single jsdom test run). E2E is for
  full-user-journey coverage: Home → Practice → answer → Progress
  reflects it, and settings surviving a hard reload.

## When to write which

| You changed...                                                                                                                         | Write / update                              |
| -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| SM-2 math, ease/interval formula, `isDue`                                                                                              | unit test in `srs.test.ts`                  |
| verb lookup/conjugation/id logic                                                                                                       | unit test in `verbs.test.ts`                |
| a hook's `localStorage` read/write contract                                                                                            | integration test in `hooks/*.test.ts`       |
| a component's rendering/interaction logic                                                                                              | integration test in `components/*.test.tsx` |
| a page's composition of hooks + components                                                                                             | integration test in `pages/*.test.tsx`      |
| routing, cross-page flow, reload persistence, anything jsdom can't fake (soft keyboard, real focus, `speechSynthesis`, viewport units) | E2E journey in `e2e/*.spec.ts`              |

A bug found in production or by a teammate gets a regression test at the
**lowest** layer that can reproduce it. Bug #15 (queue desync) reproduces
at the E2E layer only — it depends on real navigation timing across two
due items — so it lives in `e2e/queue-desync-bug-15.spec.ts`, not as a unit
test pretending to be one.

## What stays out of E2E

- SM-2 interval/ease-factor arithmetic — unit-tested exhaustively already;
  E2E only needs "answering feels correct", not "the 7th review lands on
  the right day".
- Every verb × form combination — that's a fixture/data concern
  (`verbs.test.ts`), not a browser concern. E2E picks specific, named
  verbs (`vara`, `göra`) and doesn't try to be exhaustive.
- Visual regression / pixel snapshots — not implemented anywhere in this
  suite (see "Rules" in the QA agent brief: no whole-component snapshots).
- Voice/audio output correctness — `speechSynthesis` is mocked in E2E the
  same way it's mocked in jsdom; nobody asserts on actual audio.

## Determinism rules for E2E

- Every test gets Playwright's default fresh, isolated browser context —
  no test relies on another test's `localStorage`.
- Tests that need specific due items seed `localStorage` directly via
  `context.addInitScript` before the first navigation (see
  `e2e/support/seed.ts`), using the _public_ storage-key contract
  (`swedish-verbs-srs-progress`, `swedish-verbs-settings`), not internal
  hook state.
- No `page.waitForTimeout()` / sleeps. Waits are on real conditions
  (`expect(locator).toBeVisible()`, `toHaveURL()`, etc.).
- No real-time dependence: seeded due dates use `Date.now()` /
  far-future offsets computed at test time, never hardcoded calendar
  dates.

## Target runtimes

- Unit + integration suite (`npm test`): well under 10s (currently ~2.5s
  for 59 tests). If this creeps past 10s, look for a test that should have
  been unit-level and got promoted to RTL for no reason.
- E2E suite (`npm run test:e2e`): well under 2 minutes (currently ~3-10s
  for 5 journeys, single worker in CI). Budget assumes journeys stay
  narrow (one flow each) rather than becoming end-to-end regression sweeps
  — if a new journey needs its own multi-minute setup, that's a sign it
  belongs at the integration layer instead.

## Known gaps left open

- No cross-browser E2E (Chromium only). Safari/WebKit mobile is the
  biggest real-world gap for a phone-first app with no equivalent
  coverage anywhere else; adding a `webkit` project is cheap if a real
  Safari-only bug ever shows up, otherwise it's speculative cost today.
- No test drives the actual soft keyboard or on-screen IME composition
  for å/ä/ö — `pressSequentially` sends real keydown/input events but not
  a mobile OS keyboard. Real device/BrowserStack testing would be the next
  layer up; out of scope for this pass.
- `speechSynthesis` is not exercised end-to-end (autoplay pronunciation on
  a correct answer). Chromium's headless TTS behavior is inconsistent
  enough that asserting on it would be testing the browser, not the app.
- Bug #15's fix is not implemented here — only pinned. Once `srs-engine`
  or `frontend-expert` fixes the `getDueItems` identity/`currentIndex`
  desync, `e2e/queue-desync-bug-15.spec.ts` must be rewritten to assert
  the _correct_ behavior (card B or completion screen appears), not
  deleted.
