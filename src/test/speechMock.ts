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
//   expect(speech.speakCalls).toMatchObject([{ text: 'testar', lang: 'sv-SE', voice: 'Alva' }]);

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
  /** Shared sequence number with cancelCalls; lower seq happened first. */
  seq: number;
}

/** One recorded speechSynthesis.cancel() call, in call order. */
export interface CancelCall {
  /** Shared sequence number with speakCalls; lower seq happened first. */
  seq: number;
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

/** Handler shape accepted by onvoiceschanged and addEventListener('voiceschanged', ...). */
type VoicesChangedHandler = (event?: Event) => void;

/** Marker used to detect an already-installed fake (see the double-install guard below). */
const SPEECH_MOCK_TAG = '__isSpeechMock';

export interface SpeechSynthesisMockHandle {
  /** Every speak() call so far, in order. Mutated in place; read freely. */
  readonly speakCalls: SpeakCall[];
  /** Every cancel() call so far, in order. Mutated in place; read freely. */
  readonly cancelCalls: CancelCall[];
  /** Replace the voice list getVoices() returns, without firing voiceschanged. */
  setVoices(voices: FakeSpeechVoice[]): void;
  /**
   * Simulates the async "voices arrived later" case: sets the voice list
   * and then invokes both the currently-registered onvoiceschanged handler
   * and every listener added via addEventListener('voiceschanged', ...),
   * matching how loadVoices() in src/lib/speech.ts awaits that callback.
   */
  fireVoicesChanged(voices: FakeSpeechVoice[]): void;
  /**
   * Clears the recorded call log (speakCalls, cancelCalls, the shared
   * sequence counter), restores the voice list to what installation started
   * with, and clears the onvoiceschanged handler and any addEventListener
   * listeners. Does not uninstall.
   */
  reset(): void;
  /** Restores window.speechSynthesis / window.SpeechSynthesisUtterance to their pre-install state. */
  uninstall(): void;
}

/**
 * Installs a fake window.speechSynthesis (and window.SpeechSynthesisUtterance)
 * for the duration of a test file / test. Call `.uninstall()` (e.g. from
 * afterEach) to restore whatever was there before.
 *
 * Throws if a fake installed by this function is already in place: install
 * without a matching uninstall() would otherwise capture the first fake as
 * the "original" and leave a fake installed after the second uninstall().
 */
export function installSpeechSynthesisMock(
  initialVoices: FakeSpeechVoice[] = [],
): SpeechSynthesisMockHandle {
  const existing = (
    window as unknown as { speechSynthesis?: { [SPEECH_MOCK_TAG]?: boolean } }
  ).speechSynthesis;
  if (existing?.[SPEECH_MOCK_TAG]) {
    throw new Error(
      'installSpeechSynthesisMock() called while a mock is already installed; call uninstall() on the previous handle first.',
    );
  }

  const hadSpeechSynthesis = 'speechSynthesis' in window;
  const originalSpeechSynthesis = hadSpeechSynthesis
    ? (window as unknown as { speechSynthesis: unknown }).speechSynthesis
    : undefined;
  const hadUtterance = 'SpeechSynthesisUtterance' in window;
  const originalUtterance = hadUtterance
    ? (window as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance
    : undefined;

  let voices: FakeSpeechVoice[] = [...initialVoices];
  let onvoiceschanged: VoicesChangedHandler | null = null;
  const voiceschangedListeners = new Set<VoicesChangedHandler>();
  let seq = 0;
  const speakCalls: SpeakCall[] = [];
  const cancelCalls: CancelCall[] = [];

  const fakeSpeechSynthesis = {
    [SPEECH_MOCK_TAG]: true,
    speaking: false,
    pending: false,
    paused: false,
    getVoices: () => voices,
    speak: (utterance: FakeSpeechSynthesisUtterance) => {
      speakCalls.push({
        text: utterance.text,
        lang: utterance.lang,
        voice: utterance.voice ? utterance.voice.name : null,
        seq: seq++,
      });
    },
    cancel: () => {
      cancelCalls.push({ seq: seq++ });
    },
    pause: () => {},
    resume: () => {},
    addEventListener: (type: string, handler: EventListener) => {
      if (type === 'voiceschanged') {
        voiceschangedListeners.add(handler as unknown as VoicesChangedHandler);
      }
    },
    removeEventListener: (type: string, handler: EventListener) => {
      if (type === 'voiceschanged') {
        voiceschangedListeners.delete(handler as unknown as VoicesChangedHandler);
      }
    },
    dispatchEvent: (event: Event) => {
      if (event.type === 'voiceschanged') {
        onvoiceschanged?.(event);
        voiceschangedListeners.forEach((listener) => listener(event));
      }
      return true;
    },
    get onvoiceschanged() {
      return onvoiceschanged;
    },
    set onvoiceschanged(handler: VoicesChangedHandler | null) {
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
      const event = new Event('voiceschanged');
      onvoiceschanged?.(event);
      voiceschangedListeners.forEach((listener) => listener(event));
    },
    reset() {
      speakCalls.length = 0;
      cancelCalls.length = 0;
      seq = 0;
      voices = [...initialVoices];
      onvoiceschanged = null;
      voiceschangedListeners.clear();
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
