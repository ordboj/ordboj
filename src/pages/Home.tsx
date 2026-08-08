import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { BookOpen, Settings, Trophy, Volume2, VolumeX } from 'lucide-react';
import { useSrsProgress } from '@/hooks/useSrsProgress';
import { useSettings } from '@/hooks/useSettings';
import { loadVoices } from '@/lib/speech';
import { getVerbs } from '@/lib/verbs';

export default function Home() {
  const navigate = useNavigate();
  const { settings, isLoading: settingsLoading, updateSettings } = useSettings();
  const { getDueItems, isLoading } = useSrsProgress(settings.cefrLevels);
  const [dueCount, setDueCount] = useState(0);
  const [selectedLevels, setSelectedLevels] = useState<string[]>(settings.cefrLevels);
  const [totalVerbs, setTotalVerbs] = useState(0);

  useEffect(() => {
    loadVoices();
  }, []);

  useEffect(() => {
    setSelectedLevels(settings.cefrLevels);
  }, [settings.cefrLevels]);

  useEffect(() => {
    const loadDueCount = async () => {
      if (!isLoading && !settingsLoading) {
        const items = await getDueItems();
        setDueCount(items.length);
      }
    };
    loadDueCount();
  }, [isLoading, settingsLoading, getDueItems, settings.cefrLevels]);

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

  const handleLevelToggle = (level: string, checked: boolean) => {
    const newLevels = checked
      ? [...selectedLevels, level]
      : selectedLevels.filter((l) => l !== level);

    if (newLevels.length === 0) return; // Prevent unselecting all

    setSelectedLevels(newLevels);
    updateSettings({ cefrLevels: newLevels });
  };

  const allLevels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

  return (
    <div className="min-h-dvh bg-gradient-to-br from-background via-primary/5 to-accent/10 p-4 flex flex-col items-center justify-center">
      <div className="w-full max-w-2xl space-y-6">
        {/* Header */}
        <div className="text-center space-y-2 relative">
          <Button
            variant="outline"
            size="icon"
            className="absolute right-0 top-0"
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
            <CardDescription className="text-lg space-y-1">
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
            </CardDescription>
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
                  : `Selected: ${selectedLevels.sort().join(', ')}`}
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

        {/* Stats & Settings */}
        <div className="grid grid-cols-2 gap-4">
          <Card
            className="cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => navigate('/progress')}
          >
            <CardHeader className="text-center">
              <Trophy className="w-8 h-8 mx-auto text-accent mb-2" />
              <CardTitle className="text-lg">Progress</CardTitle>
              <CardDescription>Track your learning</CardDescription>
            </CardHeader>
          </Card>

          <Card
            className="cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => navigate('/settings')}
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
