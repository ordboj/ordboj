import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft } from 'lucide-react';
import { ParticleVerbCard } from '@/components/ParticleVerbCard';
import { ReadOnlyBanner } from '@/components/ReadOnlyBanner';
import { useSrsProgress } from '@/hooks/useSrsProgress';
import { useSettings } from '@/hooks/useSettings';
import { buildFreeParticlePractice, type ParticleSittingCard } from '@/lib/particleQueue';
import type { Grade } from '@/lib/srs';

// A free round never records, so it is a separate kind rather than a flag on
// the same session — the same distinction Practice.tsx draws.
type ParticleSessionKind = 'scheduled' | 'free';

export default function PracticeParticles() {
  const navigate = useNavigate();
  const { settings, isLoading: settingsLoading } = useSettings();
  const { getParticleSitting, recordAnswer, srsStates, isLoading, isReadOnly } = useSrsProgress();

  const [cards, setCards] = useState<ParticleSittingCard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [sessionKind, setSessionKind] = useState<ParticleSessionKind>('scheduled');
  const [freePool, setFreePool] = useState<ParticleSittingCard[]>([]);

  // getParticleSitting is recreated on every answer, because it closes over
  // srsStates. Keep the latest in a ref so the load effect below can call it
  // without depending on its identity — rebuilding the sitting mid-session
  // would reshuffle the deck under the learner while currentIndex still
  // pointed into the old array (the bug PR #122 fixed for conjugation).
  const getSittingRef = useRef(getParticleSitting);
  useEffect(() => {
    getSittingRef.current = getParticleSitting;
  }, [getParticleSitting]);

  const loadedRef = useRef(false);
  useEffect(() => {
    if (loadedRef.current || isLoading || settingsLoading) return;
    loadedRef.current = true;

    const sitting = getSittingRef.current(settings.particleDailyGoal);
    setCards(sitting.cards);
    setCurrentIndex(0);
    if (sitting.cards.length === 0) {
      setSessionComplete(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, settingsLoading]);

  // The empty queue is a routine state, not an error: ~70 cards are all live
  // after about 24 days at defaults, after which particle mode is pure
  // review with a frequently empty queue. Offer practice that records
  // nothing rather than a dead end (red line P19).
  useEffect(() => {
    if (!sessionComplete || isLoading) return;
    setFreePool(buildFreeParticlePractice(srsStates));
  }, [sessionComplete, isLoading, srsStates]);

  const advance = () => {
    if (currentIndex < cards.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      setSessionComplete(true);
    }
  };

  const startFreePractice = () => {
    if (freePool.length === 0) return;
    setCards(freePool);
    setCurrentIndex(0);
    setSessionKind('free');
    setSessionComplete(false);
  };

  const handleAnswer = (grade: Grade) => {
    const card = cards[currentIndex];
    if (!card) return;
    // A free round is explicitly not scheduled: recording it would move real
    // intervals for items the learner chose to revisit early, which is the
    // opposite of what "keep practising" should cost them.
    if (card.itemId && sessionKind !== 'free') {
      // 'typed' is the only modality particle items use in v1: the answer is
      // two to four characters, so the mobile-friction argument for multiple
      // choice does not apply, and safe distractors would each need a human
      // to confirm the wrong particle is impossible in that exact sentence.
      recordAnswer(card.itemId, grade, 'typed');
    }
    advance();
  };

  if (isLoading || settingsLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-accent/10 p-4 flex items-center justify-center">
        <p className="text-xl text-muted-foreground">Loading particle verbs...</p>
      </div>
    );
  }

  if (sessionComplete) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-accent/10 p-4 flex items-center justify-center">
        <div className="w-full max-w-2xl text-center space-y-6">
          {isReadOnly && <ReadOnlyBanner />}
          <h1 className="text-5xl font-bold text-primary">Great work! 🎉</h1>
          <p className="text-xl text-muted-foreground">
            {cards.length === 0
              ? 'Nothing is due right now, and you have already met every particle verb.'
              : sessionKind === 'free'
                ? "You've finished this free-practice round — nothing here was saved to your progress."
                : "You've finished today's particle verbs."}
          </p>
          <div className="flex flex-col items-center gap-3">
            <Button
              onClick={startFreePractice}
              size="lg"
              variant="secondary"
              className="text-lg px-8 py-6 w-full max-w-xs"
              disabled={freePool.length === 0}
            >
              Keep practising
            </Button>
            <Button
              onClick={() => navigate('/')}
              variant="ghost"
              size="lg"
              className="text-lg px-8 py-6 w-full max-w-xs"
            >
              Back to Home
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const currentCard = cards[currentIndex];
  if (!currentCard) return null;

  // Introductions and a newly introduced verb's first cloze are excluded from
  // the count, so the readout matches the goal the learner is actually being
  // paced against.
  const countedTotal = cards.filter((card) => card.countsTowardGoal).length;
  const countedDone = cards.slice(0, currentIndex).filter((card) => card.countsTowardGoal).length;
  const progressPercent = countedTotal > 0 ? (countedDone / countedTotal) * 100 : 100;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-accent/10 p-4">
      <div className="max-w-2xl mx-auto mb-6 space-y-4">
        {isReadOnly && <ReadOnlyBanner />}
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate('/')} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
          <span className="text-sm font-medium text-muted-foreground">
            {countedTotal > 0
              ? `${Math.min(countedDone + (currentCard.countsTowardGoal ? 1 : 0), countedTotal)} / ${countedTotal}`
              : 'New verbs'}
          </span>
        </div>
        <Progress value={progressPercent} className="h-3 bg-muted-foreground" />
        {sessionKind === 'free' && (
          <p className="text-xs text-center text-muted-foreground">
            Free practice — this round isn't saved to your progress
          </p>
        )}
      </div>

      <div className="flex items-center justify-center">
        <ParticleVerbCard
          key={`${currentCard.entry.id}-${currentCard.kind}-${currentIndex}`}
          card={currentCard}
          repetitions={currentCard.itemId ? (srsStates[currentCard.itemId]?.repetitions ?? 0) : 0}
          onAcknowledge={advance}
          onAnswer={handleAnswer}
        />
      </div>
    </div>
  );
}
