import { test, expect } from './support/errorCollector';
import { buildSingleDueSeed, toV3Envelope, SRS_STORAGE_KEY } from './support/seed';

// This spec runs only against the production build (see the `csp-prod-build`
// project + second `webServer` entry in playwright.config.ts, which build
// `dist/` and serve it via `vite preview`). Running it against `npm run dev`
// would prove nothing: the CSP meta tag sits above Vite's dev-mode preamble
// script, so dev serves a weaker effective policy than a real static host.
//
// Regression target: PR #87 added worker-src 'self' blob: for
// canvas-confetti, and the confetti path specifically had regressed before
// (caught only by a human eyeballing devtools, not by any automated test).
// So this walks the exact path that broke: land -> start practice -> type a
// *correct* answer (which fires confetti, a Worker built from a Blob URL) ->
// advance to session end -> Progress page. Any CSP violation shows up in the
// browser console as an error whose text matches this pattern; a real
// browser (not jsdom) is required to observe that, which is why this lives
// in Playwright rather than the vitest unit guard in
// src/test/csp-meta.test.ts.
//
// The console/pageerror collection itself is the shared errorCollector
// fixture (e2e/support/errorCollector.ts) — its pattern list already
// includes the CSP violation signature this spec cares about, generalized
// across every other spec in the suite (catalog #9's "page-tour" story).
// This spec keeps its own file only for the production-build webServer/
// project wiring in playwright.config.ts, not for a separate detection
// mechanism.

const ITEM_ID = 'vara-presens'; // VERB_DATA[0] = vara, presens = "är"
const ANSWER = 'är';

test.describe('production build: no CSP violations across the practice loop', () => {
  test('lands, practices a card correctly (confetti), and reaches Progress without any CSP console errors', async ({
    page,
    context,
  }) => {
    const seed = await buildSingleDueSeed(ITEM_ID);
    await context.addInitScript(
      ([key, value]) => window.localStorage.setItem(key, value),
      [SRS_STORAGE_KEY, toV3Envelope(seed)],
    );

    await page.goto('/');
    await expect(page.getByText('1 conjugations due for review')).toBeVisible();
    await page.getByRole('button', { name: /Start Practice/ }).click();

    await expect(page).toHaveURL(/\/practice$/);
    const answerInput = page.getByPlaceholder('Type your answer...');
    await expect(answerInput).toBeVisible();

    // The correct-answer path specifically: this is what triggers
    // ConfettiEffect -> canvas-confetti's Worker-from-Blob-URL, the exact
    // mechanism worker-src blob: exists for. Typed answers no longer
    // auto-submit (#91), so grading requires the explicit click.
    await answerInput.pressSequentially(ANSWER);
    await page.getByRole('button', { name: 'Check Answer' }).click();
    await expect(page.getByText('Correct!')).toBeVisible();

    // Give the confetti worker a beat to actually spin up and (if the
    // policy were broken) throw before moving on — the violation is
    // asynchronous relative to the "Correct!" render.
    await page.waitForTimeout(500);

    await page.getByRole('button', { name: 'Next Card' }).click();
    await expect(page.getByText('Great Work!', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Back to Home' }).click();
    await expect(page).toHaveURL('/');

    await page.getByText('Progress', { exact: true }).click();
    await expect(page).toHaveURL(/\/progress$/);

    // No explicit assertion here: the errorCollectorMatches auto-fixture
    // asserts an empty match list in its own teardown once this test body
    // returns, and its pattern list is what used to be CSP_VIOLATION_PATTERN
    // above.
  });
});
