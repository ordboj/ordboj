// Web Speech API wrapper for Swedish pronunciation

import type { ConjugatedVerb, Form } from './verbs';

// How long to wait for the browser to deliver its voice list via the
// `voiceschanged` event before giving up (some browsers, notably Chrome,
// populate `getVoices()` asynchronously on first call).
const VOICE_WAIT_TIMEOUT_MS = 3000;

// Bumped by stopSpeaking() so any speakSwedish() call still waiting on
// voices resolves into a no-op instead of speaking stale text.
let cancelToken = 0;

// Every speakSwedish() call currently in flight -- still waiting on the
// voice list, or already handed to speechSynthesis.speak() -- keyed by its
// own settle callback (see speakSwedish below). stopSpeaking() fires and
// clears these directly rather than relying on the browser dispatching an
// `error`/`end` event to a cancelled utterance, which not every
// implementation (or test double) does.
const pendingSettles = new Set<() => void>();

function findSwedishVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  return voices.find(
    (voice) => voice.lang.startsWith('sv') || voice.name.toLowerCase().includes('swedish'),
  );
}

// Resolves with the voice list once populated, or after VOICE_WAIT_TIMEOUT_MS
// with whatever is available (possibly still empty) — never rejects.
function waitForVoices(): Promise<SpeechSynthesisVoice[]> {
  const synth = speechSynthesis;
  const immediate = synth.getVoices();
  if (immediate.length > 0) {
    return Promise.resolve(immediate);
  }

  return new Promise((resolve) => {
    let settled = false;
    // Assigned after the listener is registered below, so a synchronous
    // voiceschanged dispatch during addEventListener does not read this
    // before it is initialized.
    // eslint-disable-next-line prefer-const
    let timer: ReturnType<typeof setTimeout> | undefined;
    const previous = synth.onvoiceschanged;

    const onVoicesChanged = () => finish(synth.getVoices());

    const cleanup = () => {
      if (typeof synth.removeEventListener === 'function') {
        synth.removeEventListener('voiceschanged', onVoicesChanged);
      }
      if (synth.onvoiceschanged === onVoicesChanged) {
        synth.onvoiceschanged = previous;
      }
    };

    const finish = (voices: SpeechSynthesisVoice[]) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      cleanup();
      resolve(voices);
    };

    if (typeof synth.addEventListener === 'function') {
      synth.addEventListener('voiceschanged', onVoicesChanged);
    } else {
      synth.onvoiceschanged = function (this: SpeechSynthesis, event: Event) {
        previous?.call(this, event);
        onVoicesChanged();
      };
    }

    timer = setTimeout(() => finish(synth.getVoices()), VOICE_WAIT_TIMEOUT_MS);
  });
}

export interface SpeakOptions {
  // Fires exactly once per speakSwedish() call, once playback has settled
  // one way or another: the utterance finished, it errored, stopSpeaking()
  // cancelled it (whether still waiting on voices or already speaking), or
  // the call took a silent-skip path (muted, no speechSynthesis, no Swedish
  // voice found, or the voice-wait timed out). Never fires more than once.
  onEnd?: () => void;
}

export function speakSwedish(text: string, muted: boolean = false, options?: SpeakOptions): void {
  let settled = false;
  const settle = () => {
    if (settled) return;
    settled = true;
    pendingSettles.delete(settle);
    options?.onEnd?.();
  };

  if (muted || !('speechSynthesis' in window)) {
    settle();
    return;
  }

  const token = cancelToken;
  pendingSettles.add(settle);

  const trySpeak = (voices: SpeechSynthesisVoice[]) => {
    // stopSpeaking() was called while we were waiting for voices — drop it.
    if (token !== cancelToken) {
      settle();
      return;
    }

    const swedishVoice = findSwedishVoice(voices);
    if (!swedishVoice) {
      // No Swedish voice available: stay silent rather than speak in a
      // default-language voice.
      settle();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'sv-SE';
    utterance.rate = 0.85;
    utterance.voice = swedishVoice;
    utterance.onend = settle;
    utterance.onerror = settle;
    speechSynthesis.speak(utterance);
  };

  void waitForVoices().then(trySpeak).catch(settle);
}

// Cancels any in-progress or queued speech, and invalidates speakSwedish()
// calls still waiting on the browser's voice list so they don't speak once
// it finally arrives. Also settles every such call's onEnd callback
// directly (see pendingSettles above), since cancel() cancelling an
// in-flight utterance is not guaranteed to dispatch that utterance's own
// `error` event.
export function stopSpeaking(): void {
  cancelToken += 1;
  for (const settle of [...pendingSettles]) {
    settle();
  }
  if ('speechSynthesis' in window) {
    speechSynthesis.cancel();
  }
}

// Preload voices (some browsers load voices asynchronously)
export function loadVoices(): Promise<void> {
  return new Promise((resolve) => {
    if ('speechSynthesis' in window) {
      const voices = speechSynthesis.getVoices();
      if (voices.length > 0) {
        resolve();
      } else {
        speechSynthesis.onvoiceschanged = () => resolve();
      }
    } else {
      resolve();
    }
  });
}

// verbs.ts (swedish-linguist, #124) falls back to this literal string when a
// form has no value. See the identical sentinel and isFormUnavailable in
// PracticeCard.tsx (PracticeCard.tsx:43-52) for why it stays as a fallback
// alongside ConjugatedVerb.imperativNotApplicable.
const UNAVAILABLE_FORM_SENTINEL = '(not available)';

// Speakable forms in canonical order: infinitive, presens, preteritum,
// supinum, imperativ.
const CONJUGATION_FORM_ORDER: Form[] = [
  'infinitive',
  'presens',
  'preteritum',
  'supinum',
  'imperativ',
];

// Predicate semantics identical to PracticeCard's isFormUnavailable
// (PracticeCard.tsx:45-52): a form is unavailable when its value is
// empty/undefined, equals the "(not available)" sentinel, or is imperativ on
// a verb that grammatically has none (imperativNotApplicable).
function isFormUnavailable(
  form: Form,
  value: string | undefined,
  imperativNotApplicable: boolean | undefined,
): boolean {
  if (form === 'imperativ' && imperativNotApplicable) return true;
  return !value || value === UNAVAILABLE_FORM_SENTINEL;
}

// Builds one speakable utterance covering every available conjugated form of
// `verb`, in canonical order (infinitive, presens, preteritum, supinum,
// imperativ), joined the same way PracticeCard joins its pattern utterance
// (PracticeCard.tsx:142-144). A form isFormUnavailable excludes -- empty,
// the "(not available)" sentinel, or an inapplicable imperativ -- is left
// out entirely, never rendered as a gap. Pure: reads `verb`'s own form
// strings as-is and never mutates, trims or re-derives them. Returns '' when
// nothing on the verb is speakable.
export function buildConjugationUtterance(verb: ConjugatedVerb): string {
  return CONJUGATION_FORM_ORDER.filter(
    (form) => !isFormUnavailable(form, verb[form], verb.imperativNotApplicable),
  )
    .map((form) => verb[form])
    .join(', ');
}
