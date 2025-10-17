// Web Speech API wrapper for Swedish pronunciation
export function speakSwedish(text: string, muted: boolean = false): void {
  if (muted || !('speechSynthesis' in window)) {
    return;
  }
  
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'sv-SE';
  utterance.rate = 0.85;
  
  // Try to find Swedish voice
  const voices = speechSynthesis.getVoices();
  const swedishVoice = voices.find(voice => 
    voice.lang.startsWith('sv') || voice.name.toLowerCase().includes('swedish')
  );
  
  if (swedishVoice) {
    utterance.voice = swedishVoice;
  }
  
  speechSynthesis.speak(utterance);
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
