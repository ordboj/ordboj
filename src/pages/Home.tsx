import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { BookOpen, Settings, Trophy } from 'lucide-react';
import { useSrsProgress } from '@/hooks/useSrsProgress';
import { useSettings } from '@/hooks/useSettings';
import { loadVoices } from '@/lib/speech';
import { getVerbs } from '@/lib/verbs';

export default function Home() {
  const navigate = useNavigate();
  const { settings, isLoading: settingsLoading, updateSettings } = useSettings();
  const { getDueItems, isLoading } = useSrsProgress(settings.cefrLevels);
  const [dueCount, setDueCount] = useState(0);
  const [totalVerbs, setTotalVerbs] = useState(0);
  
  const allLevels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  const [rangeValues, setRangeValues] = useState<number[]>([0, 5]); // Start and end indices

  useEffect(() => {
    loadVoices();
  }, []);

  // Initialize range from settings
  useEffect(() => {
    if (settings.cefrLevels.length > 0) {
      const sortedSelected = [...settings.cefrLevels].sort();
      const startIdx = allLevels.indexOf(sortedSelected[0]);
      const endIdx = allLevels.indexOf(sortedSelected[sortedSelected.length - 1]);
      setRangeValues([startIdx, endIdx]);
    }
  }, []);

  // Update verb count when range changes
  useEffect(() => {
    const countVerbs = async () => {
      const allVerbs = await getVerbs();
      const selectedLevels = allLevels.slice(rangeValues[0], rangeValues[1] + 1);
      const filteredVerbs = allVerbs.filter(
        verb => verb.cefr && selectedLevels.includes(verb.cefr)
      );
      setTotalVerbs(filteredVerbs.length);
    };
    countVerbs();
  }, [rangeValues]);

  useEffect(() => {
    const loadDueCount = async () => {
      if (!isLoading && !settingsLoading) {
        const items = await getDueItems();
        setDueCount(items.length);
      }
    };
    loadDueCount();
  }, [isLoading, settingsLoading, getDueItems]);

  const handleRangeChange = (values: number[]) => {
    setRangeValues(values);
    const selectedLevels = allLevels.slice(values[0], values[1] + 1);
    updateSettings({ cefrLevels: selectedLevels });
  };

  const getSelectedLevelsText = () => {
    if (rangeValues[0] === rangeValues[1]) {
      return allLevels[rangeValues[0]];
    }
    return `${allLevels[rangeValues[0]]} – ${allLevels[rangeValues[1]]}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-accent/10 p-4 flex flex-col items-center justify-center">
      <div className="w-full max-w-2xl space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-5xl font-bold text-primary mb-2">
            Svenska Verb
          </h1>
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
          </CardHeader>
          <CardContent className="space-y-6">
            {/* CEFR Level Range Slider */}
            <div className="space-y-4 px-2">
              <div className="space-y-2">
                <p className="text-sm font-medium text-center">
                  Select Difficulty Range: <span className="text-primary font-bold">{getSelectedLevelsText()}</span>
                </p>
                <div className="flex items-center gap-4 pt-2">
                  <span className="text-xs font-medium text-muted-foreground w-8">{allLevels[0]}</span>
                  <Slider
                    value={rangeValues}
                    onValueChange={handleRangeChange}
                    min={0}
                    max={5}
                    step={1}
                    minStepsBetweenThumbs={0}
                    className="flex-1"
                  />
                  <span className="text-xs font-medium text-muted-foreground w-8 text-right">{allLevels[5]}</span>
                </div>
              </div>
              
              <div className="text-center space-y-1 pt-2">
                <p className="text-sm text-muted-foreground">
                  {totalVerbs} verbs in selected range
                </p>
                <p className="text-lg font-semibold text-primary">
                  {dueCount > 0 ? (
                    <span>{dueCount} cards due for review</span>
                  ) : (
                    <span className="text-muted-foreground">All caught up! Great work! 🎉</span>
                  )}
                </p>
              </div>
            </div>

            <Button
              onClick={() => navigate('/practice')}
              className="w-full py-8 text-2xl font-bold shadow-lg hover:shadow-xl transition-all"
              size="lg"
              disabled={isLoading || settingsLoading || dueCount === 0}
            >
              {isLoading || settingsLoading ? 'Loading...' : dueCount > 0 ? 'Start Practice' : 'No Cards Due'}
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
          <Card className="cursor-pointer hover:shadow-lg transition-shadow">
            <CardHeader className="text-center">
              <Trophy className="w-8 h-8 mx-auto text-accent mb-2" />
              <CardTitle className="text-lg">Progress</CardTitle>
              <CardDescription>
                Track your learning
              </CardDescription>
            </CardHeader>
          </Card>

          <Card
            className="cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => navigate('/settings')}
          >
            <CardHeader className="text-center">
              <Settings className="w-8 h-8 mx-auto text-primary mb-2" />
              <CardTitle className="text-lg">Settings</CardTitle>
              <CardDescription>
                Customize your practice
              </CardDescription>
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
