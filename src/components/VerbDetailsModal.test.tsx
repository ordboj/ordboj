import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import { VerbDetailsModal } from '@/components/VerbDetailsModal';
import { getFormLabel, type ConjugatedVerb } from '@/lib/verbs';
import {
  installSpeechSynthesisMock,
  SV_VOICE,
  NON_SV_VOICES,
  type SpeechSynthesisMockHandle,
} from '@/test/speechMock';
import { reloadSettingsFromStorage, type Settings } from '@/hooks/useSettings';

// PR #199 (issue #112, AC #4): the "New" stage badge used an off-palette
// bg-purple-500 utility that doesn't map to a design token. It must use a
// design-token color instead. Issue #227 moved that color from the
// generic bg-primary token to the dedicated bg-stage-new token, so the
// off-palette-purple guard now pins bg-stage-new.
const VERB: ConjugatedVerb = {
  id: '1',
  infinitive: 'vara',
  cefr: 'A1',
  presens: 'är',
  preteritum: 'var',
  supinum: 'varit',
  imperativ: 'var',
};

describe('VerbDetailsModal - stage badge color token', () => {
  it('renders the New badge (stage 0) with the bg-stage-new token, not the off-palette purple', () => {
    renderWithProviders(
      <VerbDetailsModal verb={VERB} srsStage={0} srsStates={{}} onClose={vi.fn()} />,
    );

    const badge = screen.getByText('New');
    expect(badge).toHaveClass('bg-stage-new');
    expect(badge).not.toHaveClass('bg-purple-500');
  });
});

// Regression guard for issue #313: the stage badge's own MasteryStageBadge
// object still carries a `variant` field ('default' | 'secondary' |
// 'outline'), but every render site now hardcodes <Badge variant="outline">
// and ignores it. That matters because the shadcn Badge's "default" and
// "secondary" variants each add a hover:bg-*/80 utility meant for a
// clickable chip; this stage badge is static status text, not a control,
// so any hover fade is a bug, not a feature. If a render site ever went
// back to `variant={badge.variant}`, the New/Mastered badges ('default')
// and Learning badge ('secondary') would regain that hover fade silently.
describe('VerbDetailsModal - stage badge never carries a hover fade utility (issue #313)', () => {
  it.each([
    [0, 'New'],
    [1, 'Learning'],
    [3, 'Reviewing'],
    [5, 'Mastered'],
  ])('stage %i (%s) has no hover:bg-primary/80 or hover:bg-secondary/80 class', (stage, label) => {
    const { unmount } = renderWithProviders(
      <VerbDetailsModal verb={VERB} srsStage={stage} srsStates={{}} onClose={vi.fn()} />,
    );

    const badge = screen.getByText(label);
    expect(badge).not.toHaveClass('hover:bg-primary/80');
    expect(badge).not.toHaveClass('hover:bg-secondary/80');

    unmount();
  });
});

// Issue #124: imperativNotApplicable flags a form as grammatically
// confirmed absent (modal verbs), distinct from a merely empty/placeholder
// value. This fixture gives the flagged verb a REAL, non-empty imperativ
// value (not the "(not available)" sentinel), so hiding it can only be
// explained by the new flag -- against pre-#124 code (no such field on
// ConjugatedVerb), a real non-empty value always rendered a normal row, so
// this fails there for the right reason.
describe('VerbDetailsModal - imperativNotApplicable flag hides the imperativ row regardless of stored value (issue #124)', () => {
  it('hides the Imperative row for a verb flagged imperativNotApplicable, even though it has a real, non-empty imperativ value', () => {
    const flaggedVerb: ConjugatedVerb = {
      ...VERB,
      imperativ: 'realimperativvalue',
      imperativNotApplicable: true,
    };
    renderWithProviders(
      <VerbDetailsModal verb={flaggedVerb} srsStage={0} srsStates={{}} onClose={vi.fn()} />,
    );

    expect(screen.queryByText('realimperativvalue')).not.toBeInTheDocument();
    expect(screen.queryByText(getFormLabel('imperativ'))).not.toBeInTheDocument();
  });

  it('still shows the Imperative row for a verb with a real imperativ and no flag (baseline, unaffected by #124)', () => {
    renderWithProviders(
      <VerbDetailsModal verb={VERB} srsStage={0} srsStates={{}} onClose={vi.fn()} />,
    );

    const label = screen.getByText(getFormLabel('imperativ'));
    expect(label).toBeInTheDocument();
    // VERB's preteritum and imperativ happen to share the same text ("var"),
    // so scope to the imperativ row's own container rather than a bare
    // getByText, which would find both.
    const row = label.closest('.border.rounded-lg') as HTMLElement;
    expect(within(row).getByText('var')).toBeInTheDocument();
  });
});

