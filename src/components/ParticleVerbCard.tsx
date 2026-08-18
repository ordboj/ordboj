import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2, XCircle, Volume2 } from 'lucide-react';
import { ConfettiEffect } from './ConfettiEffect';
import type { Grade } from '@/lib/srs';
import type { ParticleSittingCard } from '@/lib/particleQueue';
import {
  selectDiscriminationVariant,
  type DiscriminationOption,
} from '@/lib/discriminationVariant';
import { speakSwedish, stopSpeaking } from '@/lib/speech';
import {
  getAcceptedParticles,
  getAcceptedParticlesDisclosure,
  getAcceptedRecallAnswers,
  getParticleCoreSense,
  getPhraseForms,
  getVerifiedParticleVerbs,
  isAcceptedParticle,
  isAcceptedRecall,
  renderCloze,
  renderLemma,
  selectExample,
} from '@/lib/particleVerbs';

// What onAnswer carries for a discrimination (choice) commit, so the caller
// (PracticeParticles.tsx) can log the presented lures and the tapped one
// without recomputing the option set itself
// (docs/learning/2026-08-12-sentence-completion-distractors.md). Absent
// entirely on a typed cloze/recall answer.
export interface ChoiceCommit {
  // The lure particles presented alongside the target, in no particular
  // order — the answer log's `l` field.
  lures: string[];
  // The lure the learner tapped, or null when they tapped the correct
  // option — the answer log's `p` field.
  tapped: string | null;
}

// Stable empty-set default so a caller that omits `introducedParticles`
// (e.g. an existing test that constructs this card directly) never renders a
// discrimination card by accident — the ineligible fallback is always typed
// cloze.
const EMPTY_INTRODUCED_PARTICLES: ReadonlySet<string> = new Set();

// Same fixed three keys as the conjugation card, in the same order, never
// derived from the answer (red lines P4, P11).
const SWEDISH_SPECIAL_CHARS = ['å', 'ä', 'ö'];

interface ParticleVerbCardProps {
  card: ParticleSittingCard;
  // Drives deterministic frame rotation, so a learner meets an entry's
  // sentences in a stable order rather than a random one.
  repetitions?: number;
  // Particles the learner has already met (docs/learning/2026-08-08-discrimination-exercise.md's
  // "introduced" definition), read from srsStates by the caller. Feeds
  // selectDiscriminationVariant's lure eligibility; omitted entirely means
  // no discrimination card ever renders.
  introducedParticles?: ReadonlySet<string>;
  muteAudio?: boolean;
  // Introduction cards are shown, not tested, so they report no grade.
  onAcknowledge?: () => void;
  onAnswer?: (grade: Grade, choice?: ChoiceCommit) => void;
}

// Renders a phrase with its particle in bold. The particle carries the
// stress in speech and the meaning in the pair, so marking it is the one
// piece of typographic emphasis this card actually needs.
function PhraseWithParticle({ phrase, particle }: { phrase: string; particle: string }) {
  const tokens = phrase.split(' ');
  return (
    <span lang="sv">
      {tokens.map((token, index) => (
        <span key={index}>
          {index > 0 ? ' ' : ''}
          {token.toLowerCase() === particle.toLowerCase() ? <strong>{token}</strong> : token}
        </span>
      ))}
    </span>
  );
}

