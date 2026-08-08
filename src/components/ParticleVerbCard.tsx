import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2, XCircle } from 'lucide-react';
import { ConfettiEffect } from './ConfettiEffect';
import type { Grade } from '@/lib/srs';
import type { ParticleSittingCard } from '@/lib/particleQueue';
import {
  getAcceptedParticles,
  getAcceptedParticlesDisclosure,
  getAcceptedRecallAnswers,
  getParticleCoreSense,
  getPhraseForms,
  isAcceptedParticle,
  isAcceptedRecall,
  renderCloze,
  renderLemma,
  selectExample,
} from '@/lib/particleVerbs';

// Same fixed three keys as the conjugation card, in the same order, never
// derived from the answer (red lines P4, P11).
const SWEDISH_SPECIAL_CHARS = ['å', 'ä', 'ö'];

interface ParticleVerbCardProps {
  card: ParticleSittingCard;
  // Drives deterministic frame rotation, so a learner meets an entry's
  // sentences in a stable order rather than a random one.
  repetitions?: number;
  // Introduction cards are shown, not tested, so they report no grade.
  onAcknowledge?: () => void;
  onAnswer?: (grade: Grade) => void;
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
  onAcknowledge,
  onAnswer,
}: ParticleVerbCardProps) {
  const { entry, kind } = card;
  const [userAnswer, setUserAnswer] = useState('');
  const [showFeedback, setShowFeedback] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [submittedAnswer, setSubmittedAnswer] = useState('');
  const [showConfetti, setShowConfetti] = useState(false);

  const example = useMemo(() => selectExample(entry, repetitions), [entry, repetitions]);
  const cloze = useMemo(() => renderCloze(example), [example]);
  const lemma = renderLemma(entry);
  const coreSense = getParticleCoreSense(entry.particle);
  const phraseForms = getPhraseForms(entry);
  const disclosure = getAcceptedParticlesDisclosure(entry);

  // Every card of a given item starts clean, including when the same
  // component instance is reused for the next card in the sitting.
  useEffect(() => {
    setUserAnswer('');
    setShowFeedback(false);
    setIsCorrect(false);
    setSubmittedAnswer('');
    setShowConfetti(false);
  }, [card.itemId, kind, entry.id]);

  const accepted = useMemo(
    () => (kind === 'recall' ? getAcceptedRecallAnswers(entry) : getAcceptedParticles(entry)),
    [entry, kind],
  );

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
              {kind === 'cloze' ? 'Fill in the missing particle' : 'Produce the whole phrase'}
            </p>
            {prompt}
          </div>

          {!showFeedback && (
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

              {!isCorrect && (
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
              </div>

              {senseLine}
              {contrastLine}
              {referenceLine}

              <Button onClick={() => onAnswer?.(isCorrect ? 5 : 0)} className="w-full py-6 text-lg">
                Next Card
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
