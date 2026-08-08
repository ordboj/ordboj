import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft, Volume2, VolumeX } from 'lucide-react';
import { PracticeCard } from '@/components/PracticeCard';
import { useSrsProgress, type PracticeItem } from '@/hooks/useSrsProgress';
import { useSettings } from '@/hooks/useSettings';
import { Grade, SrsState } from '@/lib/srs';

// docs/learning/new-vs-review-mix.md: reviews are served first; whatever
// budget is left in `dailyGoal` after reviews buys new items at this ratio,
// so introduction rate self-corrects with the backlog instead of following a
// fixed daily rate.
const NEW_PER_DAY_RATIO = 0.3;
const REVIEWS_PER_NEW_ITEM = 3;

// docs/learning/session-shape-and-daily-goal.md: once the capped session is
// done, further study for the day is "free practice" - it never writes SRS
// state, so studying ahead of schedule cannot corrupt the review schedule -
// offered in small repeatable batches rather than dumping the rest of the
// backlog at once.
const FREE_PRACTICE_BATCH_SIZE = 5;

// An item that has never been answered is not a "review": it enters the
// queue only through the new-item allowance below (new-vs-review-mix.md).
function isReviewItem(item: PracticeItem, srsStates: Record<string, SrsState>): boolean {
  return (srsStates[item.itemId]?.repetitions ?? 0) > 0;
}

// Splits the raw due list into the capped session the learner sees now and
// the leftover backlog, per docs/learning/new-vs-review-mix.md and
// session-shape-and-daily-goal.md. `dailyGoal` is what this ticket makes
// `dailyGoal` actually govern: the session length cap, not a dead setting.
function buildSession(
  dueItems: PracticeItem[],
  srsStates: Record<string, SrsState>,
  dailyGoal: number,
): { session: PracticeItem[]; backlog: PracticeItem[] } {
  const reviews = dueItems.filter((item) => isReviewItem(item, srsStates));
  const newItems = dueItems.filter((item) => !isReviewItem(item, srsStates));

  const reviewsDueToday = reviews.length;
  const newPerDayMax = Math.round(dailyGoal * NEW_PER_DAY_RATIO);
  const newAllowedToday = Math.max(
    0,
    Math.min(
      newPerDayMax,
      Math.floor((dailyGoal - Math.min(reviewsDueToday, dailyGoal)) / REVIEWS_PER_NEW_ITEM),
    ),
  );

  const session = [...reviews.slice(0, dailyGoal), ...newItems.slice(0, newAllowedToday)].slice(
    0,
    dailyGoal,
  );
  const sessionIds = new Set(session.map((item) => item.itemId));
  const backlog = dueItems.filter((item) => !sessionIds.has(item.itemId));

  return { session, backlog };
}

export default function Practice() {
  const navigate = useNavigate();
  const { settings, updateSettings, isLoading: settingsLoading } = useSettings();
  const { getDueItems, recordAnswer, srsStates, isLoading } = useSrsProgress(settings.cefrLevels);

  // The capped session queue and its leftover backlog, computed once per
  // due-list load rather than re-derived on every answer - srsStates changes
  // after every recordAnswer, and re-splitting mid-session would reshuffle
  // the queue length under the learner's thumb.
  const [sessionQueue, setSessionQueue] = useState<PracticeItem[] | null>(null);
  const [backlog, setBacklog] = useState<PracticeItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [practiceComplete, setPracticeComplete] = useState(false);

  // True once the capped session is finished and there is backlog left, so
  // the learner is offered a choice instead of being dumped on "Great Work"
  // while cards are still waiting (or silently walked into more graded
  // items past the goal they set).
  const [showContinuePrompt, setShowContinuePrompt] = useState(false);

  // Free practice never calls recordAnswer - see FREE_PRACTICE_BATCH_SIZE
  // comment above.
  const [freeQueue, setFreeQueue] = useState<PracticeItem[] | null>(null);
  const [freeIndex, setFreeIndex] = useState(0);
  const [inFreePractice, setInFreePractice] = useState(false);

  useEffect(() => {
    if (isLoading || settingsLoading || sessionQueue !== null) {
      return;
    }
    let cancelled = false;
    getDueItems().then((items) => {
      if (cancelled) return;
      const { session, backlog: leftover } = buildSession(items, srsStates, settings.dailyGoal);
      setSessionQueue(session);
      setBacklog(leftover);
      if (session.length === 0) {
        setPracticeComplete(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isLoading, settingsLoading, sessionQueue, getDueItems, srsStates, settings.dailyGoal]);

  const startFreePractice = () => {
    const batch = backlog.slice(0, FREE_PRACTICE_BATCH_SIZE);
    setFreeQueue(batch);
    setFreeIndex(0);
    setInFreePractice(true);
    setShowContinuePrompt(false);
  };

  const handleAnswer = (grade: Grade) => {
    if (inFreePractice && freeQueue) {
      // Free practice records nothing: no recordAnswer, no dueAt change, no
      // ease change (session-shape-and-daily-goal.md).
      if (freeIndex < freeQueue.length - 1) {
        setFreeIndex(freeIndex + 1);
      } else {
        setPracticeComplete(true);
      }
      return;
    }

    if (!sessionQueue) return;
    const currentItem = sessionQueue[currentIndex];
    recordAnswer(currentItem.itemId, grade);

    if (currentIndex < sessionQueue.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else if (backlog.length > 0) {
      setShowContinuePrompt(true);
    } else {
      setPracticeComplete(true);
    }
  };

  if (isLoading || settingsLoading || sessionQueue === null) {
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
            {backlog.length > 0
              ? "You've completed today's goal"
              : "You've completed all due cards for today"}
          </p>
          {backlog.length > 0 && (
            <p className="text-sm text-muted-foreground">
              +{backlog.length} waiting whenever you're ready
            </p>
          )}
          <Button onClick={() => navigate('/')} size="lg" className="text-lg px-8 py-6">
            Back to Home
          </Button>
        </div>
      </div>
    );
  }

  if (showContinuePrompt) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-accent/10 p-4 flex items-center justify-center">
        <div className="w-full max-w-2xl text-center space-y-6">
          <h1 className="text-4xl font-bold text-primary">Goal reached! 🎉</h1>
          <p className="text-xl text-muted-foreground">
            +{backlog.length} more waiting whenever you're ready
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button onClick={startFreePractice} size="lg" className="text-lg px-8 py-6">
              Keep practising
            </Button>
            <Button
              onClick={() => setPracticeComplete(true)}
              variant="outline"
              size="lg"
              className="text-lg px-8 py-6"
            >
              Done for now
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const activeQueue = inFreePractice ? (freeQueue ?? []) : sessionQueue;
  const activeIndex = inFreePractice ? freeIndex : currentIndex;

  if (activeQueue.length === 0 || !activeQueue[activeIndex]) {
    return null;
  }

  const currentItem = activeQueue[activeIndex];
  const progressPercent =
    activeQueue.length > 0 ? ((activeIndex + 1) / activeQueue.length) * 100 : 100;

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
              {activeIndex + 1} / {activeQueue.length}
              {!inFreePractice && backlog.length > 0 && (
                <span className="ml-2 text-xs text-muted-foreground">
                  +{backlog.length} waiting
                </span>
              )}
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
