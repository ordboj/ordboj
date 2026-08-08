import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Volume2, CheckCircle2, XCircle } from 'lucide-react';
import {
  conjugateVerb,
  Form,
  getExampleSentence,
  generateVerbPattern,
  getFormLabel,
  getFormHint,
  getAllConjugatedVerbs,
  getVerbGrupp,
  getAcceptedAnswers,
  getAlternatesDisclosure,
  isAcceptedAnswer,
  type ConjugatedVerb,
  type VerbPattern,
  type Grupp,
} from '@/lib/verbs';
import { speakSwedish } from '@/lib/speech';
import { ConfettiEffect } from './ConfettiEffect';
import { Grade } from '@/lib/srs';

// Fixed Swedish special-character row: always these three keys, in this
// order, on every card regardless of the answer. Never derived from the
// correct answer — see docs/learning/2026-08-08-ux-pedagogy-red-lines.md (P4, P11).
const SWEDISH_SPECIAL_CHARS = ['å', 'ä', 'ö'];

// verbs.ts (swedish-linguist, #124) falls back to this literal string when a
// form has no value. ConjugatedVerb.imperativNotApplicable now flags the
// common, semantically-typed case (modal verbs, which grammatically lack an
// imperativ) explicitly, and is checked first below. The string comparison
// stays as a fallback: a couple of verbs (e.g. "te sig", "anse" in
// verbData.ts) have an intentionally empty imperativ pending human review
// and are deliberately NOT flagged imperativNotApplicable -- that field
// means "grammatically confirmed absent," not "unconfirmed," so relying on
// it alone would let their raw placeholder leak into the UI (as a
// multiple-choice distractor, a pronounce button, etc). This fallback can
// go away once swedish-linguist fills those forms or adds a field for
// "known empty, not yet confirmed why."
const UNAVAILABLE_FORM_SENTINEL = '(not available)';

function isFormUnavailable(
  form: Form,
  value: string | undefined,
  imperativNotApplicable: boolean | undefined,
): boolean {
  if (form === 'imperativ' && imperativNotApplicable) return true;
  return !value || value === UNAVAILABLE_FORM_SENTINEL;
}

interface PracticeCardProps {
  infinitive: string;
  form: Form;
  mode: 'typing' | 'multiple-choice';
  showExamples: boolean;
  autoplayAudio: boolean;
  muteAudio: boolean;
  // Whether, if this card is answered wrong, the item is still eligible to
  // re-queue into the same sitting (docs/learning/lapse-handling.md). Drives
  // the "you'll see this again" feedback copy; the re-queue decision itself
  // is made by the caller (Practice.tsx).
  willRequeueIfWrong?: boolean;
  // Accepted but currently unused: #32's maturity-fade cue (showing less of
  // the sibling-form pattern as an item matures) applied to the recall
  // screen, which P2 (docs/learning/2026-08-08-ux-pedagogy-red-lines.md,
  // RED LINE) forbids outright regardless of maturity -- the recall screen
  // may show the infinitive and form label only, never other conjugated
  // forms. Left in the prop contract rather than removed from Practice.tsx
  // pending a decision on whether #32 gets a non-recall-screen home.
  repetitions?: number;
  onAnswer: (grade: Grade) => void;
}

