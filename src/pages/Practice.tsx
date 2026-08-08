import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft, Volume2, VolumeX } from 'lucide-react';
import { PracticeCard } from '@/components/PracticeCard';
import { ConfettiEffect } from '@/components/ConfettiEffect';
import { ReadOnlyBanner } from '@/components/ReadOnlyBanner';
import { useSrsProgress, type PracticeItem } from '@/hooks/useSrsProgress';
import { useSettings } from '@/hooks/useSettings';
import { conjugationItemId } from '@/lib/itemIds';
import { Grade, MAX_REQUEUES_PER_DAY, isEligibleForRequeue } from '@/lib/srs';
import { getVerbs, conjugateVerb, type Form } from '@/lib/verbs';

// How many items "Keep practising" draws per batch.
const FREE_PRACTICE_SIZE = 5;
const PRACTICE_FORMS: Form[] = ['presens', 'preteritum', 'supinum', 'imperativ'];

// 'due' and 'extra' both record answers to real SRS state; 'free' never
// does. Kept as a union (not a boolean) because the completion screen's
// copy and the header hint below the progress bar branch on it too.
type SessionKind = 'due' | 'free' | 'extra';

// Per-item in-session bookkeeping for the same-sitting relearning queue
// (docs/learning/lapse-handling.md, "Decision" and "Interaction with the
// sitting cap"). This is day-level bookkeeping and outlives any single
// round: requeuesToday is a per-item-per-day cap, so it survives a switch
// between 'due'/'free'/'extra' rounds within the same mount. `pending` and
// `itemsSinceLapse` are round-structural instead -- they describe a retry's
// position in the *current* queue, so a new round clears them (a retry
// still pending when a round ends is dropped; the lapse already moved the
// item's own schedule, so nothing is lost).
interface RequeueEntry {
  itemsSinceLapse: number;
  requeuesToday: number;
  pending: boolean;
}

function getLocalDayKey(): string {
  return new Date().toDateString();
}