// Issue #110 AC: touch targets must be at least 44px. Both pronounce
// buttons here were 40px (the infinitive one: size="icon" default h-10 w-10,
// no explicit size class) and 32px (h-8 w-8, the per-form one) before this fix.
describe('VerbDetailsModal - pronounce button touch targets (issue #110 AC)', () => {
  it('renders the infinitive pronounce button at 44px (h-11 w-11) with an aria-label', () => {
    renderWithProviders(
      <VerbDetailsModal verb={VERB} srsStage={0} srsStates={{}} onClose={vi.fn()} />,
    );

    const button = screen.getByRole('button', { name: `Pronounce ${VERB.infinitive}` });
    expect(button).toHaveClass('h-11');
    expect(button).toHaveClass('w-11');
  });

  it('renders each per-form pronounce button at 44px (h-11 w-11) with an aria-label, not the old 32px (h-8 w-8)', () => {
    renderWithProviders(
      <VerbDetailsModal verb={VERB} srsStage={0} srsStates={{}} onClose={vi.fn()} />,
    );

    const formButton = screen.getByRole('button', {
      name: `Pronounce ${getFormLabel('presens')}`,
    });
    expect(formButton).toHaveClass('h-11');
    expect(formButton).toHaveClass('w-11');
    expect(formButton).not.toHaveClass('h-8');
    expect(formButton).not.toHaveClass('w-8');
  });
});

describe("VerbDetailsModal - lang='sv' on Swedish word display", () => {
  it("wraps the infinitive display with lang='sv' spans/paragraphs", () => {
    renderWithProviders(
      <VerbDetailsModal verb={VERB} srsStage={0} srsStates={{}} onClose={vi.fn()} />,
    );

    // Two separate renderings of the infinitive: the dialog title and the
    // "Infinitive" detail row. Both must carry lang="sv".
    const occurrences = screen.getAllByText('vara');
    expect(occurrences.length).toBeGreaterThan(0);
    for (const el of occurrences) {
      expect(el).toHaveAttribute('lang', 'sv');
    }
  });
});

// Issue #228 (AC): a "grupp X" text badge beside the CEFR badge.
describe('VerbDetailsModal - grupp badge (issue #228)', () => {
  it('shows "grupp 4" beside the CEFR badge for a verb with a known konjugationsgrupp, and shows no grupp badge (never guessed) for a verb whose grupp is unknown', () => {
    // "vara" is grupp '4' in VERB_DATA (swedish-linguist owned fixture). This
    // positive case makes the negative case below non-vacuous: the feature
    // demonstrably exists and only omits the badge for the unknown verb.
    const { unmount } = renderWithProviders(
      <VerbDetailsModal verb={VERB} srsStage={0} srsStates={{}} onClose={vi.fn()} />,
    );
    const cefrBadge = screen.getByText('A1');
    const gruppBadge = screen.getByText('grupp 4');
    expect(cefrBadge).toBeInTheDocument();
    expect(gruppBadge).toBeInTheDocument();
    // "beside" per the acceptance criteria: same immediate container.
    expect(gruppBadge.parentElement).toBe(cefrBadge.parentElement);
    unmount();

    // Real assertion: an infinitive absent from VERB_DATA has an undefined
    // grupp per getVerbGrupp's documented contract (src/lib/verbs.ts:29-32),
    // which must render as absent, never guessed.
    const unknownGruppVerb: ConjugatedVerb = { ...VERB, infinitive: 'zzz-not-a-real-verb-fixture' };
    renderWithProviders(
      <VerbDetailsModal verb={unknownGruppVerb} srsStage={0} srsStates={{}} onClose={vi.fn()} />,
    );
    expect(screen.getByText('A1')).toBeInTheDocument();
    expect(screen.queryByText(/grupp/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/undefined/i)).not.toBeInTheDocument();
  });
});

