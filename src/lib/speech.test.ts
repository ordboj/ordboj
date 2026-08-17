import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ConjugatedVerb } from './verbs';
import { SKRIVA, MISSLYCKAS, TE_SIG, KUNNA } from '@/test/conjugationFixtures';

// speech.ts keeps its "has stopSpeaking() invalidated me?" state in a
// module-level `cancelToken` variable. vi.resetModules() plus a fresh
// dynamic import per test is the only way to get an unpolluted module
// instance for each case (a single top-level `import` would share that
// counter, and one test's stopSpeaking() would leak into the next test).

type FakeVoice = { lang: string; name: string };

interface FakeUtteranceInstance {
  text: string;
  lang: string;
  rate: number;
  voice: FakeVoice | null;
  onend?: (() => void) | null;
  onerror?: (() => void) | null;
}

interface FakeSpeechSynthesis {
  getVoices: ReturnType<typeof vi.fn>;
  speak: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  onvoiceschanged: (() => void) | null;
}

function makeVoice(lang: string, name: string): FakeVoice {
  return { lang, name };
}

let fakeSynth: FakeSpeechSynthesis;
let voiceschangedListeners: Array<() => void>;

// `syncFire`, when given, makes the fake's addEventListener('voiceschanged',
// cb) invoke `cb` synchronously (with getVoices() already updated to
// `syncFire`) before addEventListener returns, instead of waiting for a
// separately-triggered dispatch. This reproduces the case speech.ts's own
// comment calls out — "a synchronous voiceschanged dispatch during
// addEventListener" — which is exactly the timing the pre-fix TDZ read of
// `timer` (and the resulting unhandled promise rejection, since pre-fix
// nothing caught it) depended on. A dispatch delivered after registration
// returns would never have hit that bug, so it would be true regardless of
// the fix and prove nothing about it.
function installFakeSpeechSynthesis(voices: FakeVoice[], syncFire?: FakeVoice[]): void {
  voiceschangedListeners = [];
  fakeSynth = {
    getVoices: vi.fn(() => voices),
    speak: vi.fn(),
    cancel: vi.fn(),
    onvoiceschanged: null,
    addEventListener: vi.fn((type: string, cb: () => void) => {
      if (type !== 'voiceschanged') return;
      voiceschangedListeners.push(cb);
      if (syncFire) {
        fakeSynth.getVoices.mockReturnValue(syncFire);
        cb();
      }
    }),
    removeEventListener: vi.fn((type: string, cb: () => void) => {
      if (type !== 'voiceschanged') return;
      voiceschangedListeners = voiceschangedListeners.filter((listener) => listener !== cb);
    }),
  };

  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    writable: true,
    value: fakeSynth,
  });
}

// Fires a voiceschanged event asynchronously, i.e. after addEventListener()
// has already returned and speakSwedish() is sitting in its pending state —
// the ordinary, non-edge-case delivery path.
function dispatchVoiceschangedAsync(voices: FakeVoice[]): void {
  fakeSynth.getVoices.mockReturnValue(voices);
  for (const listener of [...voiceschangedListeners]) {
    listener();
  }
}

