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
  findParticleVerb,
  getParticleCoreSense,
  getParticleGlyph,
  getPhraseForms,
} from '../src/lib/particleVerbs';

// ORD-128: on the 360x640 mobile-chrome viewport, "Next Card" on the particle
// feedback panel must be reachable WITHOUT scrolling, after a correct and a
// wrong answer, for an entry with and without a motion glyph, while the sense
// line, lemma, example and reference forms all stay in the panel and the
// glyph keeps its 44 px tap area.

const VIEWPORT_HEIGHT = 640;
const GLYPH_ID = 'pv:ga-in'; // flagged: glyph 'in'
const NO_GLYPH_ID = 'pv:tycka-om'; // unflagged, no glyph

async function seedSingleDueCard(page: Page, entryId: string) {
  const { items } = await buildParticleReadySeed();
  const itemId = particleItemId(entryId, 'cloze');
  if (itemId !== PARTICLE_SEED_CLOZE_ITEM_ID) {
    // Park the pinned due card in the future; make the requested one due.
    items[PARTICLE_SEED_CLOZE_ITEM_ID] = {
      ...items[PARTICLE_SEED_CLOZE_ITEM_ID]!,
      dueAt: Date.now() + 1000 * 60 * 60 * 24 * 30,
    };
    items[itemId] = { ...initializeSrsState(itemId), repetitions: 3, dueAt: Date.now() };
  }
  await page
    .context()
    .addInitScript(
      ([key, value]) => window.localStorage.setItem(key, value),
      [SRS_STORAGE_KEY, toV3Envelope(items)],
    );
}

const cases = [
  { name: 'correct + glyph', id: GLYPH_ID, answer: 'in', correct: true, glyph: true },
  { name: 'wrong + glyph', id: GLYPH_ID, answer: 'ut', correct: false, glyph: true },
  { name: 'correct + no glyph', id: NO_GLYPH_ID, answer: 'om', correct: true, glyph: false },
  { name: 'wrong + no glyph', id: NO_GLYPH_ID, answer: 'på', correct: false, glyph: false },
];

test.describe('ORD-128: Next Card above the fold at 360x640', () => {
  for (const c of cases) {
    test(`${c.name}: Next Card is fully inside the viewport without scrolling`, async ({
      page,
    }) => {
      const entry = findParticleVerb(c.id)!;
      // Guard the fixture itself: the case must really be (un)flagged.
      expect(getParticleGlyph(entry) !== null).toBe(c.glyph);

      await seedSingleDueCard(page, c.id);
      await page.goto('/practice-particles');
      await expect(page.getByText('Fill in the missing particle')).toBeVisible();
      expect(page.viewportSize()).toEqual({ width: 360, height: VIEWPORT_HEIGHT });

      await page.getByRole('textbox').fill(c.answer);
      const check = page.getByRole('button', { name: 'Check Answer' });
      if ((await check.count()) > 0) await check.click();
      await expect(page.getByText(c.correct ? 'Correct!' : 'Not quite')).toBeVisible();

      const next = page.getByRole('button', { name: 'Next Card' });
      await expect(next).toBeVisible();
      // Measured as the user first sees it: no scrolling has happened.
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
      const box = (await next.boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(VIEWPORT_HEIGHT);

      // Nothing the ticket protects was removed to make room.
      await expect(page.locator('p.text-2xl.text-primary')).toContainText(entry.lemma);
      await expect(page.getByText(entry.gloss.en).first()).toBeVisible();
      const sense = getParticleCoreSense(entry.particle);
      expect(sense).not.toBeNull();
      await expect(page.getByText(sense!).first()).toBeVisible();
      await expect(page.getByText('For reference — not tested')).toBeVisible();
      const forms = getPhraseForms(entry)!;
      const formsLine = page
        .locator('p.text-center.text-base:not([lang])')
        .filter({ hasText: forms.presens! });
      await expect(formsLine).toBeVisible();
      await expect(formsLine).toContainText(forms.preteritum!);
      await expect(formsLine).toContainText(forms.supinum!);
      const exampleCounts = await Promise.all(
        entry.examples.map((ex) => page.locator('p[lang="sv"]').filter({ hasText: ex.sv }).count()),
      );
      expect(exampleCounts.some((n) => n > 0)).toBe(true);

      const replay = page.getByRole('button', { name: /Replay movement/ });
      if (c.glyph) {
        await expect(replay).toBeVisible();
        const g = (await replay.boundingBox())!;
        expect(g.width).toBeGreaterThanOrEqual(44);
        expect(g.height).toBeGreaterThanOrEqual(44);
      } else {
        await expect(replay).toHaveCount(0);
      }
    });
  }
});
