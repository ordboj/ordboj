import type { Page } from '@playwright/test';
import { test, expect } from './support/errorCollector';
import {
  buildParticleReadySeed,
  toV3Envelope,
  PARTICLE_SEED_CLOZE_ITEM_ID,
  SRS_STORAGE_KEY,
} from './support/seed';
import { initializeSrsState } from '../src/lib/srs';
import { particleItemId } from '../src/lib/itemIds';
import { getParticleGlyph, getVerifiedParticleVerbs } from '../src/lib/particleVerbs';

// ORD-121: the motion glyph (ORD-119) shows only on the feedback screen of a
// flagged entry, plays once for 0.7 s, and sits at its rest frame under
// prefers-reduced-motion
// (docs/learning/2026-11-10-particle-motion-glyphs.md rules 1-5).
//
// Seeds exactly one due card. pv:ga-in is flagged (glyph 'in'); pv:tycka-om is
// not. Neither has excludedParticles, so the card is always a typed cloze.

const FLAGGED_ID = 'pv:ga-in';
const FLAGGED_ITEM_ID = particleItemId(FLAGGED_ID, 'cloze');

async function seedSingleDueCard(page: Page, dueItemId: string) {
  const { items } = await buildParticleReadySeed();
  // buildParticleReadySeed pins pv:tycka-om as the due card; move the due
  // state to the requested item instead (everything else stays "not due").
  if (dueItemId !== PARTICLE_SEED_CLOZE_ITEM_ID) {
    items[PARTICLE_SEED_CLOZE_ITEM_ID] = {
      ...items[PARTICLE_SEED_CLOZE_ITEM_ID]!,
      dueAt: items[FLAGGED_ITEM_ID]!.dueAt,
    };
    items[dueItemId] = {
      ...initializeSrsState(dueItemId),
      repetitions: 3,
      dueAt: Date.now(),
    };
  }
  await page
    .context()
    .addInitScript(
      ([key, value]) => window.localStorage.setItem(key, value),
      [SRS_STORAGE_KEY, toV3Envelope(items)],
    );
}

// An introduction is blocked while a sibling of the same base verb has state,
// so the sitting is deterministic only for an entry that is the sole verified
// entry of its base verb.
const soleOfBase = getVerifiedParticleVerbs().filter(
  (entry) =>
    getVerifiedParticleVerbs().filter((other) => other.baseInfinitive === entry.baseInfinitive)
      .length === 1,
);
const INTRO_FLAGGED = soleOfBase.find((entry) => getParticleGlyph(entry) !== null)!;
const INTRO_UNFLAGGED = soleOfBase.find((entry) => getParticleGlyph(entry) === null)!;

// Seeds so that `entryId` has no stored state at all (a never-met entry) and
// nothing else is due: the sitting is exactly that entry's introduction card.
async function seedSingleIntroduction(page: Page, entryId: string) {
  const { items } = await buildParticleReadySeed();
  const tyckaId = PARTICLE_SEED_CLOZE_ITEM_ID;
  items[tyckaId] = { ...items[tyckaId]!, dueAt: items[FLAGGED_ITEM_ID]!.dueAt };
  delete items[particleItemId(entryId, 'cloze')];
  await page
    .context()
    .addInitScript(
      ([key, value]) => window.localStorage.setItem(key, value),
      [SRS_STORAGE_KEY, toV3Envelope(items)],
    );
}

// Answers the typed cloze, wrong on purpose or right.
async function answer(page: Page, text: string, expected: 'Correct!' | 'Not quite') {
  await page.getByRole('textbox').fill(text);
  // An exact match auto-submits and removes the button; otherwise click it.
  const check = page.getByRole('button', { name: 'Check Answer' });
  if ((await check.count()) > 0) await check.click();
  await expect(page.getByText(expected)).toBeVisible();
}

const MOVER = '.particle-glyph-mover';

