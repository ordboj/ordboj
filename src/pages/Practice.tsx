import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft, Volume2, VolumeX } from 'lucide-react';
import { PracticeCard } from '@/components/PracticeCard';
import { useSrsProgress, type PracticeItem } from '@/hooks/useSrsProgress';
import { useSettings } from '@/hooks/useSettings';
import { Grade, RELEARNING_MIN_GAP } from '@/lib/srs';

export default function Practice() {
  const navigate = useNavigate();
  const { settings, updateSettings, isLoading: settingsLoading } = useSettings();
  const { getDueItems, recordAnswer, isLoading } = useSrsProgress(settings.cefrLevels);

  const [dueItems, setDueItems] = useState<PracticeItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [practiceComplete, setPracticeComplete] = useState(false);

  useEffect(() => {
    const loadDueItems = async () => {
      if (!isLoading && !settingsLoading) {
        const items = await getDueItems();
        setDueItems(items);
        if (items.length === 0) {
          setPracticeComplete(true);
        }
      }
    };
    loadDueItems();
  }, [isLoading, settingsLoading, getDueItems]);

  const handleAnswer = (grade: Grade) => {
    const currentItem = dueItems[currentIndex];
    // Optional chaining, not a destructure: keeps this call site resilient
    // if recordAnswer is ever mocked or stubbed without the requeue result.
    const needsRequeue = recordAnswer(currentItem.itemId, grade)?.needsRequeue ?? false;

    if (needsRequeue) {
      // Lapse: re-insert this item RELEARNING_MIN_GAP items ahead so it
      // comes back for a second retrieval attempt within the same sitting
      // (docs/learning/lapse-handling.md), instead of only surfacing
      // tomorrow. Clamped to the end of the queue when fewer items remain.
      setDueItems((prev) => {
        const next = [...prev];
        const insertAt = Math.min(currentIndex + RELEARNING_MIN_GAP, next.length);
        next.splice(insertAt, 0, currentItem);
        return next;
      });
    }

    if (currentIndex < dueItems.length - 1 || needsRequeue) {
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
          <Button variant="ghost" onClick={() => navigate('/')} className="gap-2">
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
              onClick={() => updateSettings({ muteAudio: !settings.muteAudio })}
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
          onAnswer={handleAnswer}
        />
      </div>
    </div>
  );
}
