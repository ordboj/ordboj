import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
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
  type ConjugatedVerb,
  type VerbPattern,
  type Grupp,
} from '@/lib/verbs';
import { speakSwedish } from '@/lib/speech';
import { ConfettiEffect } from './ConfettiEffect';
import { Grade } from '@/lib/srs';

interface PracticeCardProps {
  infinitive: string;
  form: Form;
  mode: 'typing' | 'multiple-choice';
  showExamples: boolean;
  autoplayAudio: boolean;
  muteAudio: boolean;
  onAnswer: (grade: Grade) => void;
}

export function PracticeCard({
  infinitive,
  form,
  mode,
  showExamples,
  autoplayAudio,
  muteAudio,
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
  const [shuffledLetters, setShuffledLetters] = useState<string[]>([]);
  const [options, setOptions] = useState<string[]>([]);

  // Load verb data
  useEffect(() => {
    conjugateVerb(infinitive).then((result) => {
      setConjugated(result);
      const uniqueLetters = [...new Set(result[form].split(''))];
      setShuffledLetters(uniqueLetters.sort(() => Math.random() - 0.5));
    });
    generateVerbPattern(infinitive, form).then(setPattern);
  }, [infinitive, form]);

  const correctAnswer = conjugated?.[form] || '';
  // A verb's conjugated form is only ever '' before data loads, or the
  // literal placeholder for a form that verb doesn't have (modal verbs have
  // no imperativ, etc). Neither is a real answer, so neither may be offered
  // as the correct multiple-choice button.
  const isAnswerAvailable = correctAnswer !== '' && correctAnswer !== '(not available)';
  // Multiple choice with no valid correct answer has nothing to test; fall
  // back to typing mode rather than render a card whose "correct" button is
  // the unavailable-form placeholder.
  const effectiveMode = mode === 'multiple-choice' && !isAnswerAvailable ? 'typing' : mode;
  const exampleSentence = showExamples ? getExampleSentence(infinitive, form) : '';

  // Generate multiple choice options.
  //
  // Distractor policy (learning-designer decision, P14 in
  // docs/learning/2026-08-08-ux-pedagogy-red-lines.md, RED LINE): distractors
  // must come from the target verb's conjugation group or an adjacent group
  // (never cross-group, no exceptions) and, where known, match its CEFR
  // level; they must be the same form as the target; they must never be a
  // correct form of the target verb in a different slot; and an empty or
  // "(not available)" conjugated form is never a valid option. Candidates
  // that don't satisfy the group constraint are excluded before ranking, so
  // if fewer than three qualify the option list degrades to fewer
  // distractors rather than fill the remaining slots cross-group. Candidates
  // are ranked once and the top three taken, so building the option list is
  // a single bounded pass with no unbounded retry loop.
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
          .map((f) => conjugated?.[f])
          .filter((value): value is string => !!value && value !== '(not available)'),
      );

      const seen = new Set<string>([correctAnswer]);
      const candidates = allVerbs
        .filter((v) => v.infinitive !== infinitive)
        .reduce<{ value: string; score: number }[]>((acc, v) => {
          const value = v[form];
          if (!value || value === '(not available)') return acc;
          if (seen.has(value) || targetOwnForms.has(value)) return acc;

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

  const handleSubmit = useCallback((answer: string) => {
    const correct = answer.toLowerCase().trim() === correctAnswer.toLowerCase().trim();
    setIsCorrect(correct);
    setSubmittedAnswer(answer);
    setShowFeedback(true);

    if (correct) {
      setShowConfetti(true);
      if (autoplayAudio) {
        speakSwedish(correctAnswer, muteAudio);
      }
    }
  }, [correctAnswer, autoplayAudio, muteAudio]);

  // Auto-submit when answer is correct
  useEffect(() => {
    if (userAnswer && !showFeedback) {
      const isAnswerCorrect =
        userAnswer.toLowerCase().trim() === correctAnswer.toLowerCase().trim();
      if (isAnswerCorrect) {
        handleSubmit(userAnswer);
      }
    }
  }, [userAnswer, showFeedback, correctAnswer, handleSubmit]);

  const handleHint = () => {
    if (revealedHints.length < correctAnswer.length) {
      // Find indices not yet revealed
      const availableIndices = correctAnswer
        .split('')
        .map((_, index) => index)
        .filter((index) => !revealedHints.includes(index));

      // Pick a random unrevealed index
      const randomIndex = availableIndices[Math.floor(Math.random() * availableIndices.length)];
      setRevealedHints((prev) => [...prev, randomIndex]);
    }
  };

  const getPatternWithHints = () => {
    return pattern.patternParts
      .map((part) => {
        if (part.isMissing) {
          // Show the blank with revealed hints
          return correctAnswer
            .split('')
            .map((letter, index) => {
              if (revealedHints.includes(index)) {
                return letter;
              }
              return '_';
            })
            .join(' ');
        }
        return part.text;
      })
      .join(' – ');
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
    const text = conjugated[formToPronounce];
    if (text && text !== '(not available)') {
      speakSwedish(text, muteAudio);
    }
  };

  const handleLetterClick = (letter: string) => {
    if (!showFeedback) {
      setUserAnswer((prev) => prev + letter);
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
              <h2 className="text-3xl font-bold text-primary tracking-wide">
                {getPatternWithHints()}
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
                    className="text-2xl text-center py-6 caret-transparent"
                    maxLength={60}
                    autoFocus
                  />
                  <div className="flex flex-wrap justify-center gap-2">
                    {shuffledLetters.map((letter, index) => (
                      <Button
                        key={index}
                        onClick={() => handleLetterClick(letter)}
                        variant="outline"
                        className="w-12 h-12 text-xl font-semibold"
                      >
                        {letter}
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
                      {option}
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
                      {mode === 'typing' ? 'You wrote' : 'You chose'}
                    </p>
                    <p className="text-lg font-semibold text-destructive break-words">
                      {submittedAnswer.trim() || '(nothing)'}
                    </p>
                  </div>
                  <span className="text-muted-foreground text-xl shrink-0">→</span>
                  <div className="space-y-1 min-w-0 max-w-full">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Correct</p>
                    <p className="text-lg font-semibold text-success break-words">
                      {correctAnswer}
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                {/* Show full pattern with pronunciation buttons */}
                <div className="bg-muted/20 rounded-lg p-4 space-y-3">
                  <p className="text-sm text-muted-foreground text-center font-medium">
                    Complete pattern:
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {pattern.patternParts.map((part, index) => (
                      <div key={index} className="flex items-center gap-1">
                        <div
                          className={`flex items-center gap-1 px-3 py-2 rounded-lg ${
                            part.isMissing
                              ? 'bg-primary text-primary-foreground font-bold'
                              : 'bg-background'
                          }`}
                        >
                          <span className="text-lg">
                            {part.isMissing ? correctAnswer : part.text}
                          </span>
                          {!part.isMissing && conjugated[part.form] !== '(not available)' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 hover:bg-primary/10"
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
                    ))}
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

                {showExamples && exampleSentence && (
                  <div className="bg-accent/10 rounded-lg p-4">
                    <p className="text-sm text-muted-foreground mb-1">Example:</p>
                    <p className="text-base italic">{exampleSentence}</p>
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