export function ParticleVerbCard({
  card,
  repetitions = 0,
  introducedParticles = EMPTY_INTRODUCED_PARTICLES,
  muteAudio = false,
  onAcknowledge,
  onAnswer,
}: ParticleVerbCardProps) {
  const { entry, kind } = card;
  const [userAnswer, setUserAnswer] = useState('');
  const [showFeedback, setShowFeedback] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [submittedAnswer, setSubmittedAnswer] = useState('');
  const [showConfetti, setShowConfetti] = useState(false);
  // The lure particle tapped on a discrimination card, or null while nothing
  // has been tapped yet / the target was tapped.
  const [selectedParticle, setSelectedParticle] = useState<string | null>(null);

  const example = useMemo(() => selectExample(entry, repetitions), [entry, repetitions]);
  const cloze = useMemo(() => renderCloze(example), [example]);
  const lemma = renderLemma(entry);
  const coreSense = getParticleCoreSense(entry.particle);
  const phraseForms = getPhraseForms(entry);
  const disclosure = getAcceptedParticlesDisclosure(entry);

  // The discrimination render mode of this cloze (docs/learning/2026-08-12-sentence-completion-distractors.md).
  // null on every recall/introduction card and on any cloze this exact
  // repetitions count does not select for the variant — the caller always
  // falls back to typed cloze in that case, never a reduced-option card.
  const discriminationVariant = useMemo(() => {
    if (kind !== 'cloze') return null;
    return selectDiscriminationVariant(
      {
        reflexive: entry.reflexive,
        acceptedParticles: entry.acceptedParticles,
        excludedParticles: example.excludedParticles,
      },
      repetitions,
      introducedParticles,
    );
  }, [kind, entry.reflexive, entry.acceptedParticles, example, repetitions, introducedParticles]);

  // Every card of a given item starts clean, including when the same
  // component instance is reused for the next card in the sitting.
  useEffect(() => {
    setUserAnswer('');
    setShowFeedback(false);
    setIsCorrect(false);
    setSubmittedAnswer('');
    setShowConfetti(false);
    setSelectedParticle(null);
    stopSpeaking();
  }, [card.itemId, kind, entry.id]);

  // Belt-and-braces: cancel any in-progress "pronounce corrected sentence"
  // speech if the card unmounts outright rather than advancing through the
  // Next Card button.
  useEffect(() => {
    return () => stopSpeaking();
  }, []);

  const accepted = useMemo(
    () => (kind === 'recall' ? getAcceptedRecallAnswers(entry) : getAcceptedParticles(entry)),
    [entry, kind],
  );

  // Gloss of the wrong phrase the learner tapped, shown only when a verified
  // entry in the corpus actually carries that base+particle lemma (feedback
  // point 3 of the ruling). No new authoring, no new field: a lookup, and
  // nothing when no such entry exists.
  const chosenLureEntry = useMemo(() => {
    if (!discriminationVariant || isCorrect || selectedParticle === null) return null;
    return (
      getVerifiedParticleVerbs().find(
        (candidate) =>
          candidate.baseInfinitive === entry.baseInfinitive &&
          candidate.particle === selectedParticle,
      ) ?? null
    );
  }, [discriminationVariant, isCorrect, selectedParticle, entry.baseInfinitive]);

  const handleSubmit = useCallback(
    (answer: string) => {
      const correct =
        kind === 'recall' ? isAcceptedRecall(entry, answer) : isAcceptedParticle(entry, answer);
      setIsCorrect(correct);
      setSubmittedAnswer(answer);
      setShowFeedback(true);
      if (correct) setShowConfetti(true);
      // No audio. Web Speech cannot be trusted to put the stress on the
      // particle, and a construction stressed on the verb is not a particle
      // verb at all — hälsa PÅ (visit) against hälsa på (greet). Wrong
      // prosody teaches wrong Swedish, so there is no pronounce affordance
      // here at all until a linguist has signed off on real TTS output.
    },
    [entry, kind],
  );

  // Discrimination card: the first tap commits, full stop — no re-tap, no
  // retry (P1, P3, P5 of docs/learning/2026-08-08-ux-pedagogy-red-lines.md).
  // Once showFeedback is true the option buttons are unmounted (replaced by
  // the static result list below), so this guard only matters against a
  // double-fire of the same tap.
  const handleChoice = useCallback(
    (option: DiscriminationOption) => {
      if (showFeedback) return;
      setSelectedParticle(option.particle);
      setIsCorrect(option.correct);
      setSubmittedAnswer(`${entry.baseInfinitive} ${option.particle}`);
      setShowFeedback(true);
      if (option.correct) setShowConfetti(true);
    },
    [showFeedback, entry.baseInfinitive],
  );

  // Auto-submit on an exact match, suppressed while the typed value is a
  // strict prefix of some *other* accepted answer (product policy P4). A
  // learner who means the shorter answer submits deliberately.
  useEffect(() => {
    if (!userAnswer || showFeedback || kind === 'introduction') return;
    const normalized = userAnswer.trim().toLowerCase();
    const normalizedAccepted = accepted.map((value) => value.trim().toLowerCase());
    const matchIndex = normalizedAccepted.indexOf(normalized);
    if (matchIndex === -1) return;
    const isPrefixOfAnother = normalizedAccepted.some(
      (candidate, index) =>
        index !== matchIndex &&
        candidate.length > normalized.length &&
        candidate.startsWith(normalized),
    );
    if (isPrefixOfAnother) return;
    handleSubmit(userAnswer);
  }, [userAnswer, showFeedback, accepted, kind, handleSubmit]);

  const referenceLine = phraseForms && (
    <div className="bg-muted/20 rounded-lg p-4 space-y-2">
      <p className="text-xs text-muted-foreground text-center uppercase tracking-wide">
        For reference — not tested
      </p>
      <p className="text-center text-base">
        {[phraseForms.infinitive, phraseForms.presens, phraseForms.preteritum, phraseForms.supinum]
          .filter(Boolean)
          .map((form, index) => (
            <span key={index}>
              {index > 0 ? <span className="text-muted-foreground"> – </span> : null}
              <PhraseWithParticle phrase={form} particle={entry.particle} />
            </span>
          ))}
      </p>
    </div>
  );

  const senseLine = coreSense && (
    <p className="text-sm text-muted-foreground text-center">
      <span lang="sv" className="font-semibold">
        {entry.particle}
      </span>{' '}
      — {coreSense}
    </p>
  );

  const contrastLine = entry.contrast && (
    <p className="text-sm text-muted-foreground text-center italic">
      Not to be confused with: <span lang="sv">{entry.contrast}</span>
    </p>
  );

  // ---- Introduction: shown, never graded ---------------------------------
  if (kind === 'introduction') {
    return (
      <Card className="w-full max-w-2xl shadow-xl">
        <CardContent className="p-8 space-y-6">
          <div className="text-center space-y-3">
            <p className="text-muted-foreground text-sm font-medium">A new particle verb</p>
            <h2 className="text-4xl font-bold text-primary tracking-wide">
              <PhraseWithParticle phrase={lemma} particle={entry.particle} />
            </h2>
            <p className="text-lg">{entry.gloss.en}</p>
          </div>

          <div className="bg-muted/30 rounded-lg p-6 space-y-2">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">In use</p>
            {entry.examples.map((item, index) => (
              <p key={index} className="text-base" lang="sv">
                <PhraseWithParticle phrase={item.sv} particle={entry.particle} />
              </p>
            ))}
          </div>

          {senseLine}
          {contrastLine}
          {referenceLine}

          <Button onClick={onAcknowledge} className="w-full py-6 text-lg">
            Got it
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ---- Cloze and recall --------------------------------------------------
  const prompt =
    kind === 'cloze' ? (
      <div className="bg-muted/30 rounded-lg p-6 space-y-3">
        <h2 className="text-2xl font-bold text-primary tracking-wide leading-relaxed" lang="sv">
          {cloze.before.join(' ')}{' '}
          <span
            className="inline-block min-w-16 border-b-4 border-primary align-bottom"
            aria-label="missing particle"
          >
            {showFeedback ? <strong>{cloze.answer}</strong> : ''}
          </span>{' '}
          {cloze.after.join(' ')}
        </h2>
        <p className="text-sm text-muted-foreground">{entry.gloss.en}</p>
      </div>
    ) : (
      <div className="bg-muted/30 rounded-lg p-6 space-y-2">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">
          Write the Swedish particle verb
        </p>
        <h2 className="text-2xl font-bold text-primary">{entry.gloss.en}</h2>
      </div>
    );

  return (
    <>
      <ConfettiEffect trigger={showConfetti} />
      <Card className="w-full max-w-2xl shadow-xl">
        <CardContent className="p-8 space-y-6">
          <div className="text-center space-y-3">
            <p className="text-muted-foreground text-sm font-medium">
              {kind !== 'cloze'
                ? 'Produce the whole phrase'
                : discriminationVariant
                  ? 'Choose the correct particle verb'
                  : 'Fill in the missing particle'}
            </p>
            {prompt}
          </div>

          {!showFeedback && discriminationVariant && (
            // First tap commits — no re-tap, no retry
            // (docs/learning/2026-08-12-sentence-completion-distractors.md,
            // "Feedback", point 1).
            <div className="space-y-3" role="group" aria-label="Choose the particle verb">
              {discriminationVariant.options.map((option) => (
                <Button
                  key={option.particle}
                  onClick={() => handleChoice(option)}
                  variant="outline"
                  className="w-full py-6 text-lg justify-center"
                  lang="sv"
                >
                  {entry.baseInfinitive} {option.particle}
                </Button>
              ))}
            </div>
          )}

          {!showFeedback && !discriminationVariant && (
            <div className="space-y-4">
              <Input
                value={userAnswer}
                onChange={(e) => setUserAnswer(e.target.value)}
                onKeyDown={(e) =>
                  e.key === 'Enter' && userAnswer.trim() && handleSubmit(userAnswer)
                }
                placeholder={kind === 'cloze' ? 'Type the particle...' : 'Type the phrase...'}
                className="text-2xl text-center py-6"
                maxLength={60}
                autoFocus
                lang="sv"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                aria-label={kind === 'cloze' ? 'Particle' : 'Particle verb'}
              />
              <div className="flex flex-wrap justify-center gap-2">
                {SWEDISH_SPECIAL_CHARS.map((char) => (
                  <Button
                    key={char}
                    onClick={() => setUserAnswer((prev) => prev + char)}
                    variant="outline"
                    className="w-12 h-12 text-xl font-semibold"
                  >
                    <span lang="sv">{char}</span>
                  </Button>
                ))}
                <Button
                  onClick={() => setUserAnswer((prev) => prev.slice(0, -1))}
                  variant="outline"
                  className="w-12 h-12 text-xl"
                  disabled={!userAnswer}
                  aria-label="Delete last character"
                >
                  ⌫
                </Button>
              </div>
              <Button
                onClick={() => handleSubmit(userAnswer)}
                className="w-full py-6 text-lg"
                disabled={!userAnswer.trim()}
              >
                Check Answer
              </Button>
            </div>
          )}

          {showFeedback && (
            <div className="space-y-4">
              <div
                className={`flex items-center justify-center gap-3 p-4 rounded-lg ${
                  isCorrect ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'
                }`}
              >
                {isCorrect ? (
                  <>
                    <CheckCircle2 className="w-8 h-8" />
                    <span className="text-2xl font-bold">Correct!</span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-8 h-8" />
                    <span className="text-2xl font-bold">Not quite</span>
                  </>
                )}
              </div>

              {discriminationVariant && (
                // The tapped option marked wrong and muted, the target
                // marked correct — never at equal weight (P21 of
                // docs/learning/2026-08-08-ux-pedagogy-red-lines.md).
                <div className="space-y-2">
                  {discriminationVariant.options.map((option) => {
                    const wasTapped = option.particle === selectedParticle;
                    const stateClasses = option.correct
                      ? 'border-success text-success bg-success/10'
                      : wasTapped
                        ? 'border-destructive text-destructive bg-destructive/10'
                        : 'border-muted text-muted-foreground opacity-60';
                    return (
                      <div
                        key={option.particle}
                        className={`rounded-lg border px-4 py-3 text-center text-lg font-semibold ${stateClasses}`}
                        lang="sv"
                      >
                        {entry.baseInfinitive} {option.particle}
                      </div>
                    );
                  })}
                </div>
              )}

              {!isCorrect && !discriminationVariant && (
                <div className="flex flex-wrap items-center justify-center gap-4 text-center">
                  <div className="space-y-1 min-w-0 max-w-full">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">
                      You wrote
                    </p>
                    <p className="text-lg font-semibold text-destructive break-words">
                      {submittedAnswer.trim() || '(nothing)'}
                    </p>
                  </div>
                  <span className="text-muted-foreground text-xl shrink-0">→</span>
                  <div className="space-y-1 min-w-0 max-w-full">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Correct</p>
                    <p className="text-lg font-semibold text-success break-words" lang="sv">
                      {accepted[0]}
                    </p>
                  </div>
                </div>
              )}

              {/* The chosen-lure gloss, feedback point 3 of
                  docs/learning/2026-08-12-sentence-completion-distractors.md:
                  only when a verified entry actually carries that lemma. */}
              {chosenLureEntry && (
                <p className="text-sm text-muted-foreground text-center">
                  <span lang="sv" className="font-semibold">
                    {renderLemma(chosenLureEntry)}
                  </span>{' '}
                  — {chosenLureEntry.gloss.en}
                </p>
              )}

              {/* Names the whole accepted set rather than only the
                  alternates, so a learner who typed one of them is not shown
                  their own answer as though it were a correction (P6). */}
              {kind === 'cloze' && disclosure && (
                <p className="text-sm text-muted-foreground text-center">{disclosure}</p>
              )}

              <div className="bg-muted/30 rounded-lg p-4 space-y-2 text-center">
                <p className="text-2xl font-bold text-primary">
                  <PhraseWithParticle phrase={lemma} particle={entry.particle} />
                </p>
                <p className="text-sm text-muted-foreground">{entry.gloss.en}</p>
                <p className="text-base" lang="sv">
                  <PhraseWithParticle phrase={example.sv} particle={entry.particle} />
                </p>
                {discriminationVariant && (
                  // Audio speaks the corrected sentence only — no pronounce
                  // control on any wrong option (feedback point 5). The
                  // isolated-particle stress risk the typed cloze's comment
                  // above describes does not apply to a full sentence, which
                  // is why this control exists here and nowhere else on this
                  // card.
                  <Button
                    onClick={() => speakSwedish(example.sv, muteAudio)}
                    variant="outline"
                    size="sm"
                    className="gap-2 min-h-11"
                  >
                    <Volume2 className="w-4 h-4" />
                    Pronounce sentence
                  </Button>
                )}
              </div>

              {senseLine}
              {contrastLine}
              {referenceLine}

              <Button
                onClick={() => {
                  stopSpeaking();
                  const choice: ChoiceCommit | undefined = discriminationVariant
                    ? {
                        lures: discriminationVariant.options
                          .filter((option) => !option.correct)
                          .map((option) => option.particle),
                        tapped: isCorrect ? null : selectedParticle,
                      }
                    : undefined;
                  onAnswer?.(isCorrect ? 5 : 0, choice);
                }}
                className="w-full py-6 text-lg"
              >
                Next Card
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