// --- Issue #458: auto-play, stop, mute and form-skip paths -----------------
//
// Spec: docs/learning/2026-08-17-spoken-paradigm-rules.md (swedish-linguist,
// #454) freezes the canonical-order / ', '-join / verbatim rules and the six
// expected-utterance fixture strings pinned below. The production wiring
// this section exercises (autoReadAllForms setting, buildConjugationUtterance
// + speakSwedish's onEnd settle callback, and the modal's "Pronounce all
// forms" / "Stop" controls plus its auto-play effect) is all merged to main
// (issues #453, #455, #457). Mocking only the boundary this suite does not
// own: window.speechSynthesis (src/test/speechMock.ts, #418), never
// speech.ts or useSettings.ts themselves.
//
// Settings control here goes through the REAL useSettings store (writeSettings
// below writes straight to the localStorage key it reads) rather than
// vi.mock('@/hooks/useSettings', ...). A vi.mock call is hoisted to the top
// of the whole test module by Vitest regardless of where it is written in
// source, so it would silently apply to every describe block in this file —
// including the five pre-existing ones above, which exercise the real
// settings store and never opted into a fake one (this replaced an earlier
// version of this section that made exactly that mistake). Driving the real
// store through its own localStorage boundary keeps the fake scoped to
// exactly the tests that call writeSettings(), and is the same technique
// src/hooks/useSettings.test.ts itself already uses for the "external write,
// then reloadSettingsFromStorage()" case.

// Fixture verbs transcribed verbatim from src/data/verbData.ts (as of the
// #454 freeze note: kunna:66, skriva:86, te sig:87, anse:112, tala:120,
// färdas:806) into the exact shape getAllConjugatedVerbs()/conjugateVerb()
// in src/lib/verbs.ts produce (raw form or its "(not available)" fallback,
// imperativNotApplicable carried through as-is).
const SKRIVA: ConjugatedVerb = {
  id: 'skriva',
  infinitive: 'skriva',
  cefr: 'A1',
  presens: 'skriver',
  preteritum: 'skrev',
  supinum: 'skrivit',
  imperativ: 'skriv',
};
const TALA: ConjugatedVerb = {
  id: 'tala',
  infinitive: 'tala',
  cefr: 'A1',
  presens: 'talar',
  preteritum: 'talade',
  supinum: 'talat',
  imperativ: 'tala',
};
const FARDAS: ConjugatedVerb = {
  id: 'färdas',
  infinitive: 'färdas',
  cefr: 'B1',
  presens: 'färdas',
  preteritum: 'färdades',
  supinum: 'färdats',
  imperativ: 'färdas',
};
const TE_SIG: ConjugatedVerb = {
  id: 'te sig',
  infinitive: 'te sig',
  cefr: 'C1',
  presens: 'ter sig',
  preteritum: 'tedde sig',
  supinum: 'tett sig',
  imperativ: '(not available)',
};
const KUNNA: ConjugatedVerb = {
  id: 'kunna',
  infinitive: 'kunna',
  cefr: 'A1',
  presens: 'kan',
  preteritum: 'kunde',
  supinum: 'kunnat',
  imperativ: '(not available)',
  imperativNotApplicable: true,
};
const ANSE: ConjugatedVerb = {
  id: 'anse',
  infinitive: 'anse',
  cefr: 'A1',
  presens: 'anser',
  preteritum: 'ansåg',
  supinum: 'ansett',
  imperativ: '(not available)',
};

// Mirrors useSettings.ts's own private STORAGE_KEY constant — there is no
// exported binding for it, so this local copy follows the same pattern as
// useSrsProgress.test.ts's local STORAGE_KEY and useSettings.test.ts's own
// local STORAGE_KEY. Writing the bare (unversioned) shape is deliberate:
// parseStoredSettings accepts both the legacy bare object and the versioned
// envelope, and the bare shape is what every write here needs to express
// (see writeSettings' own comment).
const SETTINGS_STORAGE_KEY = 'swedish-verbs-settings';

