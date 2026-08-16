import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  installSpeechSynthesisMock,
  SV_VOICE,
  NON_SV_VOICES,
  type SpeechSynthesisMockHandle,
} from './speechMock';
import { speakSwedish, loadVoices } from '@/lib/speech';

// This suite exercises the speechMock.ts stub itself (issue #418), against
// the real frontend-expert-owned src/lib/speech.ts boundary — not a
// reimplementation of speech.ts's logic, just proof the double records what
// that module actually does to it.

describe('speechMock', () => {
  let speech: SpeechSynthesisMockHandle;

  beforeEach(() => {
    speech = installSpeechSynthesisMock();
  });

  afterEach(() => {
    speech.uninstall();
  });

  it('is absent before install and after uninstall (opt-in, AC 5)', () => {
    expect('speechSynthesis' in window).toBe(true);
    speech.uninstall();
    expect('speechSynthesis' in window).toBe(false);
    expect('SpeechSynthesisUtterance' in window).toBe(false);
    // Re-install so the shared afterEach's uninstall() has something to undo.
    speech = installSpeechSynthesisMock();
  });

  it('records speak() calls in order with text, lang and the sv voice chosen', () => {
    speech.setVoices([SV_VOICE]);
    speakSwedish('testar', false);
    speakSwedish('provar', false);
    expect(speech.speakCalls).toEqual([
      { text: 'testar', lang: 'sv-SE', voice: 'Alva' },
      { text: 'provar', lang: 'sv-SE', voice: 'Alva' },
    ]);
  });

  it('records a null voice when only non-sv voices are present', () => {
    speech.setVoices(NON_SV_VOICES);
    speakSwedish('testar', false);
    expect(speech.speakCalls).toEqual([{ text: 'testar', lang: 'sv-SE', voice: null }]);
  });

  it("does not record a speak() call when muted, matching speakSwedish's own guard", () => {
    speech.setVoices([SV_VOICE]);
    speakSwedish('testar', true);
    expect(speech.speakCalls).toEqual([]);
  });

  it('resolves loadVoices() once fireVoicesChanged supplies a list, from an initially empty state', async () => {
    // No voices at install time: loadVoices() must wait on onvoiceschanged.
    const pending = loadVoices();
    let resolved = false;
    pending.then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);

    speech.fireVoicesChanged([SV_VOICE]);
    await pending;
    expect(resolved).toBe(true);
  });

  it('resolves loadVoices() immediately when a voice is already present', async () => {
    speech.setVoices([SV_VOICE]);
    await expect(loadVoices()).resolves.toBeUndefined();
  });

  it('records cancel() calls', () => {
    window.speechSynthesis.cancel();
    window.speechSynthesis.cancel();
    expect(speech.cancelCalls).toHaveLength(2);
  });

  it('reset() clears the call log without uninstalling', () => {
    speech.setVoices([SV_VOICE]);
    speakSwedish('testar', false);
    window.speechSynthesis.cancel();
    expect(speech.speakCalls).toHaveLength(1);
    expect(speech.cancelCalls).toHaveLength(1);

    speech.reset();

    expect(speech.speakCalls).toEqual([]);
    expect(speech.cancelCalls).toEqual([]);
    expect('speechSynthesis' in window).toBe(true);
  });
});
