import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft } from 'lucide-react';
import { PracticeCard } from '@/components/PracticeCard';
import { useSrsProgress } from '@/hooks/useSrsProgress';
import { useSettings } from '@/hooks/useSettings';
import { Grade } from '@/lib/srs';

export default function Practice() {
  const navigate = useNavigate();
  const { getDueItems, recordAnswer } = useSrsProgress();
  const { settings } = useSettings();
  
  const [dueItems, setDueItems] = useState<ReturnType<typeof getDueItems>>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [practiceComplete, setPracticeComplete] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    const items = getDueItems();
    setDueItems(items);
    if (items.length === 0) {
      setPracticeComplete(true);
    }
    setIsInitializing(false);
  }, [getDueItems]);

  const handleAnswer = (grade: Grade) => {
    const currentItem = dueItems[currentIndex];
    recordAnswer(currentItem.itemId, grade);

    if (currentIndex < dueItems.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      setPracticeComplete(true);
    }
  };

  const progressPercent = dueItems.length > 0
    ? ((currentIndex + 1) / dueItems.length) * 100
    : 100;

  if (isInitializing) {
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
          <p className="text-xl text-muted-foreground">
            You've completed all due cards for today
          </p>
          <Button
            onClick={() => navigate('/')}
            size="lg"
            className="text-lg px-8 py-6"
          >
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
          <Button
            variant="ghost"
            onClick={() => navigate('/')}
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
          <span className="text-sm font-medium text-muted-foreground">
            {currentIndex + 1} / {dueItems.length}
          </span>
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
          onAnswer={handleAnswer}
        />
      </div>
    </div>
  );
}
