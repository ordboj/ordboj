import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { BookOpen, Puzzle, Settings, Trophy, Volume2, VolumeX } from 'lucide-react';
import { useSrsProgress } from '@/hooks/useSrsProgress';
import { useSettings } from '@/hooks/useSettings';
import { loadVoices } from '@/lib/speech';
import { getVerbs } from '@/lib/verbs';
import { PARTICLE_DAILY_GOAL_DEFAULT } from '@/lib/particleQueue';

export default function Home() {
  const navigate = useNavigate();
  const { settings, isLoading: settingsLoading, updateSettings } = useSettings();
  const { getDueItems, getParticleSitting, particleReviewsDue, isLoading } = useSrsProgress(
    settings.cefrLevels,
  );
  const [dueCount, setDueCount] = useState(0);
  const selectedLevels = settings.cefrLevels;
  const [totalVerbs, setTotalVerbs] = useState(0);

  useEffect(() => {
    loadVoices();
  }, []);

  // getDueItems is recreated whenever srsStates changes, which happens
  // continuously while a practice session elsewhere updates progress. Keep
  // the latest reference in a ref so this effect only recomputes the due
  // count in response to real changes (data ready, or the user changing
  // CEFR levels), not on every incidental identity churn.
  const getDueItemsRef = useRef(getDueItems);
  useEffect(() => {
    getDueItemsRef.current = getDueItems;
  }, [getDueItems]);

  useEffect(() => {
    const loadDueCount = async () => {
      if (!isLoading && !settingsLoading) {
        const items = await getDueItemsRef.current();
        setDueCount(items.length);
      }
    };
    loadDueCount();
  }, [isLoading, settingsLoading, settings.cefrLevels]);

  useEffect(() => {
    const loadVerbCount = async () => {
      const allVerbs = await getVerbs();
      const filteredVerbs = allVerbs.filter(
        (verb) => verb.cefr && selectedLevels.includes(verb.cefr),
      );
      setTotalVerbs(filteredVerbs.length);
    };
    loadVerbCount();
  }, [selectedLevels]);

  // Particle mode's own count, separate from the conjugation due count by
  // design: it is a separate queue with a separate goal, and folding the two
  // numbers together would hide which one the learner still owes.
  //
  // "Ready" counts more than reviews: a learner with nothing due may still
  // have new verbs unlocked today, and a badge reading 0 next to an entry
  // point that has work behind it is a lie.
  const particleCardsReady = useMemo(
    () => getParticleSitting(PARTICLE_DAILY_GOAL_DEFAULT).cards.length,
    [getParticleSitting],
  );

  const handleLevelToggle = (level: string, checked: boolean) => {
    const newLevels = checked
      ? [...selectedLevels, level]
      : selectedLevels.filter((l) => l !== level);

    if (newLevels.length === 0) return; // Prevent unselecting all

    updateSettings({ cefrLevels: newLevels });
  };

  const allLevels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-accent/10 p-4 flex flex-col items-center justify-center">
      <div className="w-full max-w-2xl space-y-6">
        {/* Header */}
        <div className="text-center space-y-2 relative">
          <Button
            variant="outline"
            size="icon"
            className="absolute right-0 top-0 h-11 w-11"
            aria-label={settings.muteAudio ? 'Unmute audio' : 'Mute audio'}
            onClick={() => updateSettings({ muteAudio: !settings.muteAudio })}
          >
            {settings.muteAudio ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </Button>
          <h1 className="text-5xl font-bold text-primary mb-2">Ordböj</h1>
          <p className="text-xl text-muted-foreground">
            Master Swedish verbs with spaced repetition
          </p>
        </div>

        {/* Main Practice Card */}
        <Card className="shadow-2xl border-2 border-primary/20">
          <CardHeader className="text-center pb-4">
            <CardTitle className="text-3xl flex items-center justify-center gap-2">
              <BookOpen className="w-8 h-8 text-primary" />
              Ready to Practice?
            </CardTitle>
            <div className="text-muted-foreground text-lg space-y-1">
              {dueCount > 0 ? (
                <>
                  <div className="text-primary font-semibold">
                    {dueCount} conjugations due for review
                  </div>
                  <div className="text-muted-foreground text-sm">
                    from {totalVerbs} verbs in selected levels
                  </div>
                </>
              ) : (
                <span>All caught up! Great work! 🎉</span>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* CEFR Level Selector */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Select Difficulty Levels:</Label>
              <div className="grid grid-cols-3 gap-3">
                {allLevels.map((level) => (
                  <div
                    key={level}
                    className="flex items-center space-x-2 p-3 rounded-lg border bg-card hover:bg-accent/5 transition-colors"
                  >
                    <Checkbox
                      id={`home-cefr-${level}`}
                      checked={selectedLevels.includes(level)}
                      onCheckedChange={(checked) => handleLevelToggle(level, checked as boolean)}
                    />
                    <Label
                      htmlFor={`home-cefr-${level}`}
                      className="text-sm font-medium cursor-pointer flex-1"
                    >
                      {level}
                    </Label>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground text-center">
                {selectedLevels.length === allLevels.length
                  ? 'All levels selected'
                  : `Selected: ${[...selectedLevels].sort().join(', ')}`}
              </p>
            </div>

            <Button
              onClick={() => navigate('/practice')}
              className="w-full py-8 text-2xl font-bold shadow-lg hover:shadow-xl transition-all"
              size="lg"
              disabled={isLoading || settingsLoading || dueCount === 0}
            >
              {isLoading || settingsLoading
                ? 'Loading...'
                : dueCount > 0
                  ? 'Start Practice'
                  : 'No Cards Due'}
            </Button>

            {dueCount === 0 && (
              <p className="text-center text-sm text-muted-foreground">
                Come back later for more practice
              </p>
            )}
          </CardContent>
        </Card>

        {/* Particle verbs — a separate mode with its own queue and its own
            goal, so it gets its own entry point and its own count rather
            than a slice of the conjugation numbers above. */}
        <Card className="shadow-lg border-2 border-accent/20">
          <CardHeader className="text-center pb-3">
            <CardTitle className="text-2xl flex items-center justify-center gap-2">
              <Puzzle className="w-6 h-6 text-accent" />
              Particle verbs
            </CardTitle>
            <CardDescription className="text-base">
              {particleReviewsDue > 0
                ? `${particleReviewsDue} due for review`
                : particleCardsReady > 0
                  ? 'New verbs ready to learn'
                  : 'Unlocks as you learn the base verbs'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => navigate('/practice-particles')}
              variant="secondary"
              className="w-full py-6 text-lg font-semibold"
              disabled={isLoading || settingsLoading || particleCardsReady === 0}
            >
              {particleCardsReady > 0 ? 'Practise particle verbs' : 'Nothing ready yet'}
            </Button>
          </CardContent>
        </Card>

        {/* Stats & Settings */}
        <div className="grid grid-cols-2 gap-4">
          <Card
            role="button"
            tabIndex={0}
            className="cursor-pointer hover:shadow-lg transition-shadow focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            onClick={() => navigate('/progress')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                navigate('/progress');
              }
            }}
          >
            <CardHeader className="text-center">
              <Trophy className="w-8 h-8 mx-auto text-accent mb-2" />
              <CardTitle className="text-lg">Progress</CardTitle>
              <CardDescription>Track your learning</CardDescription>
            </CardHeader>
          </Card>

          <Card
            role="button"
            tabIndex={0}
            className="cursor-pointer hover:shadow-lg transition-shadow focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            onClick={() => navigate('/settings')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                navigate('/settings');
              }
            }}
          >
            <CardHeader className="text-center">
              <Settings className="w-8 h-8 mx-auto text-primary mb-2" />
              <CardTitle className="text-lg">Settings</CardTitle>
              <CardDescription>Customize your practice</CardDescription>
            </CardHeader>
          </Card>
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-muted-foreground">
          Practicing Swedish verbs with confidence ✨
        </p>
      </div>
    </div>
  );
}
