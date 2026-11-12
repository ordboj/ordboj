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
import {
  getMeaningPicture,
  getParticleGlyph,
  getVerifiedParticleVerbs,
  hasRecallItem,
} from '../src/lib/particleVerbs';

// ORD-121: the motion glyph (ORD-119) shows only on the feedback screen of a
// flagged entry, plays twice (0.7 s each, 2 s rest between, all movement over
// at 3.4 s; human decision I, docs/learning/2026-11-11-glyph-loop-auto-stop.md,
// ORD-143), and sits at its rest frame under prefers-reduced-motion
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

// The mover plays twice (decision I): ONE animation of 2 iterations, 2700 ms
// per cycle, 700 ms of movement then 2000 ms at rest. Seeks the real animation to
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
  test('without reduced motion: two plays of 2.7 s (0.7 s move, 2 s rest), then stops, replay restarts it', async ({
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
    expect(loop.cssIterations).toBe('2');
    expect(loop.count).toBe(1);
    expect(loop.iterations).toBe(2);
    expect(loop.duration).toBe(2700);
    expect(loop.delay).toBe(0);
    // Movement part of the cycle: 700 ms <= 1.5 s cap.
    expect((700 / 2700) * loop.duration).toBeLessThanOrEqual(1500);

    // Moves in 0-700 ms, rests until 2700, moves a second time, then rests
    // for good (the animation object ends at 5400 ms, holding the rest frame).
    expect(isTranslated(await translationAt(page, 100))).toBe(true);
    expect(isRest(await translationAt(page, 1000))).toBe(true);
    expect(isTranslated(await translationAt(page, 2800))).toBe(true);
    expect(isRest(await translationAt(page, 3800))).toBe(true);
    expect(isRest(await translationAt(page, 5300))).toBe(true);

    // Replay: mark the old mover; a restart swaps in a fresh node whose
    // two-play animation starts over at the beginning of a cycle.
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
    // Freshly restarted: well inside the first cycle, not the 5300 ms we left it at.
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
    // iteration, overriding the two plays: it never repeats.
    expect(state.iterations).toBe('1');
    expect(parseFloat(state.duration)).toBeCloseTo(0.00001, 8);
    expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(state.transform);

    // Nothing is running a moment later, and the rest frame holds well past
    // the first 0.7 s movement window.
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

  test('introduction card of a flagged entry: one two-play glyph', async ({ page }) => {
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
    expect(timing.iterations).toBe('2');
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

// ---------------------------------------------------------------------------
// ORD-143, human decision I: two plays, all movement over at 3400 ms, rest
// frame, tap replays, never a pause control. Timing is driven through the Web
// Animations API (seek and finish), not wall-clock sleeps, except one natural
// run to the end per surface.
// ---------------------------------------------------------------------------

const PICTURE_MOVER = '.meaning-picture-mover';
// The first verified entry that shows a meaning picture.
const PICTURE_ENTRY = getVerifiedParticleVerbs().find(
  (entry) => getMeaningPicture(entry) !== null,
)!;

interface Surface {
  title: string;
  mover: string;
  button: string;
  next: string;
  open: (page: Page) => Promise<void>;
}

const surfaces: Surface[] = [
  {
    title: 'glyph, feedback panel',
    mover: MOVER,
    button: 'Replay movement: in',
    next: 'Next Card',
    open: async (page) => {
      await seedSingleDueCard(page, FLAGGED_ITEM_ID);
      await page.goto('/practice-particles');
      await expect(page.getByText('Fill in the missing particle')).toBeVisible();
      await answer(page, 'zzz', 'Not quite');
    },
  },
  {
    title: 'glyph, introduction card',
    mover: MOVER,
    button: `Replay movement: ${getParticleGlyph(INTRO_FLAGGED)}`,
    next: 'Got it',
    open: async (page) => {
      await seedSingleIntroduction(page, INTRO_FLAGGED.id);
      await page.goto('/practice-particles');
      await expect(page.getByText('A new particle verb')).toBeVisible();
    },
  },
  {
    title: 'meaning picture, feedback panel',
    mover: PICTURE_MOVER,
    button: 'Replay picture',
    next: 'Next Card',
    open: async (page) => {
      await openPictureFeedback(page);
    },
  },
  {
    title: 'meaning picture, introduction card',
    mover: PICTURE_MOVER,
    button: 'Replay picture',
    next: 'Got it',
    open: async (page) => {
      await seedPictureIntroduction(page);
      await page.goto('/practice-particles');
      await expect(page.getByText('A new particle verb')).toBeVisible();
    },
  },
];

// Everything the mover can visibly change while it animates.
const looks = (el: Element) => {
  const style = getComputedStyle(el);
  // 'none' and the identity matrix are the same rest frame.
  const transform = style.transform === 'none' ? 'matrix(1, 0, 0, 1, 0, 0)' : style.transform;
  return `${transform}|${style.opacity}`;
};

// No picture entry is the sole entry of its base verb, so the introduction of
// one is blocked by siblings at repetitions 1 (isBaseRecentlyUsed). Settle every
// sibling past the recall unlock (repetitions 2, recall item already stored,
// far-future due) so the sitting is exactly the picture entry's introduction.
async function seedPictureIntroduction(page: Page) {
  const { items } = await buildParticleReadySeed();
  const tyckaId = PARTICLE_SEED_CLOZE_ITEM_ID;
  items[tyckaId] = { ...items[tyckaId]!, dueAt: items[FLAGGED_ITEM_ID]!.dueAt };
  delete items[particleItemId(PICTURE_ENTRY.id, 'cloze')];
  for (const other of getVerifiedParticleVerbs()) {
    if (other.id === PICTURE_ENTRY.id || other.baseInfinitive !== PICTURE_ENTRY.baseInfinitive) {
      continue;
    }
    const clozeId = particleItemId(other.id, 'cloze');
    items[clozeId] = { ...items[clozeId]!, repetitions: 2 };
    if (hasRecallItem(other)) {
      const recallId = particleItemId(other.id, 'recall');
      items[recallId] = {
        ...initializeSrsState(recallId),
        repetitions: 1,
        dueAt: items[clozeId]!.dueAt,
      };
    }
  }
  await page
    .context()
    .addInitScript(
      ([key, value]) => window.localStorage.setItem(key, value),
      [SRS_STORAGE_KEY, toV3Envelope(items)],
    );
}

// The picture entry's due card is either a typed cloze or, for some entries, a
// multiple-choice discrimination card. Either way, answer wrong on purpose.
async function openPictureFeedback(page: Page) {
  await seedSingleDueCard(page, particleItemId(PICTURE_ENTRY.id, 'cloze'));
  await page.goto('/practice-particles');
  const typed = page.getByText('Fill in the missing particle');
  const choice = page.getByText('Choose the correct particle verb');
  await expect(typed.or(choice)).toBeVisible();
  if ((await choice.count()) > 0) {
    const lemma = `${PICTURE_ENTRY.baseInfinitive} ${PICTURE_ENTRY.particle}`;
    const options = page
      .getByRole('group', { name: 'Choose the particle verb' })
      .getByRole('button');
    const names = await options.allInnerTexts();
    const wrong = names.find((name) => name.trim() !== lemma);
    await options.filter({ hasText: wrong! }).first().click();
    await expect(page.getByText('Not quite')).toBeVisible();
  } else {
    await answer(page, 'zzz', 'Not quite');
  }
}

for (const surface of surfaces) {
  test.describe(`two plays then rest: ${surface.title}`, () => {
    test('one animation of 2 iterations, 2700 ms each (computed count "2")', async ({ page }) => {
      await surface.open(page);
      const mover = page.locator(surface.mover);
      await expect(mover).toHaveCount(1);
      const state = await mover.evaluate((el) => {
        const animations = el.getAnimations();
        const timing = animations[0]?.effect?.getTiming();
        const style = getComputedStyle(el);
        return {
          cssCount: style.animationIterationCount,
          cssFill: style.animationFillMode,
          count: animations.length,
          iterations: timing?.iterations,
          duration: timing?.duration,
          delay: timing?.delay,
        };
      });
      expect(state.cssCount).toBe('2');
      expect(state.cssFill).toBe('none');
      expect(state.count).toBe(1);
      expect(state.iterations).toBe(2);
      expect(state.duration).toBe(2700);
      expect(state.delay).toBe(0);
    });

    test('moves in play 1 and in play 2, and is at the rest frame from 3400 ms on', async ({
      page,
    }) => {
      await surface.open(page);
      const result = await page.locator(surface.mover).evaluate((el, fnSrc) => {
        const looksOf = new Function(`return (${fnSrc})`)() as (e: Element) => string;
        const [animation] = el.getAnimations();
        animation!.pause();
        const at = (ms: number) => {
          animation!.currentTime = ms;
          return { look: looksOf(el), rect: el.getBoundingClientRect().toJSON() };
        };
        const play1 = at(100);
        const rest1 = at(1500);
        const play2 = at(2800);
        const end = at(3400);
        const later = at(4500);
        const lastRest = at(5300);
        animation!.finish();
        return { play1, rest1, play2, end, later, lastRest, final: looksOf(el) };
      }, looks.toString());
      // Both plays leave the rest frame, the rest between them does not.
      expect(result.play1.look).not.toBe(result.rest1.look);
      expect(result.play2.look).not.toBe(result.rest1.look);
      // From 3400 ms on, the mover is at the rest frame and stays there.
      expect(result.later.look).toBe(result.rest1.look);
      expect(result.lastRest.look).toBe(result.rest1.look);
      expect(result.final).toBe(result.rest1.look);
      for (const frame of [result.end, result.later, result.lastRest]) {
        expect(frame.rect.x).toBeCloseTo(result.rest1.rect.x, 1);
        expect(frame.rect.y).toBeCloseTo(result.rest1.rect.y, 1);
        expect(frame.rect.width).toBeCloseTo(result.rest1.rect.width, 1);
        expect(frame.rect.height).toBeCloseTo(result.rest1.rect.height, 1);
      }
    });

    test('stops by itself: no animation is left after the sequence, rest frame holds', async ({
      page,
    }) => {
      await surface.open(page);
      const mover = page.locator(surface.mover);
      const restLook = await mover.evaluate((el, fnSrc) => {
        const looksOf = new Function(`return (${fnSrc})`)() as (e: Element) => string;
        const [animation] = el.getAnimations();
        animation!.pause();
        animation!.currentTime = 1500;
        const look = looksOf(el);
        // Resume in the second cycle, close to the end, so real time is short.
        animation!.currentTime = 5000;
        animation!.play();
        return look;
      }, looks.toString());
      await expect
        .poll(() => mover.evaluate((el) => el.getAnimations().length), { timeout: 5000 })
        .toBe(0);
      expect(
        await mover.evaluate(
          (el, fnSrc) => (new Function(`return (${fnSrc})`)() as (e: Element) => string)(el),
          looks.toString(),
        ),
      ).toBe(restLook);
    });

    test('a tap after the sequence gives a fresh mover with 2 plays from the start', async ({
      page,
    }) => {
      await surface.open(page);
      const mover = page.locator(surface.mover);
      await mover.evaluate((el) => {
        el.setAttribute('data-played', '1');
        el.getAnimations()[0]!.finish();
      });
      await expect.poll(() => mover.evaluate((el) => el.getAnimations().length)).toBe(0);

      await page.getByRole('button', { name: surface.button }).click();
      const fresh = page.locator(surface.mover);
      await expect(fresh).toHaveCount(1);
      expect(await fresh.getAttribute('data-played')).toBeNull();
      const state = await fresh.evaluate((el) => {
        const animations = el.getAnimations();
        return {
          count: animations.length,
          iterations: animations[0]?.effect?.getTiming().iterations,
          time: Number(animations[0]?.currentTime),
        };
      });
      expect(state.count).toBe(1);
      expect(state.iterations).toBe(2);
      expect(state.time).toBeLessThan(1500);
    });

    test('a tap during the rest between the plays restarts the sequence the same way', async ({
      page,
    }) => {
      await surface.open(page);
      const mover = page.locator(surface.mover);
      await mover.evaluate((el) => {
        el.setAttribute('data-played', '1');
        // Mid-rest of play 1, still running.
        el.getAnimations()[0]!.currentTime = 1500;
      });
      await page.getByRole('button', { name: surface.button }).click();
      const fresh = page.locator(surface.mover);
      await expect(fresh).toHaveCount(1);
      expect(await fresh.getAttribute('data-played')).toBeNull();
      const state = await fresh.evaluate((el) => {
        const animations = el.getAnimations();
        return {
          count: animations.length,
          iterations: animations[0]?.effect?.getTiming().iterations,
          time: Number(animations[0]?.currentTime),
        };
      });
      expect(state.count).toBe(1);
      expect(state.iterations).toBe(2);
      expect(state.time).toBeLessThan(1500);
    });

    test('the way out is enabled on the first frame, during and after the sequence', async ({
      page,
    }) => {
      await surface.open(page);
      const next = page.getByRole('button', { name: surface.next });
      await expect(next).toBeEnabled();
      await page.locator(surface.mover).evaluate((el) => {
        el.getAnimations()[0]!.currentTime = 1500;
      });
      await expect(next).toBeEnabled();
      await page.locator(surface.mover).evaluate((el) => el.getAnimations()[0]!.finish());
      await expect(next).toBeEnabled();
    });

    test('no control on the card is named Pause or Stop; the glyph is the one replay button', async ({
      page,
    }) => {
      await surface.open(page);
      await expect(page.getByRole('button', { name: /pause|stop/i })).toHaveCount(0);
      await expect(page.getByRole('button', { name: surface.button })).toHaveCount(1);
      await expect(page.getByRole('button', { name: /^Replay (movement|picture)/ })).toHaveCount(1);
    });
  });
}

test.describe('meaning picture under reduced motion', () => {
  test('feedback panel: no button, count "1", no animation left, nothing moves', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openPictureFeedback(page);
    const mover = page.locator(PICTURE_MOVER);
    await expect(mover).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Replay picture' })).toHaveCount(0);
    await expect(page.locator(`[aria-hidden="true"] ${PICTURE_MOVER}`)).toHaveCount(1);
    expect(await mover.evaluate((el) => getComputedStyle(el).animationIterationCount)).toBe('1');
    await expect
      .poll(
        () =>
          mover.evaluate(
            (el) => el.getAnimations().filter((a) => a.playState === 'running').length,
          ),
        { timeout: 500 },
      )
      .toBe(0);
  });
});
