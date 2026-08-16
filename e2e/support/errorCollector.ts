import { test as base, expect } from '@playwright/test';

// Suite-wide error collection, generalizing the pattern csp-violations.spec.ts
// already uses for its own narrower purpose. Pattern-matched against known
// failure signatures, not "any console output" — a page this app renders
// legitimately logs things that are not bugs (e.g. a warning when
// speechSynthesis is unavailable in headless Chromium), and treating those
// as failures would make the whole suite flaky on unrelated browser noise
// instead of catching real regressions.
//
// Kept deliberately narrow. Add a pattern here only for a signature that is
// unambiguously "something broke": an uncaught JS exception, a CSP
// violation, or the app's own error-boundary reporting a crash it caught.
const ERROR_PATTERNS: RegExp[] = [
  // CSP violations. csp-violations.spec.ts already checks this against the
  // production build specifically; this generalizes the same signature to
  // every other spec so a CSP regression is never *only* caught by the one
  // spec that runs against `npm run build`.
  /Content Security Policy|Refused to/i,
  // An uncaught exception the browser itself reports, independent of
  // whatever React does with it.
  /Uncaught\s+(Type|Reference|Range|Syntax)Error/i,
  // AppErrorBoundary's own console.error calls when it catches a render
  // crash (see src/components/AppErrorBoundary.tsx) — these fire exactly
  // when a route actually broke, which is what page-tour.spec.ts exists to
  // catch across every route.
  /React error boundary caught|the above error occurred in/i,
];

export interface ErrorCollectorFixtures {
  // Auto-fixture: importing `test` from this module activates the
  // collector for every test in the file with no per-test wiring, and fails
  // the test (with the offending messages in the diff) if anything matched.
  // A spec that needs a page open with the collector already installed for
  // some code that runs before its first assertion (e.g. csp-violations.spec.ts's
  // own manual handler, or a spec asserting *the presence* of an error) can
  // still read this fixture directly for the raw match list.
  errorCollectorMatches: string[];
}

export const test = base.extend<ErrorCollectorFixtures>({
  errorCollectorMatches: [
    async ({ page }, use) => {
      const matches: string[] = [];
      const record = (text: string) => {
        if (ERROR_PATTERNS.some((pattern) => pattern.test(text))) matches.push(text);
      };
      page.on('console', (message) => record(`[console:${message.type()}] ${message.text()}`));
      page.on('pageerror', (error) => record(`[pageerror] ${error.message}`));

      await use(matches);

      expect(matches, `Unexpected browser error(s):\n${matches.join('\n')}`).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect } from '@playwright/test';