export function PracticeCard({
  infinitive,
  form,
  mode,
  showExamples,
  autoplayAudio,
  muteAudio,
  willRequeueIfWrong = false,
  repetitions = 0,
  onAnswer,
}: PracticeCardProps) {
  const [userAnswer, setUserAnswer] = useState('');
  const [showFeedback, setShowFeedback] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [submittedAnswer, setSubmittedAnswer] = useState('');
  const [showConfetti, setShowConfetti] = useState(false);
  const [revealedHints, setRevealedHints] = useState<number[]>([]);
  const [conjugated, setConjugated] = useState<ConjugatedVerb | null>(null);
  const [pattern, setPattern] = useState<VerbPattern | null>(null);
  const [options, setOptions] = useState<string[]>([]);

  // Load verb data
  useEffect(() => {
    conjugateVerb(infinitive).then(setConjugated);
    generateVerbPattern(infinitive, form).then(setPattern);
  }, [infinitive, form]);

  const correctAnswer = conjugated?.[form] || '';
  // A verb's conjugated form is only ever '' before data loads, or the
  // imperativ of a verb that grammatically doesn't have one (modal verbs,
  // per ConjugatedVerb.imperativNotApplicable, #124) or hasn't been
  // confirmed yet (see isFormUnavailable above). Neither is a real answer,
  // so neither may be offered as the correct multiple-choice button.
  const isAnswerAvailable = !isFormUnavailable(
    form,
    correctAnswer,
    conjugated?.imperativNotApplicable,
  );
  // Multiple choice with no valid correct answer has nothing to test; fall
  // back to typing mode rather than render a card whose "correct" button is
  // the unavailable-form placeholder.
  const effectiveMode = mode === 'multiple-choice' && !isAnswerAvailable ? 'typing' : mode;
  const exampleSentence = showExamples ? getExampleSentence(infinitive, form) : '';
  const alternatesDisclosure = getAlternatesDisclosure(infinitive, form);
  // Only ever read here for the post-answer feedback chip below — grupp
  // predicts the answer's ending pattern, so it must never be rendered
  // before the learner has submitted (RED LINE, see issue #228). undefined
  // renders as absent, never guessed (src/lib/verbs.ts:29-32).
  const grupp = getVerbGrupp(infinitive);

  // Generate multiple choice options.
  //
  // Distractor policy (learning-designer decision, P14 in
  // docs/learning/2026-08-08-ux-pedagogy-red-lines.md, RED LINE): distractors
  // must come from the target verb's conjugation group or an adjacent group
  // (never cross-group, no exceptions) and, where known, match its CEFR
  // level; they must be the same form as the target; they must never be a
  // correct form of the target verb in a different slot; and an empty
  // conjugated form, or an imperativ a verb grammatically doesn't have
  // (ConjugatedVerb.imperativNotApplicable, #124), is never a valid option. Candidates
  // that don't satisfy the group constraint are excluded before ranking, so
  // if fewer than three qualify the option list degrades to fewer
  // distractors rather than fill the remaining slots cross-group. Candidates
  // are ranked once and the top three taken, so building the option list is
  // a single bounded pass with no unbounded retry loop.
  //
  // Product policy P7 (docs/product/2026-08-08-alternate-answers-decision.md):
  // a candidate is also rejected when it is anywhere in the card's accepted
  // set (primary or alternate) -- otherwise a documented alternate (e.g.
  // "lade") could render as a second correct button alongside the primary.
  useEffect(() => {
    const generateOptions = async () => {
      const allVerbs = await getAllConjugatedVerbs();
      const targetGrupp = getVerbGrupp(infinitive);
      const adjacentGrupp: Partial<Record<Grupp, Grupp[]>> = {
        '2a': ['2b'],
        '2b': ['2a'],
      };

      const targetOwnForms = new Set(
        (['infinitive', 'presens', 'preteritum', 'supinum', 'imperativ'] as Form[])
          .filter((f) => !isFormUnavailable(f, conjugated?.[f], conjugated?.imperativNotApplicable))
          .map((f) => conjugated?.[f])
          .filter((value): value is string => !!value),
      );
      const acceptedForCard = new Set(
        getAcceptedAnswers(infinitive, form).map((accepted) => accepted.trim().toLowerCase()),
      );

      const seen = new Set<string>([correctAnswer]);
      const candidates = allVerbs
        .filter((v) => v.infinitive !== infinitive)
        .reduce<{ value: string; score: number }[]>((acc, v) => {
          const value = v[form];
          if (isFormUnavailable(form, value, v.imperativNotApplicable)) return acc;
          if (seen.has(value) || targetOwnForms.has(value)) return acc;
          if (acceptedForCard.has(value.trim().toLowerCase())) return acc;

          const vGrupp = getVerbGrupp(v.infinitive);
          const isSameGroup = targetGrupp !== undefined && vGrupp === targetGrupp;
          const isAdjacentGroup =
            targetGrupp !== undefined &&
            vGrupp !== undefined &&
            (adjacentGrupp[targetGrupp]?.includes(vGrupp) ?? false);
          // P14 hard constraint: same or adjacent group only, never cross-group.
          if (!isSameGroup && !isAdjacentGroup) return acc;

          seen.add(value);
          let score = isSameGroup ? 20 : 10;
          if (conjugated?.cefr && v.cefr === conjugated.cefr) {
            score += 1;
          }
          acc.push({ value, score });
          return acc;
        }, []);

      const distractors = candidates
        .sort(() => Math.random() - 0.5)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map((c) => c.value);

      setOptions([correctAnswer, ...distractors].sort(() => Math.random() - 0.5));
    };

    if (isAnswerAvailable && conjugated) {
      generateOptions();
    }
  }, [correctAnswer, isAnswerAvailable, form, infinitive, conjugated]);

  const handleSubmit = useCallback(
    (answer: string) => {
      const correct = isAcceptedAnswer(infinitive, form, answer);
      setIsCorrect(correct);
      setSubmittedAnswer(answer);
      setShowFeedback(true);

      if (correct) {
        setShowConfetti(true);
        if (autoplayAudio) {
          speakSwedish(correctAnswer, muteAudio);
        }
      }
    },
    [infinitive, form, correctAnswer, autoplayAudio, muteAudio],
  );

  // No auto-submit here: grading is a deliberate act (Check Answer, or
  // Enter, gated on non-empty input below) per ticket #91 -- typing the
  // exact correct answer must never grade the card by itself. This also
  // makes #198's P4 prefix-vs-alternate concern moot: with nothing
  // auto-submitting on a keystroke, there is no risk of grading "la" before
  // the learner finishes typing "lade".

  const handleHint = () => {
    if (revealedHints.length < correctAnswer.length) {
      // Find indices not yet revealed
      const availableIndices = correctAnswer
        .split('')
        .map((_, index) => index)
        .filter((index) => !revealedHints.includes(index));

      // Pick a random unrevealed index
      const randomIndex = availableIndices[Math.floor(Math.random() * availableIndices.length)];
      if (randomIndex === undefined) return;
      setRevealedHints((prev) => [...prev, randomIndex]);
    }
  };

  const handleDelete = () => {
    setUserAnswer((prev) => prev.slice(0, -1));
  };

  const handleNext = () => {
    // Calculate grade based on correctness
    const grade: Grade = isCorrect ? 5 : 0;
    onAnswer(grade);
  };

  const handlePronounce = () => {
    speakSwedish(correctAnswer, muteAudio);
  };

  useEffect(() => {
    setUserAnswer('');
    setShowFeedback(false);
    setIsCorrect(false);
    setSubmittedAnswer('');
    setShowConfetti(false);
    setRevealedHints([]);
    setOptions([]);
  }, [infinitive, form]);

  const handlePronounceForm = (formToPronounce: Form) => {
    if (!conjugated) return;
    const text = conjugated[formToPronounce];
    if (!isFormUnavailable(formToPronounce, text, conjugated.imperativNotApplicable)) {
      speakSwedish(text, muteAudio);
    }
  };

  const handleSpecialCharClick = (char: string) => {
    if (!showFeedback) {
      setUserAnswer((prev) => prev + char);
    }
  };

  if (!conjugated || !pattern) {
    return (
      <Card className="w-full max-w-2xl shadow-xl">
        <CardContent className="p-8 flex items-center justify-center">
          <p className="text-muted-foreground">Loading...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <ConfettiEffect trigger={showConfetti} />
      <Card className="w-full max-w-2xl shadow-xl">
        <CardContent className="p-8 space-y-6">
          {/* Question */}
          <div className="text-center space-y-3">
            <p className="text-muted-foreground text-sm font-medium">Fill in the missing form</p>
            <div className="bg-muted/30 rounded-lg p-6 space-y-2">
              <h2 className="text-3xl font-bold text-primary tracking-wide" lang="sv">
                {infinitive}
              </h2>
              <p className="text-sm text-muted-foreground">
                Missing: <span className="font-semibold">{getFormLabel(form)}</span>
              </p>
              <p className="text-xs text-muted-foreground italic">{getFormHint(form)}</p>
            </div>
          </div>

          {/* Input Area */}
          {!showFeedback && (
            <div className="space-y-4">
              {effectiveMode === 'typing' ? (
                <div className="space-y-4">
                  <Input
                    value={userAnswer}
                    onChange={(e) => setUserAnswer(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === 'Enter' && userAnswer.trim() && handleSubmit(userAnswer)
                    }
                    placeholder="Type your answer..."
                    className="text-2xl text-center py-6"
                    maxLength={60}
                    autoFocus
                    lang="sv"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    enterKeyHint="go"
                  />
                  <div className="flex flex-wrap justify-center gap-2">
                    {SWEDISH_SPECIAL_CHARS.map((char) => (
                      <Button
                        key={char}
                        onClick={() => handleSpecialCharClick(char)}
                        variant="outline"
                        className="w-12 h-12 text-xl font-semibold"
                      >
                        <span lang="sv">{char}</span>
                      </Button>
                    ))}
                    <Button
                      onClick={handleDelete}
                      variant="outline"
                      className="w-12 h-12 text-xl"
                      disabled={!userAnswer}
                    >
                      ⌫
                    </Button>
                  </div>
                  <div className="flex gap-3">
                    <Button
                      onClick={handleHint}
                      variant="outline"
                      className="flex-1 py-6 text-lg"
                      disabled={revealedHints.length >= correctAnswer.length}
                    >
                      💡 Hint
                    </Button>
                    <Button
                      onClick={() => handleSubmit(userAnswer)}
                      className="flex-1 py-6 text-lg"
                      disabled={!userAnswer.trim()}
                    >
                      Check Answer
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {options.map((option, index) => (
                    <Button
                      key={index}
                      onClick={() => handleSubmit(option)}
                      variant="outline"
                      className="py-6 text-xl"
                    >
                      <span lang="sv">{option}</span>
                    </Button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Feedback */}
          {showFeedback && (
            <div className="space-y-4">
              <div
                role="status"
                aria-live="polite"
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

              {grupp && (
                <div className="flex justify-center">
                  <Badge variant="outline">grupp {grupp}</Badge>
                </div>
              )}

              {alternatesDisclosure && (
                <p className="text-sm text-muted-foreground text-center">{alternatesDisclosure}</p>
              )}

              {!isCorrect && willRequeueIfWrong && (
                <p className="text-sm text-muted-foreground text-center">
                  You'll see this one again later in today's session — one more correct answer and
                  it's done.
                </p>
              )}

              <div className="space-y-4">
                {/* Show full pattern with pronunciation buttons */}
                <div className="bg-muted/20 rounded-lg p-4 space-y-3">
                  <p className="text-sm text-muted-foreground text-center font-medium">
                    Complete pattern:
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {pattern.patternParts.map((part, index) => {
                      const displayText = part.isMissing ? correctAnswer : part.text;
                      const isPartUnavailable = isFormUnavailable(
                        part.form,
                        conjugated[part.form],
                        conjugated.imperativNotApplicable,
                      );
                      return (
                        <div key={index} className="flex items-center gap-1">
                          <div
                            className={`flex items-center gap-1 px-3 py-2 rounded-lg ${
                              part.isMissing
                                ? 'bg-primary text-primary-foreground font-bold'
                                : 'bg-background'
                            }`}
                          >
                            <span className="text-lg" lang={isPartUnavailable ? undefined : 'sv'}>
                              {displayText}
                            </span>
                            {!part.isMissing && !isPartUnavailable && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-11 w-11 hover:bg-primary/10"
                                aria-label={`Pronounce ${getFormLabel(part.form)}`}
                                onClick={() => handlePronounceForm(part.form)}
                              >
                                <Volume2 className="w-3 h-3" />
                              </Button>
                            )}
                          </div>
                          {index < pattern.patternParts.length - 1 && (
                            <span className="text-muted-foreground">–</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePronounce}
                    className="w-full gap-2"
                  >
                    <Volume2 className="w-4 h-4" />
                    Pronounce answer
                  </Button>
                </div>

                {/* Learner's own wrong answer: muted, struck through, subordinate to the
                    correct form above (P21) -- never rendered at equal weight beside it,
                    and never spoken. Hidden when the submission was empty or hints already
                    gave away the answer -- there is no error to show there. */}
                {!isCorrect &&
                  submittedAnswer.trim() !== '' &&
                  revealedHints.length < correctAnswer.length && (
                    <p className="text-xs text-muted-foreground text-center">
                      {mode === 'typing' ? 'You typed' : 'You chose'}:{' '}
                      <span className="line-through opacity-60">{submittedAnswer}</span>
                    </p>
                  )}

                {showExamples && exampleSentence && (
                  <div className="bg-accent/10 rounded-lg p-4">
                    <p className="text-sm text-muted-foreground mb-1">Example:</p>
                    <p className="text-base italic" lang="sv">
                      {exampleSentence}
                    </p>
                  </div>
                )}
              </div>

              <Button onClick={handleNext} className="w-full py-6 text-lg">
                Next Card
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