// Writes a complete Settings object straight to the real store's
// localStorage key. Every field is given an explicit default value (rather
// than merging over some imported DEFAULT_SETTINGS, which useSettings.ts
// does not export) so a test only has to name the field it cares about.
function writeSettings(overrides: Partial<Settings> = {}): void {
  const settings: Settings = {
    practiceMode: 'typing',
    showExamples: false,
    autoplayAudio: true,
    muteAudio: false,
    autoReadAllForms: false,
    dailyGoal: 20,
    particleDailyGoal: 12,
    cefrLevels: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
    ...overrides,
  };
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

// Runs before every test in this file, including the five pre-existing
// describe blocks above — harmless for them since none reads or writes the
// settings localStorage key, and it is what keeps writeSettings()
// deterministic for the tests below rather than depending on whatever the
// previous test in this file left behind. The real useSettings store
// re-hydrates from localStorage once the component that read it unmounts
// (its own isHydrated flag resets when the last subscriber detaches — see
// useSettings.ts) and RTL's global afterEach (src/test/setup.ts) unmounts
// after every test, so a writeSettings() + render() pair always observes
// the value just written.
beforeEach(() => {
  localStorage.clear();
});

describe('VerbDetailsModal - autoReadAllForms opt-in auto-play (issue #458)', () => {
  let speech: SpeechSynthesisMockHandle;

  beforeEach(() => {
    speech = installSpeechSynthesisMock([SV_VOICE]);
  });

  afterEach(() => {
    speech.uninstall();
  });

  it('makes zero speakSwedish calls when opened with no stored setting (default off)', () => {
    renderWithProviders(
      <VerbDetailsModal verb={SKRIVA} srsStage={0} srsStates={{}} onClose={vi.fn()} />,
    );

    expect(speech.speakCalls).toHaveLength(0);
  });

  it('speaks exactly one utterance equal to the frozen fixture string when autoReadAllForms is true', async () => {
    writeSettings({ autoReadAllForms: true });
    renderWithProviders(
      <VerbDetailsModal verb={SKRIVA} srsStage={0} srsStates={{}} onClose={vi.fn()} />,
    );

    await waitFor(() => expect(speech.speakCalls).toHaveLength(1));
    expect(speech.speakCalls[0]!.text).toBe('skriva, skriver, skrev, skrivit, skriv');
  });

  it('does not speak a second time when the open modal re-renders for the same verb (settings change, SRS update, parent re-render)', async () => {
    writeSettings({ autoReadAllForms: true });
    const { rerender } = renderWithProviders(
      <VerbDetailsModal verb={SKRIVA} srsStage={0} srsStates={{}} onClose={vi.fn()} />,
    );
    await waitFor(() => expect(speech.speakCalls).toHaveLength(1));

    // Settings change: a field the auto-play effect does NOT depend on
    // (dailyGoal) changes while autoReadAllForms/muteAudio (the effect's
    // actual dependencies) stay the same. reloadSettingsFromStorage() forces
    // the real store to hand every subscriber a brand-new settings object,
    // so this also proves the effect keys off those two primitive values,
    // not the settings object's identity.
    writeSettings({ autoReadAllForms: true, dailyGoal: 30 });
    act(() => {
      reloadSettingsFromStorage();
    });
    // SRS update (new srsStates reference, same verb).
    rerender(<VerbDetailsModal verb={SKRIVA} srsStage={1} srsStates={{}} onClose={vi.fn()} />);
    // Parent re-render passing a freshly-created but value-identical verb
    // object — proves the effect keys off the verb's identity value, not
    // object reference.
    rerender(
      <VerbDetailsModal verb={{ ...SKRIVA }} srsStage={1} srsStates={{}} onClose={vi.fn()} />,
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(speech.speakCalls).toHaveLength(1);
  });

  it('cancels the first verb and speaks once for the second when a new verb opens without closing', async () => {
    writeSettings({ autoReadAllForms: true });
    const { rerender } = renderWithProviders(
      <VerbDetailsModal verb={SKRIVA} srsStage={0} srsStates={{}} onClose={vi.fn()} />,
    );
    await waitFor(() => expect(speech.speakCalls).toHaveLength(1));
    expect(speech.speakCalls[0]!.text).toBe('skriva, skriver, skrev, skrivit, skriv');

    rerender(<VerbDetailsModal verb={TALA} srsStage={0} srsStates={{}} onClose={vi.fn()} />);

    await waitFor(() => expect(speech.speakCalls).toHaveLength(2));
    expect(speech.speakCalls[1]!.text).toBe('tala, talar, talade, talat, tala');
    expect(speech.cancelCalls.length).toBeGreaterThanOrEqual(1);
    // The cancel happened before the second verb's speak call, not after.
    expect(speech.cancelCalls[0]!.seq).toBeLessThan(speech.speakCalls[1]!.seq);
  });
});

describe('VerbDetailsModal - "Pronounce all forms" button (issue #458)', () => {
  let speech: SpeechSynthesisMockHandle;

  beforeEach(() => {
    speech = installSpeechSynthesisMock([SV_VOICE]);
  });

  afterEach(() => {
    speech.uninstall();
  });

  it('produces one speakSwedish call equal to the fixture string on click', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <VerbDetailsModal verb={SKRIVA} srsStage={0} srsStates={{}} onClose={vi.fn()} />,
    );

    await user.click(screen.getByRole('button', { name: 'Pronounce all forms' }));
    await waitFor(() => expect(speech.speakCalls).toHaveLength(1));
    expect(speech.speakCalls[0]!.text).toBe('skriva, skriver, skrev, skrivit, skriv');
  });

  it('calls stopSpeaking() before speaking again on a second click', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <VerbDetailsModal verb={SKRIVA} srsStage={0} srsStates={{}} onClose={vi.fn()} />,
    );
    const button = screen.getByRole('button', { name: 'Pronounce all forms' });

    await user.click(button);
    await waitFor(() => expect(speech.speakCalls).toHaveLength(1));

    await user.click(button);
    await waitFor(() => expect(speech.speakCalls).toHaveLength(2));

    // handlePronounceAll calls stopSpeaking() unconditionally on every click
    // (VerbDetailsModal.tsx: "a second click on this button while a paradigm
    // is already playing replaces it, it never queues alongside it"), so the
    // first click also produces a harmless no-op cancel before the first
    // speak call. The real assertion is that a cancel call lands strictly
    // between the first and second speak calls, proving the second click's
    // stop happens before its own speak, not after.
    const cancelBetweenTheTwoSpeaks = speech.cancelCalls.find(
      (call) => call.seq > speech.speakCalls[0]!.seq && call.seq < speech.speakCalls[1]!.seq,
    );
    expect(cancelBetweenTheTwoSpeaks).toBeDefined();
  });
});

