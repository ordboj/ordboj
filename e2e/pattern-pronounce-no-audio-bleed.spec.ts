import { test, expect } from './support/errorCollector';
import { buildFullSeed, toV3Envelope, SRS_STORAGE_KEY, SETTINGS_STORAGE_KEY } from './support/seed';

// Issue #422: the "Pronounce pattern" button (issue #420) speaks the whole
// feedback-screen pattern as one utterance, and PracticeCard cancels any
// in-progress speech on card advance. PracticeCard.test.tsx already pins
// that behavior at the component level via a fake window.speechSynthesis
// (src/test/speechMock.ts, jsdom). This spec proves the same "no audio
// bleed" contract holds end-to-end in a real browser: it stubs
// window.speechSynthesis via addInitScript (headless Chromium's real Web
// Speech implementation has no voices and is otherwise unreliable/OS-backed
// -- not something a deterministic suite can depend on) with an utterance
// that never resolves on its own, then advances past the card while that
// utterance is still "speaking" -- exactly the scenario where a slow/real
// voice would otherwise keep talking over the next card's prompt.
const ANSWERS: Record<string, string> = { vara: 'är', ha: 'har' };

interface PwSpeechState {
  speaking: boolean;
  queue: string[];
}

test.describe('no audio bleed on card advance (issue #422)', () => {
  test('advancing past a card mid-utterance (Pronounce pattern -> Next Card) leaves nothing speaking or queued once the next card mounts', async ({
    page,
    context,
  }) => {
    const seed = await buildFullSeed({
      'vara-presens': { dueAt: Date.now() },
      'ha-presens': { dueAt: Date.now() },
    });
    await context.addInitScript(
      ([key, value]) => window.localStorage.setItem(key, value),
      [SRS_STORAGE_KEY, toV3Envelope(seed)],
    );
    // autoplayAudio off: the only speak() call in this test is the explicit
    // "Pronounce pattern" click below. Submit-time autoplay speech is
    // already covered separately (PracticeCard.test.tsx, issue #420
    // regression), so mixing it in here would leave it ambiguous which call
    // this test's cancel-on-advance assertion is actually about.
    await context.addInitScript(
      ([key, value]) => window.localStorage.setItem(key, value),
      [SETTINGS_STORAGE_KEY, JSON.stringify({ autoplayAudio: false, muteAudio: false })],
    );

    // A fake SpeechSynthesisUtterance never calls onend on its own, so an
    // utterance handed to speak() stays "speaking" until something actually
    // calls cancel() -- if PracticeCard's advance path stopped cancelling
    // speech, this fails loudly (still speaking) instead of passing by
    // accident because a real utterance happened to finish first.
    //
    // `window.speechSynthesis` is a native read-only accessor in a real
    // browser (unlike jsdom, which has no such property at all): a plain
    // `window.speechSynthesis = ...` assignment is a silent no-op there, so
    // this must go through `Object.defineProperty` the same way
    // src/test/speechMock.ts does for jsdom.
    await context.addInitScript(() => {
      class FakeSpeechSynthesisUtterance {
        text: string;
        lang = '';
        constructor(text = '') {
          this.text = text;
        }
      }
      const state = { speaking: false, queue: [] as string[] };
      (window as unknown as { __pwSpeech: typeof state }).__pwSpeech = state;

      Object.defineProperty(window, 'SpeechSynthesisUtterance', {
        configurable: true,
        writable: true,
        value: FakeSpeechSynthesisUtterance,
      });
      Object.defineProperty(window, 'speechSynthesis', {
        configurable: true,
        writable: true,
        value: {
          pending: false,
          paused: false,
          get speaking() {
            return state.speaking;
          },
          getVoices: () => [{ name: 'Alva', lang: 'sv-SE' }],
          speak: (utterance: FakeSpeechSynthesisUtterance) => {
            state.queue.push(utterance.text);
            state.speaking = true;
          },
          cancel: () => {
            state.queue = [];
            state.speaking = false;
          },
          pause: () => {},
          resume: () => {},
          addEventListener: (type: string, handler: () => void) => {
            if (type === 'voiceschanged') handler();
          },
          removeEventListener: () => {},
          onvoiceschanged: null,
        },
      });
    });

    await page.goto('/');
    await expect(page.getByText('2 conjugations due for review')).toBeVisible();
    await page.getByRole('button', { name: /Start Practice/ }).click();
    await expect(page).toHaveURL(/\/practice$/);

    const heading = page.getByRole('heading', { level: 2 });
    const infinitive1 = ((await heading.textContent()) ?? '').trim();
    const answer1 = ANSWERS[infinitive1];
    expect(answer1, `unexpected verb "${infinitive1}" in this seed`).toBeDefined();

    await page.getByPlaceholder('Type your answer...').pressSequentially(answer1);
    await page.getByRole('button', { name: 'Check Answer' }).click();
    await expect(page.getByText('Correct!')).toBeVisible();

    await page.getByRole('button', { name: /pronounce pattern/i }).click();
    await page.waitForFunction(
      () => (window as unknown as { __pwSpeech: PwSpeechState }).__pwSpeech.speaking,
    );

    // Advance while the fake utterance is still "speaking" -- the
    // mid-utterance moment this issue is about.
    await page.getByRole('button', { name: 'Next Card' }).click();

    // Second card mounted: the un-answered input is back and it is a
    // different verb than the one just answered.
    await expect(page.getByPlaceholder('Type your answer...')).toBeVisible();
    const infinitive2 = ((await heading.textContent()) ?? '').trim();
    expect(infinitive2).not.toBe(infinitive1);

    const speechState = await page.evaluate(
      () => (window as unknown as { __pwSpeech: PwSpeechState }).__pwSpeech,
    );
    expect(speechState.speaking).toBe(false);
    expect(speechState.queue).toEqual([]);
  });
});
