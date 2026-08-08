import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft, Volume2, VolumeX } from 'lucide-react';
import { PracticeCard } from '@/components/PracticeCard';
import { ConfettiEffect } from '@/components/ConfettiEffect';
import { useSrsProgress, type PracticeItem } from '@/hooks/useSrsProgress';
import { useSettings } from '@/hooks/useSettings';
import { Grade } from '@/lib/srs';

export default function Practice() {
  const navigate = useNavigate();
  const { settings, updateSettings, isLoading: settingsLoading } = useSettings();
  const { getDueItems, recordAnswer, isLoading } = useSrsProgress(settings.cefrLevels);

  const [dueItems, setDueItems] = useState<PracticeItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [practiceComplete, setPracticeComplete] = useState(false);
  // Items graded wrong earlier in this sitting. A later correct answer for
  // one of these is a lapse recovery — the only per-card confetti moment
  // (learning decision P8).
  const [failedItemIds, setFailedItemIds] = useState<Set<string>>(new Set());

  // getDueItems is recreated every time srsStates changes (i.e. after every
  // answer). Keep the latest reference in a ref so the load effect below can
  // call it without depending on its identity, otherwise the deck would be
  // recomputed and reshuffled mid-session while currentIndex still points
  // into the old array, causing skipped/repeated cards.
  const getDueItemsRef = useRef(getDueItems);
  useEffect(() => {
    getDueItemsRef.current = getDueItems;
  }, [getDueItems]);

  // Load the deck exactly once per session (i.e. once per mount), when the
  // underlying data first becomes available.
  const deckLoadedRef = useRef(false);
  useEffect(() => {
    if (deckLoadedRef.current || isLoading || settingsLoading) {
      return;
    }
    deckLoadedRef.current = true;

    const loadDueItems = async () => {
      try {
        const items = await getDueItemsRef.current();
        setDueItems(items);
        if (items.length === 0) {
          setPracticeComplete(true);
        }
      } catch (error) {
        console.error('Failed to load due items for practice session', error);
        setPracticeComplete(true);
      }
    };
    loadDueItems();
  }, [isLoading, settingsLoading]);

  const handleAnswer = (grade: Grade) => {
    const currentItem = dueItems[currentIndex];
    recordAnswer(currentItem.itemId, grade);

    if (grade === 0) {
      setFailedItemIds((prev) => new Set(prev).add(currentItem.itemId));
    }

    if (currentIndex < dueItems.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      setPracticeComplete(true);
    }
  };

  const progressPercent = dueItems.length > 0 ? ((currentIndex + 1) / dueItems.length) * 100 : 100;

  if (isLoading || settingsLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-accent/10 p-4 flex items-center justify-center">
        <div className="text-center">
          <p className="text-xl text-muted-foreground">Loading practice cards...</p>
        </div>
      </div>
    );
  }

  if (practiceComplete) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-accent/10 p-4 flex items-center justify-center">
        {/* Only celebrate a real finish, not an empty queue on arrival. */}
        <ConfettiEffect trigger={dueItems.length > 0} />
        <div className="w-full max-w-2xl text-center space-y-6">
          <h1 className="text-5xl font-bold text-primary">Great Work! 🎉</h1>
          <p className="text-xl text-muted-foreground">You've completed all due cards for today</p>
          <Button onClick={() => navigate('/')} size="lg" className="text-lg px-8 py-6">
            Back to Home
          </Button>
        </div>
      </div>
    );
  }

  if (dueItems.length === 0 || !dueItems[currentIndex]) {
    return null;
  }

  const currentItem = dueItems[currentIndex];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-accent/10 p-4">
      {/* Header */}
      <div className="max-w-2xl mx-auto mb-6 space-y-4">
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate('/')} className="gap-2 h-11">
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-muted-foreground">
              {currentIndex + 1} / {dueItems.length}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-11 w-11"
              onClick={() => updateSettings({ muteAudio: !settings.muteAudio })}
              aria-label={settings.muteAudio ? 'Unmute audio' : 'Mute audio'}
            >
              {settings.muteAudio ? (
                <VolumeX className="h-5 w-5" />
              ) : (
                <Volume2 className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>

        <Progress value={progressPercent} className="h-3" />
      </div>

      {/* Practice Card */}
      <div className="flex items-center justify-center">
        <PracticeCard
          key={currentItem.itemId}
          infinitive={currentItem.infinitive}
          form={currentItem.form}
          mode={settings.practiceMode}
          showExamples={settings.showExamples}
          autoplayAudio={settings.autoplayAudio}
          muteAudio={settings.muteAudio}
          celebrateOnCorrect={failedItemIds.has(currentItem.itemId)}
          onAnswer={handleAnswer}
        />
      </div>
    </div>
  );
}
