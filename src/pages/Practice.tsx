import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft, Volume2, VolumeX } from 'lucide-react';
import { PracticeCard } from '@/components/PracticeCard';
import { useSrsProgress, type PracticeItem } from '@/hooks/useSrsProgress';
import { useSettings } from '@/hooks/useSettings';
import { Grade, MAX_REQUEUES_PER_DAY, isEligibleForRequeue } from '@/lib/srs';

// Per-item in-session bookkeeping for the same-sitting relearning queue
// (docs/learning/lapse-handling.md, "Decision" and "Interaction with the
// sitting cap"). This is sitting/day bookkeeping only, never persisted to
// localStorage: it is rebuilt from scratch whenever the page loads.
interface RequeueEntry {
  // Items answered since this item's most recent lapse, this sitting.
  itemsSinceLapse: number;
  // Times this item has been re-queued today, across sittings (capped at
  // MAX_REQUEUES_PER_DAY by srs.ts's isEligibleForRequeue).
  requeuesToday: number;
  // True while the item has an unresolved lapse waiting for a same-sitting
  // retry (either not yet eligible to reappear, or currently back in the
  // queue awaiting its retry answer).
  pending: boolean;
}

function getLocalDayKey(): string {
  return new Date().toDateString();
}

export default function Practice() {
  const navigate = useNavigate();
  const { settings, updateSettings, isLoading: settingsLoading } = useSettings();
  const { getDueItems, recordAnswer, isLoading } = useSrsProgress(settings.cefrLevels);

  // `sessionItems` is the fixed set loaded at sitting start: it is the
  // denominator for the progress display and never grows. `queue` is the
  // live, mutable working list that a lapse can splice items back into.
  const [sessionItems, setSessionItems] = useState<PracticeItem[]>([]);
  const [queue, setQueue] = useState<PracticeItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [practiceComplete, setPracticeComplete] = useState(false);
  const [completedItemIds, setCompletedItemIds] = useState<Set<string>>(new Set());
  const [requeueMap, setRequeueMap] = useState<Record<string, RequeueEntry>>({});
  const [requeueDay, setRequeueDay] = useState(getLocalDayKey);

  // getDueItems is rebuilt (new function identity) whenever srsStates
  // changes, i.e. after every recordAnswer -- so it is not a stable effect
  // dependency, and this effect re-fires far more often than "a sitting
  // starts". hasLoadedRef confines the actual sitting setup (and its resets
  // of currentIndex/completedItemIds/requeueMap) to the first time due
  // items are available after mount, so mid-sitting answers cannot re-run
  // it and snap the learner back to card one.
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    const loadDueItems = async () => {
      if (!isLoading && !settingsLoading && !hasLoadedRef.current) {
        hasLoadedRef.current = true;
        const items = await getDueItems();
        setSessionItems(items);
        setQueue(items);
        setCurrentIndex(0);
        setCompletedItemIds(new Set());
        setRequeueMap({});
        setRequeueDay(getLocalDayKey());
        if (items.length === 0) {
          setPracticeComplete(true);
        }
      }
    };
    loadDueItems();
  }, [isLoading, settingsLoading, getDueItems]);

  const sessionItemIds = useMemo(
    () => new Set(sessionItems.map((item) => item.itemId)),
    [sessionItems],
  );

  const handleAnswer = (grade: Grade) => {
    const answeredItem = queue[currentIndex];
    if (!answeredItem) return;

    recordAnswer(answeredItem.itemId, grade);

    const isCorrect = grade === 5;
    const today = getLocalDayKey();
    // Local-day boundary: bookkeeping from a previous day never carries in.
    const baseMap = today === requeueDay ? requeueMap : {};

    // Every other item still waiting on its re-queue gets one item closer to
    // eligibility now that another card has been answered.
    const advancedMap: Record<string, RequeueEntry> = {};
    for (const [id, entry] of Object.entries(baseMap)) {
      advancedMap[id] =
        entry.pending && id !== answeredItem.itemId
          ? { ...entry, itemsSinceLapse: entry.itemsSinceLapse + 1 }
          : entry;
    }

    const priorEntry = advancedMap[answeredItem.itemId] ?? {
      itemsSinceLapse: 0,
      requeuesToday: 0,
      pending: false,
    };

    const nextEntryForAnswered: RequeueEntry = isCorrect
      ? // Correct answer resolves any pending lapse (first try or the
        // required retry after a re-queue).
        { ...priorEntry, pending: false }
      : priorEntry.requeuesToday < MAX_REQUEUES_PER_DAY
        ? // Lapsed, and still under the daily re-queue cap: wait for the gap.
          { ...priorEntry, itemsSinceLapse: 0, pending: true }
        : // Cap already spent today: leave it for its normal `dueAt` (already
          // set to tomorrow by recordAnswer -> calculateNextReview).
          { ...priorEntry, pending: false };

    const nextMap: Record<string, RequeueEntry> = {
      ...advancedMap,
      [answeredItem.itemId]: nextEntryForAnswered,
    };

    // Splice back in every pending item that has now cleared the gap.
    // Invariant: an itemId may appear at most once beyond the currently-shown
    // card. A pending item stays pending after its splice, and every later
    // answer keeps advancing its itemsSinceLapse, so without this guard the
    // gap clears a second time before the first retry is ever shown -- a
    // duplicate copy lands in the queue, silently burns the daily cap, and
    // (because PracticeCard is keyed on itemId) React never remounts the
    // card for the back-to-back copy, freezing the sitting on the previous
    // attempt's feedback panel.
    let nextQueue = queue;
    for (const [id, entry] of Object.entries(nextMap)) {
      if (entry.pending && isEligibleForRequeue(entry.itemsSinceLapse, entry.requeuesToday)) {
        const alreadyQueuedAhead = nextQueue.some(
          (q, index) => index > currentIndex && q.itemId === id,
        );
        const item = queue.find((q) => q.itemId === id);
        if (item && !alreadyQueuedAhead) {
          nextQueue = [...nextQueue, item];
          nextMap[id] = { ...entry, requeuesToday: entry.requeuesToday + 1, itemsSinceLapse: 0 };
        }
      }
    }

    // A session item ticks the progress display once it stops being pending
    // a re-queue (correct, or the daily cap is spent) -- never on the
    // re-queued attempt itself, so a lapse cannot inflate the numerator by
    // being shown twice.
    const stillPending = nextMap[answeredItem.itemId]?.pending ?? false;
    const nextCompletedItemIds =
      !stillPending && sessionItemIds.has(answeredItem.itemId)
        ? new Set(completedItemIds).add(answeredItem.itemId)
        : completedItemIds;

    setRequeueMap(nextMap);
    setRequeueDay(today);
    setQueue(nextQueue);
    setCompletedItemIds(nextCompletedItemIds);

    if (currentIndex < nextQueue.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      setPracticeComplete(true);
    }
  };

  const totalSessionItems = sessionItems.length;
  const currentItem = queue[currentIndex];
  const requeuesSoFar = currentItem ? (requeueMap[currentItem.itemId]?.requeuesToday ?? 0) : 0;
  const willRequeueIfWrong = requeuesSoFar < MAX_REQUEUES_PER_DAY;
  const isRequeueAttempt = requeuesSoFar > 0;
  // Session position never counts a re-queued attempt as a new card, so a
  // lapse cannot make the "N / total" readout look further along than it is.
  const displayedPosition = Math.min(
    completedItemIds.size + (isRequeueAttempt ? 0 : 1),
    totalSessionItems,
  );
  const progressPercent =
    totalSessionItems > 0 ? (completedItemIds.size / totalSessionItems) * 100 : 100;

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

  if (queue.length === 0 || !currentItem) {
    return null;
  }

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
              {displayedPosition} / {totalSessionItems}
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
          willRequeueIfWrong={willRequeueIfWrong}
          onAnswer={handleAnswer}
        />
      </div>
    </div>
  );
}
