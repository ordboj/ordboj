import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft } from 'lucide-react';
import { ParticleVerbCard } from '@/components/ParticleVerbCard';
import { useSrsProgress } from '@/hooks/useSrsProgress';
import { useSettings } from '@/hooks/useSettings';
import { PARTICLE_DAILY_GOAL_DEFAULT, type ParticleSittingCard } from '@/lib/particleQueue';
import type { Grade } from '@/lib/srs';

export default function PracticeParticles() {
  const navigate = useNavigate();
  const { isLoading: settingsLoading } = useSettings();
  const { getParticleSitting, recordAnswer, srsStates, isLoading } = useSrsProgress();

  const [cards, setCards] = useState<ParticleSittingCard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [sessionComplete, setSessionComplete] = useState(false);

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

    const sitting = getSittingRef.current(PARTICLE_DAILY_GOAL_DEFAULT);
    setCards(sitting.cards);
    setCurrentIndex(0);
    if (sitting.cards.length === 0) {
      setSessionComplete(true);
    }
  }, [isLoading, settingsLoading]);

  const advance = () => {
    if (currentIndex < cards.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      setSessionComplete(true);
    }
  };

  const handleAnswer = (grade: Grade) => {
    const card = cards[currentIndex];
    if (!card) return;
    if (card.itemId) {
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
          <h1 className="text-5xl font-bold text-primary">Great work! 🎉</h1>
          <p className="text-xl text-muted-foreground">
            {cards.length === 0
              ? 'No particle verbs are ready for you yet — keep practising conjugation and they will unlock.'
              : "You've finished today's particle verbs."}
          </p>
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
