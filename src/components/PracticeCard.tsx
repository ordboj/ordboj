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
  getAcceptedAnswers,
  getAlternatesDisclosure,
  isAcceptedAnswer,
  type ConjugatedVerb,
  type VerbPattern,
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
  const exampleSentence = showExamples ? getExampleSentence(infinitive, form) : '';
  const alternatesDisclosure = getAlternatesDisclosure(infinitive, form);

  // Generate multiple choice options

  useEffect(() => {
    const generateOptions = async () => {
      const opts = [correctAnswer];
      const allVerbs = ['vara', 'ha', 'gå', 'komma', 'skriva', 'läsa', 'säga', 'få'];
      // Product policy P7: reject a distractor whose normalized value is
      // accepted for THIS card at all (primary or alternate), not just a
      // distractor that repeats a value already drawn — otherwise a
      // documented alternate (e.g. "lade") could render as a second correct
      // button alongside the primary ("la").
      const acceptedForCard = getAcceptedAnswers(infinitive, form).map((accepted) =>
        accepted.trim().toLowerCase(),
      );

      while (opts.length < 4) {
        const randomVerb = allVerbs[Math.floor(Math.random() * allVerbs.length)];
        const randomConjugation = await conjugateVerb(randomVerb);
        const conjugatedForm = randomConjugation[form];
        const normalizedCandidate = conjugatedForm.trim().toLowerCase();
        const alreadyDrawn = opts.some(
          (option) => option.trim().toLowerCase() === normalizedCandidate,
        );
        if (!alreadyDrawn && !acceptedForCard.includes(normalizedCandidate)) {
          opts.push(conjugatedForm);
        }
      }

      setOptions(opts.sort(() => Math.random() - 0.5));
    };

    if (correctAnswer) {
      generateOptions();
    }
  }, [correctAnswer, form, infinitive]);

  // Stable reference: referenced by the auto-submit effect below, which
  // needs it in its dependency array to satisfy exhaustive-deps.
  const handleSubmit = useCallback(
    (answer: string) => {
      const correct = isAcceptedAnswer(infinitive, form, answer);
      setIsCorrect(correct);
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

  // Auto-submit when the typed value matches an accepted answer — except
  // product policy P4: suppress it while the normalized typed value is a
  // strict prefix of another accepted answer for this card. The shipped data
  // stores the short form as primary ("la", "sa"), so this can't be written
  // as "primary waits, alternate fires" — it has to check the whole accepted
  // set both ways. A learner who means the shorter form submits deliberately
  // with Check Answer or Enter.
  useEffect(() => {
    if (!userAnswer || showFeedback) return;

    const normalized = userAnswer.trim().toLowerCase();
    const normalizedAccepted = getAcceptedAnswers(infinitive, form).map((accepted) =>
      accepted.trim().toLowerCase(),
    );
    const matchIndex = normalizedAccepted.indexOf(normalized);
    if (matchIndex === -1) return;

    const isPrefixOfAnotherAccepted = normalizedAccepted.some(
      (candidate, index) =>
        index !== matchIndex &&
        candidate.length > normalized.length &&
        candidate.startsWith(normalized),
    );
    if (isPrefixOfAnotherAccepted) return;

    handleSubmit(userAnswer);
  }, [userAnswer, showFeedback, infinitive, form, handleSubmit]);

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
              {mode === 'typing' ? (
                <div className="space-y-4">
                  <Input
                    value={userAnswer}
                    onChange={(e) => setUserAnswer(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === 'Enter' && userAnswer.trim() && handleSubmit(userAnswer)
                    }
                    placeholder="Type your answer..."
                    className="text-2xl text-center py-6 caret-transparent"
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

              {alternatesDisclosure && (
                <p className="text-sm text-muted-foreground text-center">{alternatesDisclosure}</p>
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