// The six frozen fixture strings from docs/learning/2026-08-17-spoken-paradigm-rules.md,
// pinned verbatim per that note's routing to qa. Exercised through the
// "Pronounce all forms" button so this also covers the AC7 skip cases: (d)
// kunna's imperativNotApplicable exclusion and (c)/(e) te sig / anse's
// "(not available)"-sentinel exclusion, using real verbData rows rather than
// placeholder strings.
describe('VerbDetailsModal - pins the six frozen fixture utterances (issue #458)', () => {
  let speech: SpeechSynthesisMockHandle;

  beforeEach(() => {
    speech = installSpeechSynthesisMock([SV_VOICE]);
  });

  afterEach(() => {
    speech.uninstall();
  });

  it.each([
    ['skriva', SKRIVA, 'skriva, skriver, skrev, skrivit, skriv'],
    ['tala', TALA, 'tala, talar, talade, talat, tala'],
    ['färdas', FARDAS, 'färdas, färdas, färdades, färdats, färdas'],
    ['te sig', TE_SIG, 'te sig, ter sig, tedde sig, tett sig'],
    ['kunna', KUNNA, 'kunna, kan, kunde, kunnat'],
    ['anse', ANSE, 'anse, anser, ansåg, ansett'],
  ])('speaks the frozen fixture utterance for %s', async (_label, verb, expected) => {
    const user = userEvent.setup();
    renderWithProviders(
      <VerbDetailsModal verb={verb} srsStage={0} srsStates={{}} onClose={vi.fn()} />,
    );

    await user.click(screen.getByRole('button', { name: 'Pronounce all forms' }));
    await waitFor(() => expect(speech.speakCalls).toHaveLength(1));

    expect(speech.speakCalls[0]!.text).toBe(expected);
  });
});

