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
  getVerifiedParticleVerbs,
  type ParticleVerbData,
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

// Shared post-grade assertions: Next Card fully inside 360x640 at scrollY 0,
// and nothing the ticket protects removed to make room.
async function expectNextCardAboveFold(page: Page, entry: ParticleVerbData) {
  const next = page.getByRole('button', { name: 'Next Card' });
  await expect(next).toBeVisible();
  // Measured as the user first sees it: no scrolling has happened.
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  const box = (await next.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(VIEWPORT_HEIGHT);

  // The panel's lemma is exposed as the card's level-2 heading once graded
  // (the prompt h2 is unmounted, so exactly one lemma heading remains).
  await expect(
    page.getByRole('heading', { level: 2 }).filter({ hasText: entry.lemma }),
  ).toBeVisible();
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
  if (getParticleGlyph(entry) !== null) {
    await expect(replay).toBeVisible();
    const g = (await replay.boundingBox())!;
    expect(g.width).toBeGreaterThanOrEqual(44);
    expect(g.height).toBeGreaterThanOrEqual(44);
  } else {
    await expect(replay).toHaveCount(0);
  }
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

      await expectNextCardAboveFold(page, entry);
    });
  }
});

// Worst-case panels at 360x640 (measured heights before the fix: 867 / 859 /
// 701 / 657 / 669 px). Every verified particle counts as introduced (cloze at
// repetitions 1, due far in the future) so the choice/contrast/picture
// variants are reachable; only the target item is due.
async function seedTarget(
  page: Page,
  entryId: string,
  kind: 'cloze' | 'recall',
  repetitions: number,
) {
  const { items } = await buildParticleReadySeed();
  const far = Date.now() + 1000 * 60 * 60 * 24 * 365 * 10;
  // Park the pinned due card and introduce the entry the base seed skips.
  for (const e of getVerifiedParticleVerbs()) {
    const id = particleItemId(e.id, 'cloze');
    items[id] = { ...initializeSrsState(id), repetitions: 1, dueAt: far };
  }
  const itemId = particleItemId(entryId, kind);
  items[itemId] = { ...initializeSrsState(itemId), repetitions, dueAt: Date.now() - 1000 };
  await page
    .context()
    .addInitScript(
      ([key, value]) => window.localStorage.setItem(key, value),
      [SRS_STORAGE_KEY, toV3Envelope(items)],
    );
}

async function gradeTyped(page: Page, answer: string, prompt: string) {
  await expect(page.getByText(prompt)).toBeVisible();
  expect(page.viewportSize()).toEqual({ width: 360, height: VIEWPORT_HEIGHT });
  await page.getByRole('textbox').fill(answer);
  await page.getByRole('button', { name: 'Check Answer' }).click();
  await expect(page.getByText('Not quite')).toBeVisible();
}

test.describe('ORD-128: worst-case feedback panels at 360x640', () => {
  const choiceCases = [
    { id: 'pv:ge-upp', click: 'ge ut', wrong: true },
    { id: 'pv:ge-upp', click: 'ge bort', wrong: true },
    { id: 'pv:lagga-ner', click: null, wrong: true },
    { id: 'pv:komma-ihag', click: null, wrong: true },
    { id: 'pv:bli-av', click: null, wrong: true },
    { id: 'pv:ge-upp', click: 'ge upp', wrong: false },
  ];
  for (const c of choiceCases) {
    const label = c.click ?? 'first rendered lure';
    test(`choice ${c.wrong ? 'wrong' : 'correct'} (${label}) ${c.id}: Next Card above the fold`, async ({
      page,
    }) => {
      page.setDefaultTimeout(15_000);
      const entry = findParticleVerb(c.id)!;
      await seedTarget(page, c.id, 'cloze', 3);
      await page.goto('/practice-particles');
      const group = page.getByRole('group', { name: 'Choose the particle verb' });
      await expect(group).toBeVisible();
      expect(page.viewportSize()).toEqual({ width: 360, height: VIEWPORT_HEIGHT });
      if (c.click) {
        await group.getByRole('button', { name: c.click, exact: true }).click();
      } else {
        const correct = `${entry.baseInfinitive} ${entry.particle}`;
        const buttons = group.getByRole('button');
        const n = await buttons.count();
        let clicked = false;
        for (let i = 0; i < n; i++) {
          const text = (await buttons.nth(i).innerText()).trim();
          if (text !== correct) {
            await buttons.nth(i).click();
            clicked = true;
            break;
          }
        }
        expect(clicked).toBe(true);
      }
      await expect(page.getByText(c.wrong ? 'Not quite' : 'Correct!')).toBeVisible();
      await expectNextCardAboveFold(page, entry);
    });
  }

  const typedCases = [
    { name: 'contrast line', id: 'pv:komma-pa' },
    { name: 'contrast line', id: 'pv:halsa-pa' },
    { name: 'meaning picture', id: 'pv:ge-upp' },
    { name: 'long example', id: 'pv:ga-ner' },
    { name: 'long example', id: 'pv:tala-om' },
  ];
  for (const c of typedCases) {
    test(`typed wrong, ${c.name} ${c.id}: Next Card above the fold`, async ({ page }) => {
      const entry = findParticleVerb(c.id)!;
      await seedTarget(page, c.id, 'cloze', 0);
      await page.goto('/practice-particles');
      await gradeTyped(page, 'ut', 'Fill in the missing particle');
      await expectNextCardAboveFold(page, entry);
    });
  }

  for (const id of ['pv:komma-pa', 'pv:ge-upp']) {
    test(`recall wrong ${id}: Next Card above the fold`, async ({ page }) => {
      const entry = findParticleVerb(id)!;
      await seedTarget(page, id, 'recall', 3);
      await page.goto('/practice-particles');
      await gradeTyped(page, 'xyz', 'Write the Swedish particle verb');
      await expectNextCardAboveFold(page, entry);
    });
  }
});