// The mover loops (decision H): ONE infinite animation, 2700 ms per cycle,
// 700 ms of movement then 2000 ms at rest. Seeks the real animation to
// `ms` and reports the CSS translation it resolves to, so the keyframes are
// checked deterministically instead of by wall-clock sampling.
async function translationAt(page: Page, ms: number) {
  return page.locator(MOVER).evaluate((el, at) => {
    const [animation] = el.getAnimations();
    animation!.pause();
    animation!.currentTime = at;
    const transform = getComputedStyle(el).transform;
    if (transform === 'none') return { x: 0, y: 0 };
    const m = new DOMMatrixReadOnly(transform);
    return { x: m.e, y: m.f };
  }, ms);
}

const isTranslated = (t: { x: number; y: number }) => Math.hypot(t.x, t.y) > 1;
const isRest = (t: { x: number; y: number }) => Math.hypot(t.x, t.y) < 0.01;

test.describe('motion glyph on the particle-verb feedback screen', () => {
  test('without reduced motion: loops every 2.7 s (0.7 s move, 2 s rest), replay restarts it', async ({
    page,
  }) => {
    await seedSingleDueCard(page, FLAGGED_ITEM_ID);
    await page.goto('/practice-particles');
    await expect(page.getByText('Fill in the missing particle')).toBeVisible();

    // Rule 1: nothing on the prompt before answering.
    await expect(page.getByRole('button', { name: /Replay movement/ })).toHaveCount(0);
    await expect(page.locator(MOVER)).toHaveCount(0);

    await answer(page, 'ut', 'Not quite');
    const replay = page.getByRole('button', { name: 'Replay movement: in' });
    await expect(replay).toBeVisible();
    await expect(page.locator(MOVER)).toHaveCount(1);

    const box = await replay.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);

    const loop = await page.locator(MOVER).evaluate((el) => {
      const style = getComputedStyle(el);
      const animations = el.getAnimations();
      const timing = animations[0]?.effect?.getTiming();
      return {
        name: style.animationName,
        cssIterations: style.animationIterationCount,
        count: animations.length,
        iterations: timing?.iterations,
        duration: timing?.duration,
        delay: timing?.delay,
      };
    });
    expect(loop.name).toBe('particle-glyph-move');
    expect(loop.cssIterations).toBe('infinite');
    expect(loop.count).toBe(1);
    expect(loop.iterations).toBe(Infinity);
    expect(loop.duration).toBe(2700);
    expect(loop.delay).toBe(0);
    // Movement part of the cycle: 700 ms <= 1.5 s cap.
    expect((700 / 2700) * loop.duration).toBeLessThanOrEqual(1500);

    // Moves in 0-700 ms, rests until 2700, then moves again.
    expect(isTranslated(await translationAt(page, 100))).toBe(true);
    expect(isRest(await translationAt(page, 1000))).toBe(true);
    expect(isTranslated(await translationAt(page, 2800))).toBe(true);
    expect(isRest(await translationAt(page, 3800))).toBe(true);

    // Replay: mark the old mover; a restart swaps in a fresh node whose
    // single infinite animation starts over at the beginning of a cycle.
    await page.locator(MOVER).evaluate((el) => el.setAttribute('data-played', '1'));
    await replay.click();
    const fresh = page.locator(MOVER);
    await expect(fresh).toHaveCount(1);
    expect(await fresh.getAttribute('data-played')).toBeNull();
    const restarted = await fresh.evaluate((el) => {
      const [animation] = el.getAnimations();
      return {
        count: el.getAnimations().length,
        name: (animation as CSSAnimation | undefined)?.animationName,
        time: Number(animation!.currentTime),
      };
    });
    expect(restarted.count).toBe(1);
    expect(restarted.name).toBe('particle-glyph-move');
    // Freshly restarted: well inside the first cycle, not the 3800 ms we left it at.
    expect(restarted.time).toBeLessThan(1500);

    // The glyph never blocks the way out.
    await expect(page.getByRole('button', { name: 'Next Card' })).toBeEnabled();
  });

  test('with reduced motion: no replay button, rest frame immediately, Next Card works', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await seedSingleDueCard(page, FLAGGED_ITEM_ID);
    await page.goto('/practice-particles');
    await expect(page.getByText('Fill in the missing particle')).toBeVisible();
    await expect(page.locator(MOVER)).toHaveCount(0);

    await answer(page, 'in', 'Correct!');
    await expect(page.locator(MOVER)).toHaveCount(1);
    await expect(page.getByRole('button', { name: /Replay movement/ })).toHaveCount(0);
    await expect(page.locator(`[aria-hidden="true"] ${MOVER}`)).toHaveCount(1);

    const state = await page.locator(MOVER).evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        iterations: style.animationIterationCount,
        duration: style.animationDuration,
        transform: style.transform,
      };
    });
    // The global reduced-motion rule collapses the animation to one 0.01 ms
    // iteration: it can never loop.
    expect(state.iterations).toBe('1');
    expect(parseFloat(state.duration)).toBeCloseTo(0.00001, 8);
    expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(state.transform);

    // Nothing is running or infinite a moment later, and the rest frame holds
    // well past one 2.7 s loop cycle's movement window.
    await expect
      .poll(
        () =>
          page
            .locator(MOVER)
            .evaluate((el) => el.getAnimations().filter((a) => a.playState === 'running').length),
        { timeout: 500 },
      )
      .toBe(0);
    await page.waitForTimeout(800);
    expect(await page.locator(MOVER).evaluate((el) => getComputedStyle(el).transform)).toMatch(
      /^(none|matrix\(1, 0, 0, 1, 0, 0\))$/,
    );

    await page.getByRole('button', { name: 'Next Card' }).click();
    await expect(page.getByText('Correct!')).toHaveCount(0);
  });

  test('an unflagged entry (pv:tycka-om) shows no glyph on feedback', async ({ page }) => {
    await seedSingleDueCard(page, PARTICLE_SEED_CLOZE_ITEM_ID);
    await page.goto('/practice-particles');
    await expect(page.getByText('Fill in the missing particle')).toBeVisible();
    await expect(page.locator(MOVER)).toHaveCount(0);

    await answer(page, 'på', 'Not quite');
    await expect(page.getByText(/often/).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Replay movement/ })).toHaveCount(0);
    await expect(page.locator(MOVER)).toHaveCount(0);
  });

  test('introduction card of a flagged entry: one looping glyph', async ({ page }) => {
    await seedSingleIntroduction(page, INTRO_FLAGGED.id);
    await page.goto('/practice-particles');
    await expect(page.getByText('A new particle verb')).toBeVisible();
    await expect(
      page.getByRole('button', { name: `Replay movement: ${getParticleGlyph(INTRO_FLAGGED)}` }),
    ).toBeVisible();
    await expect(page.locator(MOVER)).toHaveCount(1);
    const timing = await page.locator(MOVER).evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        name: style.animationName,
        iterations: style.animationIterationCount,
        cycle: parseFloat(style.animationDuration) * 1000,
      };
    });
    expect(timing.name).toBe('particle-glyph-move');
    expect(timing.iterations).toBe('infinite');
    expect(timing.cycle).toBeCloseTo(2700, 0);
    expect(isTranslated(await translationAt(page, 100))).toBe(true);
    expect(isRest(await translationAt(page, 1000))).toBe(true);
    await page.getByRole('button', { name: 'Got it' }).click();
    await expect(page.getByText('A new particle verb')).toHaveCount(0);
  });

  test('introduction card with reduced motion: no replay button', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await seedSingleIntroduction(page, INTRO_FLAGGED.id);
    await page.goto('/practice-particles');
    await expect(page.getByText('A new particle verb')).toBeVisible();
    await expect(page.locator(MOVER)).toHaveCount(1);
    await expect(page.getByRole('button', { name: /Replay movement/ })).toHaveCount(0);
  });

  test('introduction card of an unflagged entry shows no glyph', async ({ page }) => {
    await seedSingleIntroduction(page, INTRO_UNFLAGGED.id);
    await page.goto('/practice-particles');
    await expect(page.getByText('A new particle verb')).toBeVisible();
    await expect(page.locator(MOVER)).toHaveCount(0);
  });
});