function installFakeUtterance(): ReturnType<typeof vi.fn> {
  const ctor = vi.fn(function (this: FakeUtteranceInstance, text: string) {
    this.text = text;
    this.lang = '';
    this.rate = 1;
    this.voice = null;
  });
  (globalThis as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = ctor;
  return ctor;
}

// The promise chain inside speakSwedish() (waitForVoices().then(trySpeak))
// settles across one or more microtask turns, never synchronously. A few
// resolved-promise round trips reliably drain it without depending on real
// timers, which would collide with the fake-timers case (AC4c).
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

async function importSpeech() {
  return import('./speech');
}

// fakeSynth.speak.mock.calls[0][0] typechecks as possibly-undefined under
// noUncheckedIndexedAccess; this narrows it with a clear failure message
// instead of scattering non-null assertions across the assertions below.
function firstUtteranceArg(mockFn: ReturnType<typeof vi.fn>): FakeUtteranceInstance {
  const call = mockFn.mock.calls[0];
  if (!call) {
    throw new Error('expected speechSynthesis.speak() to have been called at least once');
  }
  return call[0] as FakeUtteranceInstance;
}

beforeEach(() => {
  vi.resetModules();
  installFakeUtterance();
});

afterEach(() => {
  vi.useRealTimers();
  delete (window as { speechSynthesis?: unknown }).speechSynthesis;
});

describe('stopSpeaking', () => {
  it('AC1: calls speechSynthesis.cancel() exactly once', async () => {
    installFakeSpeechSynthesis([]);
    const { stopSpeaking } = await importSpeech();

    stopSpeaking();

    expect(fakeSynth.cancel).toHaveBeenCalledTimes(1);
  });

  it('AC1: does not throw when window.speechSynthesis is absent', async () => {
    delete (window as { speechSynthesis?: unknown }).speechSynthesis;
    const { stopSpeaking } = await importSpeech();

    expect(() => stopSpeaking()).not.toThrow();
  });
});

describe('speakSwedish', () => {
  it('AC2: speaks with the Swedish voice, sv-SE lang and rate 0.85', async () => {
    const alva = makeVoice('sv-SE', 'Alva');
    installFakeSpeechSynthesis([alva]);
    const { speakSwedish } = await importSpeech();

    speakSwedish('hej');
    await flushMicrotasks();

    expect(fakeSynth.speak).toHaveBeenCalledTimes(1);
    const utterance = firstUtteranceArg(fakeSynth.speak);
    expect(utterance.text).toBe('hej');
    expect(utterance.lang).toBe('sv-SE');
    expect(utterance.rate).toBe(0.85);
    expect(utterance.voice).toBe(alva);
  });

  it('AC3: stays silent when only non-Swedish voices are available', async () => {
    installFakeSpeechSynthesis([makeVoice('en-US', 'Samantha'), makeVoice('de-DE', 'Anna')]);
    const { speakSwedish } = await importSpeech();

    speakSwedish('hej');
    await flushMicrotasks();

    expect(fakeSynth.speak).not.toHaveBeenCalled();
  });

  it('AC4a: speaks once a voiceschanged dispatch delivers a Swedish voice', async () => {
    const alva = makeVoice('sv-SE', 'Alva');
    // Synchronous delivery: the exact timing the pre-fix TDZ read of
    // `timer` depended on (see installFakeSpeechSynthesis doc comment).
    installFakeSpeechSynthesis([], [alva]);
    const { speakSwedish } = await importSpeech();

    speakSwedish('hej');
    await flushMicrotasks();

    expect(fakeSynth.speak).toHaveBeenCalledTimes(1);
    const utterance = firstUtteranceArg(fakeSynth.speak);
    expect(utterance.text).toBe('hej');
    expect(utterance.voice).toBe(alva);
  });

  it('AC4b: stays silent when a voiceschanged dispatch delivers only non-Swedish voices', async () => {
    installFakeSpeechSynthesis([]);
    const { speakSwedish } = await importSpeech();

    speakSwedish('hej');
    dispatchVoiceschangedAsync([makeVoice('en-US', 'Samantha')]);
    await flushMicrotasks();

    expect(fakeSynth.speak).not.toHaveBeenCalled();
  });

  it('AC4c: times out silently when no voices ever arrive', async () => {
    vi.useFakeTimers();
    installFakeSpeechSynthesis([]);
    const { speakSwedish } = await importSpeech();

    speakSwedish('hej');
    await vi.advanceTimersByTimeAsync(5000);

    expect(fakeSynth.speak).not.toHaveBeenCalled();
  });

  it('AC5: stopSpeaking() invalidates a pending call; a later call still speaks', async () => {
    installFakeSpeechSynthesis([]);
    const { speakSwedish, stopSpeaking } = await importSpeech();

    speakSwedish('old');
    stopSpeaking();
    dispatchVoiceschangedAsync([makeVoice('sv-SE', 'Alva')]);
    await flushMicrotasks();

    expect(fakeSynth.speak).not.toHaveBeenCalled();

    speakSwedish('newest');
    await flushMicrotasks();

    expect(fakeSynth.speak).toHaveBeenCalledTimes(1);
    const utterance = firstUtteranceArg(fakeSynth.speak);
    expect(utterance.text).toBe('newest');
  });

  it('AC6: a muted call never speaks', async () => {
    installFakeSpeechSynthesis([makeVoice('sv-SE', 'Alva')]);
    const { speakSwedish } = await importSpeech();

    speakSwedish('hej', true);
    await flushMicrotasks();

    expect(fakeSynth.speak).not.toHaveBeenCalled();
  });
});

// #453: speakSwedish's optional third argument, { onEnd }, must fire exactly
// once per call once playback has "settled" one way or another, on every
// settle path — and never a second time for the same call, however that
// path is reached (a real end/error event, a duplicate/erroneous dispatch of
// either, stopSpeaking() cancelling a call, or any silent-skip branch).
describe('speakSwedish onEnd settle callback (#453)', () => {
  it('fires exactly once when the utterance ends', async () => {
    installFakeSpeechSynthesis([makeVoice('sv-SE', 'Alva')]);
    const { speakSwedish } = await importSpeech();
    const onEnd = vi.fn();

    speakSwedish('hej', false, { onEnd });
    await flushMicrotasks();
    const utterance = firstUtteranceArg(fakeSynth.speak);
    utterance.onend?.();

    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('fires exactly once when the utterance errors', async () => {
    installFakeSpeechSynthesis([makeVoice('sv-SE', 'Alva')]);
    const { speakSwedish } = await importSpeech();
    const onEnd = vi.fn();

    speakSwedish('hej', false, { onEnd });
    await flushMicrotasks();
    const utterance = firstUtteranceArg(fakeSynth.speak);
    utterance.onerror?.();

    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('never fires a second time if both end and error are dispatched for the same call', async () => {
    installFakeSpeechSynthesis([makeVoice('sv-SE', 'Alva')]);
    const { speakSwedish } = await importSpeech();
    const onEnd = vi.fn();

    speakSwedish('hej', false, { onEnd });
    await flushMicrotasks();
    const utterance = firstUtteranceArg(fakeSynth.speak);
    utterance.onend?.();
    utterance.onerror?.();
    utterance.onend?.();

    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('fires exactly once, synchronously, for a muted call', async () => {
    installFakeSpeechSynthesis([makeVoice('sv-SE', 'Alva')]);
    const { speakSwedish } = await importSpeech();
    const onEnd = vi.fn();

    speakSwedish('hej', true, { onEnd });

    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(fakeSynth.speak).not.toHaveBeenCalled();
  });

  it('fires exactly once when only non-Swedish voices are available', async () => {
    installFakeSpeechSynthesis([makeVoice('en-US', 'Samantha'), makeVoice('de-DE', 'Anna')]);
    const { speakSwedish } = await importSpeech();
    const onEnd = vi.fn();

    speakSwedish('hej', false, { onEnd });
    await flushMicrotasks();

    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(fakeSynth.speak).not.toHaveBeenCalled();
  });

  it('fires exactly once when the voice wait times out with no voices ever arriving', async () => {
    vi.useFakeTimers();
    installFakeSpeechSynthesis([]);
    const { speakSwedish } = await importSpeech();
    const onEnd = vi.fn();

    speakSwedish('hej', false, { onEnd });
    await vi.advanceTimersByTimeAsync(5000);

    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('fires exactly once when stopSpeaking() cancels a call still waiting for voices, and does not fire again once those voices arrive late', async () => {
    installFakeSpeechSynthesis([]);
    const { speakSwedish, stopSpeaking } = await importSpeech();
    const onEnd = vi.fn();

    speakSwedish('hej', false, { onEnd });
    stopSpeaking();

    // stopSpeaking() settles every pending call synchronously, before the
    // browser ever delivers a voice list.
    expect(onEnd).toHaveBeenCalledTimes(1);

    dispatchVoiceschangedAsync([makeVoice('sv-SE', 'Alva')]);
    await flushMicrotasks();

    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(fakeSynth.speak).not.toHaveBeenCalled();
  });

  it('does not re-fire onEnd for a call that already ended, when stopSpeaking() is called afterward', async () => {
    installFakeSpeechSynthesis([makeVoice('sv-SE', 'Alva')]);
    const { speakSwedish, stopSpeaking } = await importSpeech();
    const onEnd = vi.fn();

    speakSwedish('hej', false, { onEnd });
    await flushMicrotasks();
    const utterance = firstUtteranceArg(fakeSynth.speak);
    utterance.onend?.();
    expect(onEnd).toHaveBeenCalledTimes(1);

    stopSpeaking();

    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('gives a later, independent call its own onEnd after an earlier one was cancelled (regression: stopSpeaking must not settle the wrong call)', async () => {
    installFakeSpeechSynthesis([]);
    const { speakSwedish, stopSpeaking } = await importSpeech();
    const onEndFirst = vi.fn();

    speakSwedish('first', false, { onEnd: onEndFirst });
    stopSpeaking();
    expect(onEndFirst).toHaveBeenCalledTimes(1);

    const onEndSecond = vi.fn();
    speakSwedish('second', false, { onEnd: onEndSecond });
    dispatchVoiceschangedAsync([makeVoice('sv-SE', 'Alva')]);
    await flushMicrotasks();

    // The second call actually speaks (its own onEnd is not settled yet —
    // settling only happens once its own utterance ends, not merely once
    // speak() is invoked); the first call's stale, already-cancelled wait
    // for voices must not produce a second speak() call.
    expect(onEndSecond).not.toHaveBeenCalled();
    expect(fakeSynth.speak).toHaveBeenCalledTimes(1);
    const utterance = firstUtteranceArg(fakeSynth.speak);
    expect(utterance.text).toBe('second');

    utterance.onend?.();
    expect(onEndSecond).toHaveBeenCalledTimes(1);
    expect(onEndFirst).toHaveBeenCalledTimes(1);
  });

  it('never requires onEnd — existing two-argument call sites keep working unchanged', async () => {
    installFakeSpeechSynthesis([makeVoice('sv-SE', 'Alva')]);
    const { speakSwedish } = await importSpeech();

    expect(() => speakSwedish('hej')).not.toThrow();
    await flushMicrotasks();

    expect(fakeSynth.speak).toHaveBeenCalledTimes(1);
  });
});

// #453: buildConjugationUtterance(verb) joins every speakable form of a
// ConjugatedVerb, in canonical order (infinitive, presens, preteritum,
// supinum, imperativ), with ', ' — the same separator and unavailable-form
// rule (isFormUnavailable) as PracticeCard's own pattern utterance (see
// src/lib/speechConjugationParity.test.tsx for the cross-check that the two
// copies of that rule agree). Fixture verbs are real src/data/verbData.ts
// rows, shared with the parity suite via src/test/conjugationFixtures.ts.
describe('buildConjugationUtterance (#453)', () => {
  it('joins infinitive, presens, preteritum, supinum, imperativ in that order with ", " — skriva', async () => {
    const { buildConjugationUtterance } = await importSpeech();

    expect(buildConjugationUtterance(SKRIVA)).toBe('skriva, skriver, skrev, skrivit, skriv');
  });

  it('retains the deponent "-s" ending in every included form — misslyckas', async () => {
    const { buildConjugationUtterance } = await importSpeech();

    const result = buildConjugationUtterance(MISSLYCKAS);
    expect(result).toBe('misslyckas, misslyckas, misslyckades, misslyckats, misslyckas');
    for (const part of result.split(', ')) {
      expect(part.endsWith('s')).toBe(true);
    }
  });

  it('keeps a multi-word phrase intact and drops only the unavailable (sentinel) imperativ — te sig', async () => {
    const { buildConjugationUtterance } = await importSpeech();

    expect(buildConjugationUtterance(TE_SIG)).toBe('te sig, ter sig, tedde sig, tett sig');
  });

  it('excludes a form whose raw value is an empty string', async () => {
    const { buildConjugationUtterance } = await importSpeech();

    const withEmptyPresens: ConjugatedVerb = { ...SKRIVA, presens: '' };
    expect(buildConjugationUtterance(withEmptyPresens)).toBe('skriva, skrev, skrivit, skriv');
  });

  it('excludes a form whose value is exactly the "(not available)" sentinel', async () => {
    const { buildConjugationUtterance } = await importSpeech();

    const withSentinelPresens: ConjugatedVerb = { ...SKRIVA, presens: '(not available)' };
    expect(buildConjugationUtterance(withSentinelPresens)).toBe('skriva, skrev, skrivit, skriv');
  });

  it('excludes imperativ on an imperativNotApplicable verb — kunna', async () => {
    const { buildConjugationUtterance } = await importSpeech();

    expect(buildConjugationUtterance(KUNNA)).toBe('kunna, kan, kunde, kunnat');
  });

  it('excludes imperativ purely from imperativNotApplicable, even when its raw value is a real, non-sentinel string', async () => {
    const { buildConjugationUtterance } = await importSpeech();

    const kunnaWithStrayImperativ: ConjugatedVerb = {
      ...KUNNA,
      imperativ: '__SHOULD_NEVER_BE_SPOKEN__',
    };
    const result = buildConjugationUtterance(kunnaWithStrayImperativ);

    expect(result).toBe('kunna, kan, kunde, kunnat');
    expect(result).not.toContain('__SHOULD_NEVER_BE_SPOKEN__');
  });

  it('returns an empty string when nothing on the verb is speakable', async () => {
    const { buildConjugationUtterance } = await importSpeech();

    const nothingSpeakable: ConjugatedVerb = {
      id: 'x',
      infinitive: '(not available)',
      presens: '(not available)',
      preteritum: '(not available)',
      supinum: '(not available)',
      imperativ: '(not available)',
    };
    expect(buildConjugationUtterance(nothingSpeakable)).toBe('');
  });
});
