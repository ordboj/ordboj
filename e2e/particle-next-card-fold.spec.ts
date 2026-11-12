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
  selectExample,
  type ParticleVerbData,
} from '../src/lib/particleVerbs';
import { selectDiscriminationVariant } from '../src/lib/discriminationVariant';

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

// ORD-144: pv:plocka-undan after a wrong tap on a choice card put Next Card's
// bottom at 665 px (about 673 in CI). The fix keeps the three result chips on
// one row and moves the 44x44 pronounce button onto the lemma row. Limit is
// the viewport height; the sweep below covers every choice-eligible entry so
// the same overflow cannot hide in another entry.
const CHOICE_REPETITIONS = [3, 6, 9];

// seedTarget introduces every verified particle, so this is the introduced
// set the page itself sees.
function introducedParticles(): Set<string> {
  return new Set(getVerifiedParticleVerbs().map((e) => e.particle));
}

function choiceVariantFor(entry: ParticleVerbData, repetitions: number) {
  const example = selectExample(entry, repetitions);
  return selectDiscriminationVariant(
    {
      reflexive: entry.reflexive,
      acceptedParticles: entry.acceptedParticles,
      excludedParticles: example.excludedParticles,
    },
    repetitions,
    introducedParticles(),
  );
}

async function wrongChoiceTap(
  page: Page,
  entry: ParticleVerbData,
  lureLabel: string,
  reps: number,
) {
  page.setDefaultTimeout(15_000);
  await seedTarget(page, entry.id, 'cloze', reps);
  await page.goto('/practice-particles');
  const group = page.getByRole('group', { name: 'Choose the particle verb' });
  await expect(group).toBeVisible();
  expect(page.viewportSize()).toEqual({ width: 360, height: VIEWPORT_HEIGHT });
  await group.getByRole('button', { name: lureLabel, exact: true }).click();
  await expect(page.getByText('Not quite')).toBeVisible();
}

async function expectNextCardBottomWithinViewport(page: Page) {
  const next = page.getByRole('button', { name: 'Next Card' });
  await expect(next).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  const box = (await next.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(VIEWPORT_HEIGHT);
}

test.describe('ORD-144: pv:plocka-undan wrong choice at 360x640', () => {
  const entryId = 'pv:plocka-undan';
  for (const lure of ['plocka upp', 'plocka bort']) {
    for (const reps of CHOICE_REPETITIONS) {
      test(`wrong tap "${lure}" at repetitions ${reps}: Next Card bottom <= 640 and new layout`, async ({
        page,
      }) => {
        const entry = findParticleVerb(entryId)!;
        // Guard the fixture: this repetitions count really renders a choice card
        // offering this lure.
        const variant = choiceVariantFor(entry, reps);
        expect(variant).not.toBeNull();
        const labels = variant!.options.map((o) => `${entry.baseInfinitive} ${o.particle}`);
        expect(labels).toContain(lure);

        await wrongChoiceTap(page, entry, lure, reps);
        await expectNextCardAboveFold(page, entry);

        // Chips: all three on one row, nothing pushed past the viewport edge.
        const chips = page.locator('div[lang="sv"]').filter({
          hasText: new RegExp(`^(${labels.join('|')})$`),
        });
        await expect(chips).toHaveCount(3);
        const boxes = await Promise.all(
          [0, 1, 2].map(async (i) => (await chips.nth(i).boundingBox())!),
        );
        for (const b of boxes) {
          expect(Math.abs(b.y - boxes[0]!.y)).toBeLessThanOrEqual(1);
          expect(b.x).toBeGreaterThanOrEqual(0);
          expect(b.x + b.width).toBeLessThanOrEqual(360);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          360,
        );

        // Pronounce: >= 44x44 and on the lemma row (right of it), above the
        // example sentence, not beside it.
        const pronounce = page.getByRole('button', { name: 'Pronounce sentence' });
        await expect(pronounce).toBeVisible();
        const pb = (await pronounce.boundingBox())!;
        expect(pb.width).toBeGreaterThanOrEqual(44);
        expect(pb.height).toBeGreaterThanOrEqual(44);
        const lemma = page.getByRole('heading', { level: 2 }).filter({ hasText: entry.lemma });
        const lb = (await lemma.boundingBox())!;
        const pCenterY = pb.y + pb.height / 2;
        expect(pCenterY).toBeGreaterThanOrEqual(lb.y);
        expect(pCenterY).toBeLessThanOrEqual(lb.y + lb.height);
        expect(pb.x).toBeGreaterThanOrEqual(lb.x + lb.width);
        const exampleBox = (await page.locator('p[lang="sv"].text-base').first().boundingBox())!;
        expect(pb.y + pb.height).toBeLessThanOrEqual(exampleBox.y + 1);
      });
    }
  }
});

// Data-driven: every verified entry that can render a choice card, at every
// trigger repetitions count, for every lure the card offers.
const choiceSweep = getVerifiedParticleVerbs().flatMap((entry) =>
  CHOICE_REPETITIONS.flatMap((reps) => {
    const variant = choiceVariantFor(entry, reps);
    if (!variant) return [];
    return variant.options
      .filter((o) => !o.correct)
      .map((o) => ({ entry, reps, lure: `${entry.baseInfinitive} ${o.particle}` }));
  }),
);

test.describe('ORD-144: every choice-eligible entry, wrong tap, Next Card bottom <= 640', () => {
  test('the sweep is not vacuous', () => {
    expect(choiceSweep.length).toBeGreaterThan(0);
    expect(choiceSweep.some((c) => c.entry.id === 'pv:plocka-undan')).toBe(true);
  });
  for (const c of choiceSweep) {
    test(`${c.entry.id} wrong "${c.lure}" at repetitions ${c.reps}`, async ({ page }) => {
      await wrongChoiceTap(page, c.entry, c.lure, c.reps);
      await expectNextCardBottomWithinViewport(page);
    });
  }
});