// Regression-style companion to the #124 badge test above: proves the
// imperativNotApplicable flag excludes the form from the *spoken* utterance
// too, even when the stored value is a real, non-sentinel string rather than
// the usual "(not available)" placeholder.
describe('VerbDetailsModal - imperativNotApplicable excludes the form from speech regardless of stored value (issue #458, parity with #124)', () => {
  let speech: SpeechSynthesisMockHandle;

  beforeEach(() => {
    speech = installSpeechSynthesisMock([SV_VOICE]);
  });

  afterEach(() => {
    speech.uninstall();
  });

  it('never speaks a flagged imperativ, even though its stored value looks like real data', async () => {
    const user = userEvent.setup();
    const flaggedVerb: ConjugatedVerb = {
      id: '1',
      infinitive: 'vara',
      cefr: 'A1',
      presens: 'är',
      preteritum: 'var',
      supinum: 'varit',
      imperativ: 'realimperativvalue',
      imperativNotApplicable: true,
    };
    renderWithProviders(
      <VerbDetailsModal verb={flaggedVerb} srsStage={0} srsStates={{}} onClose={vi.fn()} />,
    );

    await user.click(screen.getByRole('button', { name: 'Pronounce all forms' }));
    await waitFor(() => expect(speech.speakCalls).toHaveLength(1));

    expect(speech.speakCalls[0]!.text).not.toContain('realimperativvalue');
    expect(speech.speakCalls[0]!.text).toBe('vara, är, var, varit');
  });
});

describe('VerbDetailsModal - muteAudio suppresses auto-play and the "Pronounce all forms" click, and Stop never appears (issue #458)', () => {
  let speech: SpeechSynthesisMockHandle;

  beforeEach(() => {
    speech = installSpeechSynthesisMock([SV_VOICE]);
  });

  afterEach(() => {
    speech.uninstall();
  });

  it('makes no speakSwedish call from auto-play when muted, even with autoReadAllForms on', () => {
    writeSettings({ autoReadAllForms: true, muteAudio: true });
    renderWithProviders(
      <VerbDetailsModal verb={SKRIVA} srsStage={0} srsStates={{}} onClose={vi.fn()} />,
    );

    expect(speech.speakCalls).toHaveLength(0);
  });

  it('makes no speakSwedish call when muted and "Pronounce all forms" is clicked, and never renders a Stop control', async () => {
    writeSettings({ muteAudio: true });
    const user = userEvent.setup();
    renderWithProviders(
      <VerbDetailsModal verb={SKRIVA} srsStage={0} srsStates={{}} onClose={vi.fn()} />,
    );

    await user.click(screen.getByRole('button', { name: 'Pronounce all forms' }));

    expect(speech.speakCalls).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Stop pronunciation' })).not.toBeInTheDocument();
  });
});

