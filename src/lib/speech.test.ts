import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

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
