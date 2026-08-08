import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft, Volume2, VolumeX } from 'lucide-react';
import { PracticeCard } from '@/components/PracticeCard';
import { useSrsProgress, type PracticeItem } from '@/hooks/useSrsProgress';
import { useSettings } from '@/hooks/useSettings';
import { Grade } from '@/lib/srs';
import { getVerbs, conjugateVerb, type Form } from '@/lib/verbs';

// How many items "Keep practising" draws per batch.
const FREE_PRACTICE_SIZE = 5;
const PRACTICE_FORMS: Form[] = ['presens', 'preteritum', 'supinum', 'imperativ'];

// 'due' and 'extra' both record answers to real SRS state; 'free' never
// does. Kept as a union (not a boolean) because the completion screen's
// copy and the header hint below the progress bar branch on it too.
type SessionKind = 'due' | 'free' | 'extra';

export default function Practice() {
  const navigate = useNavigate();
  const { settings, updateSettings, isLoading: settingsLoading } = useSettings();
  const { getDueItems, recordAnswer, srsStates, isLoading } = useSrsProgress(settings.cefrLevels);

  const [items, setItems] = useState<PracticeItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [sessionKind, setSessionKind] = useState<SessionKind>('due');
  const [sessionComplete, setSessionComplete] = useState(false);
  const [extraReviewCount, setExtraReviewCount] = useState(0);
  const [freePracticeCount, setFreePracticeCount] = useState(0);

  // Up to FREE_PRACTICE_SIZE items that are NOT currently due, nearest
  // future dueAt first. Reads srsStates only -- never calls recordAnswer,
  // so drawing (or re-drawing) this pool never disturbs the real schedule.
  const buildFreePracticePool = useCallback(async (): Promise<PracticeItem[]> => {
    const now = Date.now();
    const allVerbs = await getVerbs();
    const verbs =
      settings.cefrLevels.length > 0
        ? allVerbs.filter((verb) => verb.cefr && settings.cefrLevels.includes(verb.cefr))
        : allVerbs;

    const candidates: Array<PracticeItem & { dueAt: number }> = [];
    for (const verb of verbs) {
      const conjugated = await conjugateVerb(verb.infinitive);
      for (const form of PRACTICE_FORMS) {
        if (conjugated[form] === '(not available)' || !conjugated[form]) continue;
        const itemId = `${verb.id}-${form}`;
        const state = srsStates[itemId];
        if (!state || state.dueAt <= now) continue;
        candidates.push({
          verbId: verb.id,
          infinitive: verb.infinitive,
          form,
          itemId,
          dueAt: state.dueAt,
        });
      }
    }

    candidates.sort((a, b) => a.dueAt - b.dueAt);
    return candidates.slice(0, FREE_PRACTICE_SIZE).map(({ dueAt: _dueAt, ...item }) => item);
  }, [settings.cefrLevels, srsStates]);

  // Marks the session done and refreshes the counts the completion screen
  // needs for its two post-session actions.
  const finishSession = useCallback(async () => {
    const [due, free] = await Promise.all([getDueItems(), buildFreePracticePool()]);
    setExtraReviewCount(due.length);
    setFreePracticeCount(free.length);
    setSessionComplete(true);
  }, [getDueItems, buildFreePracticePool]);

  useEffect(() => {
    const loadDueItems = async () => {
      if (!isLoading && !settingsLoading) {
        const due = await getDueItems();
        setItems(due);
        if (due.length === 0) {
          await finishSession();
        }
      }
    };
    loadDueItems();
    // finishSession intentionally omitted: it is stable enough for this
    // effect's purpose and adding it would re-run the load on every
    // srsStates change (i.e. after every recorded answer). currentIndex and
    // sessionKind are deliberately left alone here too -- they only belong
    // to a session the user is actively in (started at index 0 by the
    // handlers below) and this effect must not reset progress out from
    // under an in-flight 'extra' review just because recordAnswer touched
    // srsStates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, settingsLoading, getDueItems]);

  const startFreePractice = async () => {
    const pool = await buildFreePracticePool();
    setItems(pool);
    setCurrentIndex(0);
    setSessionKind('free');
    if (pool.length === 0) {
      await finishSession();
    } else {
      setSessionComplete(false);
    }
  };

  const startExtraReview = async () => {
    const due = await getDueItems();
    setItems(due);
    setCurrentIndex(0);
    setSessionKind('extra');
    if (due.length === 0) {
      await finishSession();
    } else {
      setSessionComplete(false);
    }
  };

  const handleAnswer = (grade: Grade) => {
    const currentItem = items[currentIndex];
    if (sessionKind !== 'free') {
      recordAnswer(currentItem.itemId, grade);
    }

    if (currentIndex < items.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      finishSession();
    }
  };

  const progressPercent = items.length > 0 ? ((currentIndex + 1) / items.length) * 100 : 100;

  if (isLoading || settingsLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-accent/10 p-4 flex items-center justify-center">
        <div className="text-center">
          <p className="text-xl text-muted-foreground">Loading practice cards...</p>
        </div>
      </div>
    );
  }

  if (sessionComplete) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-accent/10 p-4 flex items-center justify-center">
        <div className="w-full max-w-2xl text-center space-y-6">
          <h1 className="text-5xl font-bold text-primary">Great Work! 🎉</h1>
          <p className="text-xl text-muted-foreground">You've completed all due cards for today</p>
          <div className="flex flex-col items-center gap-3">
            <Button
              onClick={startFreePractice}
              size="lg"
              variant="secondary"
              className="text-lg px-8 py-6 w-full max-w-xs"
              disabled={freePracticeCount === 0}
            >
              Keep practising
            </Button>
            {extraReviewCount > 0 && (
              <Button
                onClick={startExtraReview}
                size="lg"
                className="text-lg px-8 py-6 w-full max-w-xs"
              >
                Extra reviews ({extraReviewCount})
              </Button>
            )}
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

  if (items.length === 0 || !items[currentIndex]) {
    return null;
  }

  const currentItem = items[currentIndex];

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
              {currentIndex + 1} / {items.length}
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
        {sessionKind === 'free' && (
          <p className="text-xs text-center text-muted-foreground">
            Free practice — this round isn't saved to your progress
          </p>
        )}
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
