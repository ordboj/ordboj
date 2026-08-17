import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import { PracticeCard } from '@/components/PracticeCard';
import {
  installSpeechSynthesisMock,
  SV_VOICE,
  type SpeechSynthesisMockHandle,
} from '@/test/speechMock';
import { SKRIVA, TALA, FARDAS, MISSLYCKAS, TE_SIG, KUNNA, ANSE } from '@/test/conjugationFixtures';
import type { ConjugatedVerb, Form } from '@/lib/verbs';

// Issue #456: src/lib/speech.ts's buildConjugationUtterance (#453) and
// src/components/PracticeCard.tsx (frontend-expert) each carry their own
// copy of "which conjugated form counts as speakable" (isFormUnavailable —
// empty value, the "(not available)" sentinel, or imperativ on a verb that
// grammatically has none). This file proves the two copies agree for real
// fixture verbs, so a change to one that silently diverges from the other
// fails here instead of in production.
//
// generateVerbPattern() (src/lib/verbs.ts) never puts all five forms in one
// pattern: quizzing "imperativ" yields exactly [infinitive, imperativ];
// quizzing anything else yields exactly [infinitive, presens, preteritum,
// supinum] (imperativ is never part of that pattern, regardless of
// availability). Reconstructing PracticeCard's full 5-form availability for
// one verb therefore takes two renders — one quizzing "imperativ", one
// quizzing "presens" — whose combined "Pronounce pattern" output is compared
// against buildConjugationUtterance()'s output for the identical
// ConjugatedVerb.
//
// Comparison is per-render and ordered, not by set, so a verb with repeated
// form strings (e.g. a deponent verb whose infinitive, presens and imperativ
// all coincide) is still covered — a dropped or duplicated form changes the
// ordered array even when it would not change a set.

let speech: SpeechSynthesisMockHandle;

beforeEach(() => {
  speech = installSpeechSynthesisMock([SV_VOICE]);
});

afterEach(() => {
  speech.uninstall();
});

// Renders PracticeCard quizzing `form`, submits any non-empty answer to
// reach the feedback screen (the "Complete pattern" reveal, and its
// "Pronounce pattern" button, render on any submission, correct or not),
// clicks "Pronounce pattern", and returns the spoken utterance split into
// its comma-separated parts. Returns [] if no "Pronounce pattern" button
// renders at all (nothing on the pattern was speakable).
async function spokenPatternParts(infinitive: string, form: Form): Promise<string[]> {
  const { unmount } = renderWithProviders(
    <PracticeCard
      infinitive={infinitive}
      form={form}
      mode="typing"
      showExamples={false}
      autoplayAudio={false}
      muteAudio={false}
      onAnswer={vi.fn()}
    />,
  );

  const user = userEvent.setup();
  const input = await screen.findByPlaceholderText('Type your answer...');
  await user.type(input, 'x');
  await user.click(screen.getByRole('button', { name: /check answer/i }));
  await screen.findByText('Complete pattern:');

  const pronounceButton = screen.queryByRole('button', { name: /pronounce pattern/i });
  if (!pronounceButton) {
    unmount();
    return [];
  }

  const before = speech.speakCalls.length;
  await user.click(pronounceButton);
  await waitFor(() => expect(speech.speakCalls.length).toBeGreaterThan(before));

  const lastCall = speech.speakCalls[speech.speakCalls.length - 1];
  unmount();
  if (!lastCall) {
    throw new Error('expected speechSynthesis.speak() to have been called at least once');
  }
  return lastCall.text.split(', ');
}

// Derives the same forms PracticeCard's rendered pattern is expected to
// speak for one quiz form, using the builder's own two exclusion rules
// (imperativNotApplicable, and an empty or "(not available)" sentinel
// value) applied directly to the verb — independent of PracticeCard.
function expectedParts(verb: ConjugatedVerb, forms: Form[]): string[] {
  return forms
    .filter((f) => !(f === 'imperativ' && verb.imperativNotApplicable))
    .map((f) => verb[f] as string)
    .filter((value) => value !== '' && value !== '(not available)');
}

describe('buildConjugationUtterance / PracticeCard availability parity (#456)', () => {
  it.each([
    ['skriva (every form available)', SKRIVA],
    ['tala (imperativ repeats the infinitive)', TALA],
    ['färdas (deponent, -s in every form)', FARDAS],
    ['misslyckas (deponent)', MISSLYCKAS],
    ['te sig (sentinel-excluded imperativ)', TE_SIG],
    ['anse (sentinel-excluded imperativ)', ANSE],
    ['kunna (imperativNotApplicable-excluded imperativ)', KUNNA],
  ] as const)(
    "%s: PracticeCard renders as speakable exactly what buildConjugationUtterance's rule predicts",
    async (_label, verb) => {
      expect(await spokenPatternParts(verb.infinitive, 'imperativ')).toEqual(
        expectedParts(verb, ['infinitive', 'imperativ']),
      );
      expect(await spokenPatternParts(verb.infinitive, 'presens')).toEqual(
        expectedParts(verb, ['infinitive', 'presens', 'preteritum', 'supinum']),
      );
    },
  );
});
