import { useState, useEffect, useRef, useCallback } from 'react';
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
        setItems(due);
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
    setItems(pendingFreePractice);
    setCurrentIndex(0);
    setSessionKind('free');
    setSessionComplete(false);
  };

  const startExtraReview = () => {
    if (pendingExtraReview.length === 0) return;
    setItems(pendingExtraReview);
    setCurrentIndex(0);
    setSessionKind('extra');
    setSessionComplete(false);
  };

  const handleAnswer = (grade: Grade) => {
    const currentItem = items[currentIndex];
    if (sessionKind !== 'free') {
      recordAnswer(currentItem.itemId, grade);
    }

    if (currentIndex < items.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      setSessionComplete(true);
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
      <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-accent/10 p-4 flex items-center justify-center">
        <div className="w-full max-w-2xl text-center space-y-6">
          <h1 className="text-5xl font-bold text-primary">Great Work! 🎉</h1>
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
