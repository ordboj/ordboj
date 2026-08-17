import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  installSpeechSynthesisMock,
  SV_VOICE,
  NON_SV_VOICES,
  type SpeechSynthesisMockHandle,
  type FakeSpeechVoice,
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

  it('records speak() calls in order with text, lang and the sv voice chosen', async () => {
    // speakSwedish() resolves the voice list via a promise chain even when
    // getVoices() already has entries (waitForVoices() short-circuits to
    // Promise.resolve(immediate) but that still defers trySpeak() to a
    // microtask), so the speak() call lands asynchronously.
    speech.setVoices([SV_VOICE]);
    speakSwedish('testar', false);
    speakSwedish('provar', false);
    await vi.waitFor(() => expect(speech.speakCalls).toHaveLength(2));
    expect(speech.speakCalls).toMatchObject([
      { text: 'testar', lang: 'sv-SE', voice: 'Alva' },
      { text: 'provar', lang: 'sv-SE', voice: 'Alva' },
    ]);
  });

  it('makes zero speak() calls when only non-sv voices are present (voice guard)', async () => {
    // speech.ts's Swedish-voice guard: when the loaded voice list has no
    // 'sv' voice, speakSwedish() must stay silent rather than speak in a
    // default-language voice (issue #417/#421). Prove the negative by
    // giving a later, guaranteed-sv call time to land first: if the guard
    // were broken and a non-sv speak() call slipped through, it would sit
    // ahead of the sv one in speakCalls once both resolve.
    speech.setVoices(NON_SV_VOICES);
    speakSwedish('testar', false);

    speech.setVoices([SV_VOICE]);
    speakSwedish('sentinel', false);
    await vi.waitFor(() => expect(speech.speakCalls).toHaveLength(1));

    expect(speech.speakCalls).toMatchObject([{ text: 'sentinel', lang: 'sv-SE', voice: 'Alva' }]);
  });

  it("does not record a speak() call when muted, matching speakSwedish's own guard", () => {
    speech.setVoices([SV_VOICE]);
    speakSwedish('testar', true);
    expect(speech.speakCalls).toEqual([]);
  });

  it('gives cancel() and speak() a shared seq that proves their relative order', async () => {
    speech.setVoices([SV_VOICE]);
    window.speechSynthesis.cancel();
    speakSwedish('testar', false);

    await vi.waitFor(() => expect(speech.speakCalls).toHaveLength(1));
    expect(speech.cancelCalls).toHaveLength(1);
    expect(speech.cancelCalls[0]!.seq).toBeLessThan(speech.speakCalls[0]!.seq);
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

  it('reset() clears the call log without uninstalling', async () => {
    speech.setVoices([SV_VOICE]);
    speakSwedish('testar', false);
    window.speechSynthesis.cancel();
    await vi.waitFor(() => expect(speech.speakCalls).toHaveLength(1));
    expect(speech.cancelCalls).toHaveLength(1);

    speech.reset();

    expect(speech.speakCalls).toEqual([]);
    expect(speech.cancelCalls).toEqual([]);
    expect('speechSynthesis' in window).toBe(true);
  });

  it('reset() restores the voice list installation started with', () => {
    speech.setVoices([SV_VOICE]);
    expect(window.speechSynthesis.getVoices()).toEqual([SV_VOICE]);

    speech.reset();

    expect(window.speechSynthesis.getVoices()).toEqual([]);
  });

  it('reset() clears a registered onvoiceschanged so a stale resolve cannot fire later', async () => {
    const pending = loadVoices();
    let resolved = false;
    pending.then(() => {
      resolved = true;
    });

    speech.reset();
    speech.fireVoicesChanged([SV_VOICE]);
    await Promise.resolve();

    expect(resolved).toBe(false);
  });

  it('fireVoicesChanged() reaches an addEventListener listener, not just onvoiceschanged', () => {
    let received: FakeSpeechVoice[] | null = null;
    window.speechSynthesis.addEventListener('voiceschanged', () => {
      received = window.speechSynthesis.getVoices() as unknown as FakeSpeechVoice[];
    });

    speech.fireVoicesChanged([SV_VOICE]);

    expect(received).toEqual([SV_VOICE]);
  });

  it('dispatchEvent(voiceschanged) reaches both onvoiceschanged and addEventListener listeners', () => {
    let fromProperty = false;
    let fromListener = false;
    window.speechSynthesis.onvoiceschanged = () => {
      fromProperty = true;
    };
    window.speechSynthesis.addEventListener('voiceschanged', () => {
      fromListener = true;
    });

    const result = window.speechSynthesis.dispatchEvent(new Event('voiceschanged'));

    expect(result).toBe(true);
    expect(fromProperty).toBe(true);
    expect(fromListener).toBe(true);
  });

  it('removeEventListener only removes the listener it was given, not onvoiceschanged', () => {
    let propertyFired = false;
    let listenerFired = false;
    window.speechSynthesis.onvoiceschanged = () => {
      propertyFired = true;
    };
    const listener = () => {
      listenerFired = true;
    };
    window.speechSynthesis.addEventListener('voiceschanged', listener);
    window.speechSynthesis.removeEventListener('voiceschanged', listener);

    speech.fireVoicesChanged([SV_VOICE]);

    expect(propertyFired).toBe(true);
    expect(listenerFired).toBe(false);
  });

  it('throws on a second install without an intervening uninstall', () => {
    expect(() => installSpeechSynthesisMock()).toThrow(/already installed/);
  });
});
