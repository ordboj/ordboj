import { test, expect } from './support/errorCollector';
import {
  buildParticleReadySeed,
  toV3Envelope,
  PARTICLE_SEED_CLOZE_ITEM_ID,
  PARTICLE_SEED_ANSWER,
  SRS_STORAGE_KEY,
} from './support/seed';

// Particle-verb practice is the one structurally distinct practice mode
// (its own route, its own queue, its own scheduling rules — see
// src/lib/particleQueue.ts) and had zero E2E coverage before this spec.
// Seeded so exactly one card (pv:tycka-om's cloze) is due and every other
// verified particle-verb entry is already-met, so the sitting
// PracticeParticles builds is deterministic (see buildParticleReadySeed's
// doc comment in seed.ts for why that pinning is needed post-#315).
test.describe('particle-verb practice mode', () => {
  test('/practice-particles entry point: one typed answer, completion screen, and Progress reflects it', async ({
    page,
    context,
  }) => {
    // Pins the id shape this spec's seed depends on so a change to the
    // pv: namespace contract (src/lib/itemIds.ts, issue #350) fails here
    // loudly, rather than as an unexplained "Fill in the missing particle"
    // text never appearing below.
    expect(PARTICLE_SEED_CLOZE_ITEM_ID).toBe('pv:tycka-om:cloze');

    const { items, totalVerifiedEntries } = await buildParticleReadySeed();
    await context.addInitScript(
      ([key, value]) => window.localStorage.setItem(key, value),
      [SRS_STORAGE_KEY, toV3Envelope(items)],
    );

    await page.goto('/practice-particles');
    await expect(page.getByText('Fill in the missing particle')).toBeVisible();
    // The gloss is shown alongside the blanked sentence — same fixture as
    // PracticeParticles.test.tsx's unit coverage of this exact card.
    await expect(page.getByText('to be fond of; to enjoy')).toBeVisible();

    await page.getByRole('textbox').fill(PARTICLE_SEED_ANSWER);
    // "om" is a prefix of no other accepted particle in this frame, so it
    // auto-submits (no explicit "Check Answer" click needed) — matching the
    // unit suite's documented behavior for this exact card.
    await expect(page.getByText('Correct!')).toBeVisible();
    await page.getByRole('button', { name: 'Next Card' }).click();

    // Only one card was due, so the sitting ends immediately.
    await expect(page.getByText(/finished today's particle verbs/)).toBeVisible();

    // Progress's particle-verb summary reflects the answered card: every
    // other verified entry was seeded as already-started, so answering the
    // one remaining item brings "started" to the full total.
    await page.goto('/progress');
    await expect(
      page.getByText(
        `You've started ${totalVerifiedEntries} / ${totalVerifiedEntries} particle verbs`,
        {
          exact: false,
        },
      ),
    ).toBeVisible();
  });
});