describe('VerbDetailsModal - "Stop" control while a sequence is speaking (issue #458)', () => {
  let speech: SpeechSynthesisMockHandle;

  beforeEach(() => {
    speech = installSpeechSynthesisMock([SV_VOICE]);
  });

  afterEach(() => {
    speech.uninstall();
  });

  it('shows a "Stop" control while speaking; activating it calls stopSpeaking() and removes the control', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <VerbDetailsModal verb={SKRIVA} srsStage={0} srsStates={{}} onClose={vi.fn()} />,
    );

    await user.click(screen.getByRole('button', { name: 'Pronounce all forms' }));
    await waitFor(() => expect(speech.speakCalls).toHaveLength(1));

    const stopButton = await screen.findByRole('button', { name: 'Stop pronunciation' });
    expect(stopButton).toBeInTheDocument();

    await user.click(stopButton);

    expect(speech.cancelCalls.length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByRole('button', { name: 'Stop pronunciation' })).not.toBeInTheDocument();
  });

  it('removes the "Stop" control when playback ends on its own, distinct from a manual Stop click', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <VerbDetailsModal verb={SKRIVA} srsStage={0} srsStates={{}} onClose={vi.fn()} />,
    );

    await user.click(screen.getByRole('button', { name: 'Pronounce all forms' }));
    await waitFor(() => expect(speech.speakCalls).toHaveLength(1));
    expect(await screen.findByRole('button', { name: 'Stop pronunciation' })).toBeInTheDocument();
    // handlePronounceAll's own unconditional stopSpeaking() (see the
    // "second click" test above) already recorded one no-op cancel call
    // before this point; capture it so the assertion below is about what
    // fireEnd() itself does, not the click that preceded it.
    const cancelCallsBeforeFireEnd = speech.cancelCalls.length;

    // Natural completion (the browser firing the utterance's onend), not a
    // stopSpeaking()/cancel() path — proves the Stop control's removal is
    // wired to speakSwedish's onEnd settle callback in general, not only to
    // the click handler exercised by the test above.
    act(() => {
      speech.speakCalls[0]!.fireEnd();
    });

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Stop pronunciation' })).not.toBeInTheDocument(),
    );
    // fireEnd() settles speakSwedish's onEnd directly; it does not call
    // speechSynthesis.cancel(), so it must not add a further cancel call.
    expect(speech.cancelCalls).toHaveLength(cancelCallsBeforeFireEnd);
  });
});

describe('VerbDetailsModal - no Swedish voice installed (issue #458)', () => {
  let speech: SpeechSynthesisMockHandle;

  beforeEach(() => {
    speech = installSpeechSynthesisMock(NON_SV_VOICES);
  });

  afterEach(() => {
    speech.uninstall();
  });

  it('speaks nothing and leaves no "Stop" control when only non-Swedish voices are installed', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <VerbDetailsModal verb={SKRIVA} srsStage={0} srsStates={{}} onClose={vi.fn()} />,
    );

    await user.click(screen.getByRole('button', { name: 'Pronounce all forms' }));

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Stop pronunciation' })).not.toBeInTheDocument(),
    );
    expect(speech.speakCalls).toHaveLength(0);
  });
});

describe('VerbDetailsModal - closing and unmounting stop any in-progress speech (issue #458)', () => {
  let speech: SpeechSynthesisMockHandle;

  beforeEach(() => {
    speech = installSpeechSynthesisMock([SV_VOICE]);
  });

  afterEach(() => {
    speech.uninstall();
  });

  it('calls stopSpeaking() when the dialog is dismissed via Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithProviders(
      <VerbDetailsModal verb={SKRIVA} srsStage={0} srsStates={{}} onClose={onClose} />,
    );
    await screen.findByRole('dialog');
    expect(speech.cancelCalls).toHaveLength(0);

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(speech.cancelCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('calls stopSpeaking() on unmount', () => {
    const { unmount } = renderWithProviders(
      <VerbDetailsModal verb={SKRIVA} srsStage={0} srsStates={{}} onClose={vi.fn()} />,
    );
    expect(speech.cancelCalls).toHaveLength(0);

    unmount();

    expect(speech.cancelCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('produces no React act/state-after-unmount warning when unmounted while a sequence is still in flight', async () => {
    const loggedErrors: unknown[][] = [];
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      loggedErrors.push(args);
    });

    writeSettings({ autoReadAllForms: true });
    const { unmount } = renderWithProviders(
      <VerbDetailsModal verb={SKRIVA} srsStage={0} srsStates={{}} onClose={vi.fn()} />,
    );
    await waitFor(() => expect(speech.speakCalls).toHaveLength(1));

    unmount();
    // Give any stray async callback (e.g. a late onEnd) a turn to run and,
    // if it were buggy, call setState on the now-unmounted component.
    await new Promise((resolve) => setTimeout(resolve, 0));

    consoleErrorSpy.mockRestore();
    const actWarnings = loggedErrors.filter((args) =>
      /not wrapped in act|update on an unmounted/i.test(String(args[0])),
    );
    expect(actWarnings).toEqual([]);
  });
});
