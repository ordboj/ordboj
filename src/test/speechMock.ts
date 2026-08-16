// Test double for the Web Speech API's window.speechSynthesis, which jsdom
// does not implement. src/lib/speech.ts (frontend-expert-owned) calls
// `new SpeechSynthesisUtterance(...)`, `speechSynthesis.getVoices()`,
// `speechSynthesis.speak(...)` and `speechSynthesis.onvoiceschanged`; a test
// that exercises that boundary needs both globals stubbed together.
//
// Opt-in by design (issue #418 AC 5): nothing in this file runs unless a
// test file calls installSpeechSynthesisMock() itself, typically from its
// own beforeEach/afterEach. src/test/setup.ts does not install this
// automatically, so suites that currently rely on
// `'speechSynthesis' in window` being false (or on speakSwedish's own
// `muted` early return) keep observing exactly that — installing this stub
// in one file cannot change what a different, non-opting-in file sees.
//
// Usage:
//   let speech: SpeechSynthesisMockHandle;
//   beforeEach(() => { speech = installSpeechSynthesisMock(); });
//   afterEach(() => { speech.uninstall(); });
//   ...
//   expect(speech.speakCalls).toEqual([{ text: 'testar', lang: 'sv-SE', voice: 'Alva' }]);

/** Minimal shape of SpeechSynthesisVoice that src/lib/speech.ts reads. */
export interface FakeSpeechVoice {
  voiceURI: string;
  name: string;
  lang: string;
  localService: boolean;
  default: boolean;
}

/** One recorded speechSynthesis.speak() call, in call order. */
export interface SpeakCall {
  text: string;
  lang: string;
  /** The chosen voice's `name`, or null if no voice was assigned. */
  voice: string | null;
}

function makeVoice(name: string, lang: string): FakeSpeechVoice {
  return { voiceURI: name, name, lang, localService: true, default: false };
}

// Voice-state presets for issue #418 AC 2.
/** A single Swedish voice, as if the platform shipped one. */
export const SV_VOICE: FakeSpeechVoice = makeVoice('Alva', 'sv-SE');
/** Only non-Swedish voices installed — speakSwedish must fall back to no voice. */
export const NON_SV_VOICES: FakeSpeechVoice[] = [
  makeVoice('Samantha', 'en-US'),
  makeVoice('Amelie', 'fr-FR'),
];

/**
 * Stand-in for the real SpeechSynthesisUtterance constructor. Captures only
 * the fields src/lib/speech.ts reads or writes.
 */
class FakeSpeechSynthesisUtterance {
  text: string;
  lang = '';
  rate = 1;
  pitch = 1;
  volume = 1;
  voice: FakeSpeechVoice | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(text = '') {
    this.text = text;
  }
}

export interface SpeechSynthesisMockHandle {
  /** Every speak() call so far, in order. Mutated in place; read freely. */
  readonly speakCalls: SpeakCall[];
  /** One entry per cancel() call so far. Check `.length` for the count. */
  readonly cancelCalls: number[];
  /** Replace the voice list getVoices() returns, without firing voiceschanged. */
  setVoices(voices: FakeSpeechVoice[]): void;
  /**
   * Simulates the async "voices arrived later" case: sets the voice list
   * and then invokes the currently-registered onvoiceschanged handler (or
   * a listener added via addEventListener('voiceschanged', ...)), matching
   * how loadVoices() in src/lib/speech.ts awaits that callback.
   */
  fireVoicesChanged(voices: FakeSpeechVoice[]): void;
  /** Clears the recorded call log (speakCalls, cancelCalls) without uninstalling. */
  reset(): void;
  /** Restores window.speechSynthesis / window.SpeechSynthesisUtterance to their pre-install state. */
  uninstall(): void;
}

/**
 * Installs a fake window.speechSynthesis (and window.SpeechSynthesisUtterance)
 * for the duration of a test file / test. Call `.uninstall()` (e.g. from
 * afterEach) to restore whatever was there before.
 */
export function installSpeechSynthesisMock(
  initialVoices: FakeSpeechVoice[] = [],
): SpeechSynthesisMockHandle {
  const hadSpeechSynthesis = 'speechSynthesis' in window;
  const originalSpeechSynthesis = hadSpeechSynthesis
    ? (window as unknown as { speechSynthesis: unknown }).speechSynthesis
    : undefined;
  const hadUtterance = 'SpeechSynthesisUtterance' in window;
  const originalUtterance = hadUtterance
    ? (window as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance
    : undefined;

  let voices: FakeSpeechVoice[] = [...initialVoices];
  let onvoiceschanged: (() => void) | null = null;
  const speakCalls: SpeakCall[] = [];
  const cancelCalls: number[] = [];

  const fakeSpeechSynthesis = {
    speaking: false,
    pending: false,
    paused: false,
    getVoices: () => voices,
    speak: (utterance: FakeSpeechSynthesisUtterance) => {
      speakCalls.push({
        text: utterance.text,
        lang: utterance.lang,
        voice: utterance.voice ? utterance.voice.name : null,
      });
    },
    cancel: () => {
      cancelCalls.push(cancelCalls.length);
    },
    pause: () => {},
    resume: () => {},
    addEventListener: (type: string, handler: EventListener) => {
      if (type === 'voiceschanged') {
        onvoiceschanged = handler as unknown as () => void;
      }
    },
    removeEventListener: (type: string, handler: EventListener) => {
      if (type === 'voiceschanged' && onvoiceschanged === (handler as unknown as () => void)) {
        onvoiceschanged = null;
      }
    },
    dispatchEvent: () => true,
    get onvoiceschanged() {
      return onvoiceschanged;
    },
    set onvoiceschanged(handler: (() => void) | null) {
      onvoiceschanged = handler;
    },
  };

  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    writable: true,
    value: fakeSpeechSynthesis,
  });
  Object.defineProperty(window, 'SpeechSynthesisUtterance', {
    configurable: true,
    writable: true,
    value: FakeSpeechSynthesisUtterance,
  });

  return {
    speakCalls,
    cancelCalls,
    setVoices(next: FakeSpeechVoice[]) {
      voices = [...next];
    },
    fireVoicesChanged(next: FakeSpeechVoice[]) {
      voices = [...next];
      onvoiceschanged?.();
    },
    reset() {
      speakCalls.length = 0;
      cancelCalls.length = 0;
    },
    uninstall() {
      if (hadSpeechSynthesis) {
        Object.defineProperty(window, 'speechSynthesis', {
          configurable: true,
          writable: true,
          value: originalSpeechSynthesis,
        });
      } else {
        delete (window as unknown as { speechSynthesis?: unknown }).speechSynthesis;
      }
      if (hadUtterance) {
        Object.defineProperty(window, 'SpeechSynthesisUtterance', {
          configurable: true,
          writable: true,
          value: originalUtterance,
        });
      } else {
        delete (window as unknown as { SpeechSynthesisUtterance?: unknown })
          .SpeechSynthesisUtterance;
      }
    },
  };
}
