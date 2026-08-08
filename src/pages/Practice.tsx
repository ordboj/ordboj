import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, DoorOpen, Volume2, VolumeX } from 'lucide-react';
import { PracticeCard } from '@/components/PracticeCard';
import { useSrsProgress, type PracticeItem } from '@/hooks/useSrsProgress';
import { useSettings } from '@/hooks/useSettings';
import { Grade } from '@/lib/srs';

// A sitting is a bounded run of cards, not the whole due queue: 15 items,
// then a stopping point offered as a door (one tap continues, one tap
// stops), never enforced as a wall. See
// docs/learning/session-shape-and-daily-goal.md.
const SITTING_SIZE = 15;

export default function Practice() {
  const navigate = useNavigate();
  const { settings, updateSettings, isLoading: settingsLoading } = useSettings();
  const { getDueItems, recordAnswer, isLoading } = useSrsProgress(settings.cefrLevels);

  const [dueItems, setDueItems] = useState<PracticeItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [practiceComplete, setPracticeComplete] = useState(false);
  const [atSittingDoor, setAtSittingDoor] = useState(false);

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
    recordAnswer(currentItem.itemId, grade);

    const nextIndex = currentIndex + 1;
    if (nextIndex >= dueItems.length) {
      setPracticeComplete(true);
    } else if (nextIndex % SITTING_SIZE === 0) {
      setCurrentIndex(nextIndex);
      setAtSittingDoor(true);
    } else {
      setCurrentIndex(nextIndex);
    }
  };

  const sittingStart = Math.floor(currentIndex / SITTING_SIZE) * SITTING_SIZE;
  const sittingSize = Math.min(SITTING_SIZE, dueItems.length - sittingStart);
  const positionInSitting = currentIndex - sittingStart + 1;
  const progressPercent = sittingSize > 0 ? (positionInSitting / sittingSize) * 100 : 100;

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

  if (atSittingDoor && dueItems[currentIndex]) {
    const remaining = dueItems.length - currentIndex;
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-accent/10 p-4 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center space-y-2">
            <DoorOpen className="w-10 h-10 mx-auto text-muted-foreground" aria-hidden="true" />
            <CardTitle className="text-2xl">Stopping point</CardTitle>
            <CardDescription className="text-base">
              You've done {SITTING_SIZE} this sitting. Keep going or stop here — both are a fine
              choice.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button
              onClick={() => setAtSittingDoor(false)}
              size="lg"
              className="w-full text-lg py-6"
            >
              Keep going ({remaining} more due)
            </Button>
            <Button
              onClick={() => navigate('/')}
              variant="outline"
              size="lg"
              className="w-full text-lg py-6"
            >
              Done for now
            </Button>
          </CardContent>
        </Card>
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
              {positionInSitting} / {sittingSize}
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