export default function Practice() {
  const navigate = useNavigate();
  const { settings, updateSettings, isLoading: settingsLoading } = useSettings();
  const { getDueItems, recordAnswer, srsStates, isLoading, isReadOnly } = useSrsProgress(
    settings.cefrLevels,
  );

  // `items` is the current round's live, mutable working list -- a lapse in
  // a 'due'/'extra' round can splice a same-sitting retry back into it.
  // `roundItemIds` is the fixed set the round started with, snapshotted at
  // round load: it is the denominator for the progress display and the
  // membership test for "did this already-graded item belong to this
  // round", and never grows even when `items` does.
  const [items, setItems] = useState<PracticeItem[]>([]);
  const [roundItemIds, setRoundItemIds] = useState<Set<string>>(new Set());
  const [currentIndex, setCurrentIndex] = useState(0);
  const [sessionKind, setSessionKind] = useState<SessionKind>('due');
  const [sessionComplete, setSessionComplete] = useState(false);
  const [completedItemIds, setCompletedItemIds] = useState<Set<string>>(new Set());
  const [requeueMap, setRequeueMap] = useState<Record<string, RequeueEntry>>({});
  const [requeueDay, setRequeueDay] = useState(getLocalDayKey);
  // The due/free pools available once a session ends, computed once
  // srsStates has actually caught up with any answer just recorded (see the
  // effect below). The completion screen's counts and its "Extra reviews" /
  // "Keep practising" actions both read from these same arrays, so a button
  // can never advertise a count it can't then deliver.
  const [pendingExtraReview, setPendingExtraReview] = useState<PracticeItem[]>([]);
  const [pendingFreePractice, setPendingFreePractice] = useState<PracticeItem[]>([]);

  // getDueItems is recreated every time srsStates changes (i.e. after every
  // answer). Keep the latest reference in a ref so effects can call it
  // without depending on its identity, otherwise the deck would be
  // recomputed and reshuffled mid-session while currentIndex still points
  // into the old array, causing skipped/repeated cards (issue #103, PR #122).
  const getDueItemsRef = useRef(getDueItems);
  useEffect(() => {
    getDueItemsRef.current = getDueItems;
  }, [getDueItems]);

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
        const itemId = conjugationItemId(verb.id, form);
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

  // Starts a fresh round: resets the queue-structural state (items,
  // roundItemIds, currentIndex, completedItemIds) and clears any retry that
  // was still pending from the previous round without discarding the
  // day-level requeue-cap bookkeeping (docs/learning/lapse-handling.md: the
  // cap is per item per day, not per round). A day change wipes the whole
  // map, same as the mid-round check in handleAnswer.
  const startRound = (roundItems: PracticeItem[], kind: SessionKind) => {
    setItems(roundItems);
    setRoundItemIds(new Set(roundItems.map((item) => item.itemId)));
    setCurrentIndex(0);
    setSessionKind(kind);
    setSessionComplete(false);
    setCompletedItemIds(new Set());

    const today = getLocalDayKey();
    const carriedMap = today === requeueDay ? requeueMap : {};
    const clearedMap: Record<string, RequeueEntry> = {};
    for (const [id, entry] of Object.entries(carriedMap)) {
      clearedMap[id] = entry.pending ? { ...entry, pending: false, itemsSinceLapse: 0 } : entry;
    }
    setRequeueMap(clearedMap);
    setRequeueDay(today);
  };

  // Load the deck exactly once per session (i.e. once per mount), when the
  // underlying data first becomes available. Mirrors PR #122's stable-load
  // pattern: depending on isLoading/settingsLoading only (not getDueItems)
  // keeps this from re-firing on every post-answer render.
  const deckLoadedRef = useRef(false);
  useEffect(() => {
    if (deckLoadedRef.current || isLoading || settingsLoading) {
      return;
    }
    deckLoadedRef.current = true;

    const loadDueItems = async () => {
      try {
        const due = await getDueItemsRef.current();
        // First load of the mount: requeueMap is still its initial {}, so
        // there is nothing pending to carry over or clear yet -- this can
        // set state directly instead of going through startRound.
        setItems(due);
        setRoundItemIds(new Set(due.map((item) => item.itemId)));
        setCurrentIndex(0);
        setSessionKind('due');
        setCompletedItemIds(new Set());
        setRequeueDay(getLocalDayKey());
        if (due.length === 0) {
          setSessionComplete(true);
        }
      } catch (error) {
        console.error('Failed to load due items for practice session', error);
        setSessionComplete(true);
      }
    };
    loadDueItems();
  }, [isLoading, settingsLoading]);

  // Recomputes the completion screen's two post-session pools whenever a
  // session ends, keyed on srsStates rather than read from a closure
  // captured inside handleAnswer. recordAnswer's state update and this
  // effect's re-run are two separate React commits, so by the time this
  // runs, srsStates (and therefore getDueItems/buildFreePracticePool) is
  // guaranteed to reflect the answer that was just recorded -- reading it
  // inside handleAnswer itself would race the pending state update and
  // could report the just-answered item as still due.
  useEffect(() => {
    if (!sessionComplete) return;
    let cancelled = false;

    const loadPending = async () => {
      const [due, free] = await Promise.all([getDueItemsRef.current(), buildFreePracticePool()]);
      if (!cancelled) {
        setPendingExtraReview(due);
        setPendingFreePractice(free);
      }
    };
    loadPending();

    return () => {
      cancelled = true;
    };
  }, [sessionComplete, srsStates, buildFreePracticePool]);

  const startFreePractice = () => {
    if (pendingFreePractice.length === 0) return;
    startRound(pendingFreePractice, 'free');
  };

  const startExtraReview = () => {
    if (pendingExtraReview.length === 0) return;
    startRound(pendingExtraReview, 'extra');
  };

  const handleAnswer = (grade: Grade) => {
    const answeredItem = items[currentIndex];
    if (!answeredItem) return;

    const isFree = sessionKind === 'free';
    if (!isFree) {
      recordAnswer(answeredItem.itemId, grade);
    }

    let nextQueue = items;
    let nextCompletedItemIds = completedItemIds;

    if (isFree) {
      // Free practice never grades to real SRS state (ticket #27), so it
      // can never lapse into a same-sitting requeue: every free-round card
      // resolves the instant it's answered.
      if (roundItemIds.has(answeredItem.itemId)) {
        nextCompletedItemIds = new Set(completedItemIds).add(answeredItem.itemId);
      }
    } else {
      const isCorrect = grade === 5;
      const today = getLocalDayKey();
      // Local-day boundary: bookkeeping from a previous day never carries in.
      const baseMap = today === requeueDay ? requeueMap : {};

      // Every other item still waiting on its re-queue gets one item closer
      // to eligibility now that another card has been answered.
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
      // Invariant: an itemId may appear at most once beyond the
      // currently-shown card, so the cap is only spent on retries actually
      // shown (see PR #166/#13 for the duplicate-splice freeze this guards).
      for (const [id, entry] of Object.entries(nextMap)) {
        if (entry.pending && isEligibleForRequeue(entry.itemsSinceLapse, entry.requeuesToday)) {
          const alreadyQueuedAhead = nextQueue.some(
            (q, index) => index > currentIndex && q.itemId === id,
          );
          const item = items.find((q) => q.itemId === id);
          if (item && !alreadyQueuedAhead) {
            nextQueue = [...nextQueue, item];
            nextMap[id] = { ...entry, requeuesToday: entry.requeuesToday + 1, itemsSinceLapse: 0 };
          }
        }
      }

      // A round item ticks the progress display once it stops being pending
      // a re-queue (correct, or the daily cap is spent) -- never on the
      // re-queued attempt itself, so a lapse cannot inflate the numerator by
      // being shown twice.
      const stillPending = nextMap[answeredItem.itemId]?.pending ?? false;
      nextCompletedItemIds =
        !stillPending && roundItemIds.has(answeredItem.itemId)
          ? new Set(completedItemIds).add(answeredItem.itemId)
          : completedItemIds;

      setRequeueMap(nextMap);
      setRequeueDay(today);
    }

    setItems(nextQueue);
    setCompletedItemIds(nextCompletedItemIds);

    if (currentIndex < nextQueue.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      setSessionComplete(true);
    }
  };

  const totalRoundItems = roundItemIds.size;
  const currentItem = items[currentIndex];
  const requeuesSoFar =
    currentItem && sessionKind !== 'free'
      ? (requeueMap[currentItem.itemId]?.requeuesToday ?? 0)
      : 0;
  // Free rounds never grade to real SRS state, so a wrong answer there can
  // never trigger a same-sitting requeue either.
  const willRequeueIfWrong = sessionKind !== 'free' && requeuesSoFar < MAX_REQUEUES_PER_DAY;
  const isRequeueAttempt = sessionKind !== 'free' && requeuesSoFar > 0;
  // Round position never counts a re-queued attempt as a new card, so a
  // lapse cannot make the "N / total" readout look further along than it is.
  const displayedPosition = Math.min(
    completedItemIds.size + (isRequeueAttempt ? 0 : 1),
    totalRoundItems,
  );
  const progressPercent =
    totalRoundItems > 0 ? (completedItemIds.size / totalRoundItems) * 100 : 100;

  if (isLoading || settingsLoading) {
    return (
      <div className="min-h-dvh bg-gradient-to-br from-background via-primary/5 to-accent/10 p-4 flex items-center justify-center">
        <div className="text-center">
          <p className="text-xl text-muted-foreground">Loading practice cards...</p>
        </div>
      </div>
    );
  }

  if (sessionComplete) {
    // "All due cards" is only true for the session that was actually the
    // due queue; a free round records nothing, and an extra-review round
    // that still leaves more extra reviews behind is not "all" of anything.
    // Also never claim the due queue is fully clear directly above a button
    // offering more of it.
    let subtitle: string;
    if (sessionKind === 'free') {
      subtitle =
        "You've completed this free-practice round — nothing here was saved to your progress.";
    } else if (sessionKind === 'extra') {
      subtitle =
        pendingExtraReview.length > 0
          ? "You've completed this round of extra reviews — more are ready."
          : "You've completed your extra reviews for today.";
    } else {
      subtitle =
        pendingExtraReview.length > 0
          ? "You've completed today's due cards — a few more came due while you were practising."
          : "You've completed all due cards for today.";
    }

    return (
      <div className="min-h-dvh bg-gradient-to-br from-background via-primary/5 to-accent/10 p-4 flex items-center justify-center">
        {/* Only celebrate a real finish, not an empty queue on arrival. The
            explicit !isLoading/!settingsLoading guard is redundant with the
            early return above today (this branch is unreachable while
            either is true) but makes the invariant explicit rather than
            relying on branch order, since loadDueItems resolves the round
            asynchronously after that early return has already passed. Per
            the P8 confetti policy, this goal-completion moment is the only
            trigger -- there is no per-answer confetti in PracticeCard, and
            the lapse-recovery trigger this PR originally shipped was
            removed as dead code (failedItemIds could never be populated;
            see commit 0e1fc55) pending a real relearning-queue state. */}
        <ConfettiEffect trigger={!isLoading && !settingsLoading && totalRoundItems > 0} />
        <div className="w-full max-w-2xl text-center space-y-6">
          {isReadOnly && <ReadOnlyBanner />}
          <h1 className="text-5xl font-bold text-primary">Great work! 🎉</h1>
          <p className="text-xl text-muted-foreground">{subtitle}</p>
          <div className="flex flex-col items-center gap-3">
            <Button
              onClick={startFreePractice}
              size="lg"
              variant="secondary"
              className="text-lg px-8 py-6 w-full max-w-xs"
              disabled={pendingFreePractice.length === 0}
            >
              Keep practising
            </Button>
            {pendingExtraReview.length > 0 && (
              <Button
                onClick={startExtraReview}
                size="lg"
                className="text-lg px-8 py-6 w-full max-w-xs"
              >
                Extra reviews ({pendingExtraReview.length})
              </Button>
            )}
            <Button
              onClick={() => {
                // Leaving a free round should never leave sessionKind stuck
                // on 'free': if this component were ever kept mounted
                // across navigation, a later 'due'/'extra' session would
                // silently skip recordAnswer under handleAnswer's `sessionKind
                // !== 'free'` guard.
                setSessionKind('due');
                navigate('/');
              }}
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

  if (items.length === 0 || !currentItem) {
    return null;
  }

  return (
    <div className="min-h-dvh bg-gradient-to-br from-background via-primary/5 to-accent/10 p-4">
      {/* Header */}
      <div className="max-w-2xl mx-auto mb-6 space-y-4">
        {isReadOnly && <ReadOnlyBanner />}
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate('/')} className="gap-2 h-11">
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-muted-foreground">
              {displayedPosition} / {totalRoundItems}
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

        <Progress value={progressPercent} className="h-3 bg-muted-foreground" />
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
          willRequeueIfWrong={willRequeueIfWrong}
          repetitions={srsStates[currentItem.itemId]?.repetitions ?? 0}
          onAnswer={handleAnswer}
        />
      </div>
    </div>
  );
}
