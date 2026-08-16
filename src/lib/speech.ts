// Web Speech API wrapper for Swedish pronunciation

// How long to wait for the browser to deliver its voice list via the
// `voiceschanged` event before giving up (some browsers, notably Chrome,
// populate `getVoices()` asynchronously on first call).
const VOICE_WAIT_TIMEOUT_MS = 3000;

// Bumped by stopSpeaking() so any speakSwedish() call still waiting on
// voices resolves into a no-op instead of speaking stale text.
let cancelToken = 0;

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

    const onVoicesChanged = () => finish(synth.getVoices());

    const cleanup = () => {
      if (typeof synth.removeEventListener === 'function') {
        synth.removeEventListener('voiceschanged', onVoicesChanged);
      }
      if (synth.onvoiceschanged === onVoicesChanged) {
        synth.onvoiceschanged = null;
      }
    };

    const finish = (voices: SpeechSynthesisVoice[]) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanup();
      resolve(voices);
    };

    if (typeof synth.addEventListener === 'function') {
      synth.addEventListener('voiceschanged', onVoicesChanged);
    } else {
      synth.onvoiceschanged = onVoicesChanged;
    }

    const timer = setTimeout(() => finish(synth.getVoices()), VOICE_WAIT_TIMEOUT_MS);
  });
}

export function speakSwedish(text: string, muted: boolean = false): void {
  if (muted || !('speechSynthesis' in window)) {
    return;
  }

  const token = cancelToken;

  const trySpeak = (voices: SpeechSynthesisVoice[]) => {
    // stopSpeaking() was called while we were waiting for voices — drop it.
    if (token !== cancelToken) {
      return;
    }

    const swedishVoice = findSwedishVoice(voices);
    if (!swedishVoice) {
      // No Swedish voice available: stay silent rather than speak in a
      // default-language voice.
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'sv-SE';
    utterance.rate = 0.85;
    utterance.voice = swedishVoice;
    speechSynthesis.speak(utterance);
  };

  waitForVoices().then(trySpeak);
}

// Cancels any in-progress or queued speech, and invalidates speakSwedish()
// calls still waiting on the browser's voice list so they don't speak once
// it finally arrives.
export function stopSpeaking(): void {
  cancelToken += 1;
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
