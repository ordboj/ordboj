import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { ArrowLeft, Download, Upload, Trash2 } from 'lucide-react';
import { reloadSettingsFromStorage, useSettings } from '@/hooks/useSettings';
import { useSrsProgress } from '@/hooks/useSrsProgress';
import {
  PARTICLE_DAILY_GOAL_MAX,
  PARTICLE_DAILY_GOAL_MIN,
  PARTICLE_ITEMS_PER_MINUTE,
} from '@/lib/particleQueue';
import { toast } from 'sonner';

export default function Settings() {
  const navigate = useNavigate();
  const { settings, updateSettings } = useSettings();
  const { exportData, importData, resetProgress } = useSrsProgress();

  // Held as a draft string so the field can be cleared and retyped. A
  // controlled number input that clamped on every keystroke would make "12"
  // unreachable: the "1" would snap to the minimum of 4 first.
  const [particleGoalDraft, setParticleGoalDraft] = useState(String(settings.particleDailyGoal));
  useEffect(() => {
    setParticleGoalDraft(String(settings.particleDailyGoal));
  }, [settings.particleDailyGoal]);

  const commitParticleGoal = () => {
    const parsed = Number.parseInt(particleGoalDraft, 10);
    if (Number.isNaN(parsed)) {
      setParticleGoalDraft(String(settings.particleDailyGoal));
      return;
    }
    const clamped = Math.min(PARTICLE_DAILY_GOAL_MAX, Math.max(PARTICLE_DAILY_GOAL_MIN, parsed));
    setParticleGoalDraft(String(clamped));
    updateSettings({ particleDailyGoal: clamped });
  };

  const handleExport = () => {
    const data = exportData();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ordboj-backup-${Date.now()}.json`;
    a.click();
    toast.success('Progress exported successfully!');
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const content = e.target?.result as string;
          if (importData(content)) {
            // A whole-app backup restores the settings store by writing
            // localStorage directly (src/lib/backup.ts), bypassing
            // updateSettings. Without this, the screen keeps showing the
            // pre-import settings until a reload, and the next preference
            // change would spread over that stale snapshot and revert every
            // other imported field.
            reloadSettingsFromStorage();
            toast.success('Progress imported successfully!');
          } else {
            toast.error('Failed to import data');
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  const handleConfirmReset = () => {
    resetProgress();
    toast.success('All progress has been reset');
  };

  return (
    <div className="min-h-dvh bg-gradient-to-br from-background via-primary/5 to-accent/10 p-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate('/')} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
          <h1 className="text-3xl font-bold text-primary">Settings</h1>
        </div>

        {/* Practice Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Practice Settings</CardTitle>
            <CardDescription>Customize your learning experience</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="practice-mode">Practice Mode</Label>
              <Select
                value={settings.practiceMode}
                onValueChange={(value: 'typing' | 'multiple-choice') =>
                  updateSettings({ practiceMode: value })
                }
              >
                <SelectTrigger id="practice-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="typing">Typing</SelectItem>
                  <SelectItem value="multiple-choice">Multiple Choice</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="show-examples">Show example sentences</Label>
              {/* Switch itself is h-6 (24px) from generated ui/switch.tsx. The
                  native label wrapper below grows the clickable box to the
                  44px minimum touch target without touching that file — a
                  click anywhere in the label's box forwards to the switch
                  button (a labelable element), and the browser suppresses
                  the double-fire when the click lands on the button itself. */}
              <label
                htmlFor="show-examples"
                className="flex min-h-11 min-w-11 items-center justify-center cursor-pointer"
              >
                <Switch
                  id="show-examples"
                  checked={settings.showExamples}
                  onCheckedChange={(checked) => updateSettings({ showExamples: checked })}
                />
              </label>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="autoplay-audio">Autoplay pronunciation</Label>
              {/* Same 44px label-wrapper pattern as show-examples above. */}
              <label
                htmlFor="autoplay-audio"
                className="flex min-h-11 min-w-11 items-center justify-center cursor-pointer"
              >
                <Switch
                  id="autoplay-audio"
                  checked={settings.autoplayAudio}
                  onCheckedChange={(checked) => updateSettings({ autoplayAudio: checked })}
                />
              </label>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="auto-read-all-forms">Read all forms automatically</Label>
                {/* Same 44px label-wrapper pattern as show-examples above. */}
                <label
                  htmlFor="auto-read-all-forms"
                  className="flex min-h-11 min-w-11 items-center justify-center cursor-pointer"
                >
                  <Switch
                    id="auto-read-all-forms"
                    checked={settings.autoReadAllForms}
                    onCheckedChange={(checked) => updateSettings({ autoReadAllForms: checked })}
                  />
                </label>
              </div>
              <p className="text-xs text-muted-foreground">
                When on, opening a verb's details reads every form aloud by itself. That is
                different from tapping a form to hear just it, and from Autoplay pronunciation
                above, which only plays audio after you answer a practice question correctly.
              </p>
            </div>

            <div className="space-y-3">
              <Label>CEFR Levels to Practice</Label>
              <div className="grid grid-cols-2 gap-3">
                {['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((level) => (
                  <div key={level} className="flex items-center space-x-2">
                    <Checkbox
                      id={`cefr-${level}`}
                      checked={settings.cefrLevels.includes(level)}
                      onCheckedChange={(checked) => {
                        const newLevels = checked
                          ? [...settings.cefrLevels, level]
                          : settings.cefrLevels.filter((l) => l !== level);
                        if (newLevels.length === 0) return; // Prevent unselecting all
                        updateSettings({ cefrLevels: newLevels });
                      }}
                    />
                    <Label
                      htmlFor={`cefr-${level}`}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      {level}
                    </Label>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Select which difficulty levels you want to practice. At least one level must be
                selected.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Particle verbs */}
        <Card>
          <CardHeader>
            <CardTitle>Particle verbs</CardTitle>
            <CardDescription>A separate queue with its own daily budget</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="particle-daily-goal">Particle cards per day</Label>
              <Input
                id="particle-daily-goal"
                type="number"
                inputMode="numeric"
                min={PARTICLE_DAILY_GOAL_MIN}
                max={PARTICLE_DAILY_GOAL_MAX}
                value={particleGoalDraft}
                onChange={(e) => setParticleGoalDraft(e.target.value)}
                onBlur={commitParticleGoal}
                onKeyDown={(e) => e.key === 'Enter' && commitParticleGoal()}
                className="max-w-32"
              />
              <p className="text-xs text-muted-foreground">
                Between {PARTICLE_DAILY_GOAL_MIN} and {PARTICLE_DAILY_GOAL_MAX} cards — roughly{' '}
                {Math.max(1, Math.round(settings.particleDailyGoal / PARTICLE_ITEMS_PER_MINUTE))}{' '}
                minutes. This is extra time on top of your conjugation practice, and it does not
                change what a day of practice requires.
              </p>
            </div>

            {/* CC BY-NC-SA 4.0 requires attribution reasonable to the medium.
                App users never see the repo, so the notice has to be in the
                app itself, not only in docs/research/svalex/. */}
            <div className="border-t pt-4 space-y-1">
              <p className="text-xs text-muted-foreground">
                Particle-verb difficulty levels are derived from SVALex and SweLLex (CEFRLex
                project, UCLouvain and Språkbanken), used under CC BY-NC-SA 4.0. The levels are our
                own reading of that data, not an official CEFR classification.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Data Management */}
        <Card>
          <CardHeader>
            <CardTitle>Data Management</CardTitle>
            <CardDescription>Backup and restore your progress</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button variant="outline" className="w-full justify-start gap-2" onClick={handleExport}>
              <Download className="w-4 h-4" />
              Export Progress
            </Button>

            <Button variant="outline" className="w-full justify-start gap-2" onClick={handleImport}>
              <Upload className="w-4 h-4" />
              Import Progress
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="w-full justify-start gap-2">
                  <Trash2 className="w-4 h-4" />
                  Reset All Progress
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset all progress?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This deletes all practice progress on this device, and it cannot be undone.
                    Export a backup first if you want to keep it.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2"
                  onClick={handleExport}
                >
                  <Download className="w-4 h-4" />
                  Export Progress
                </Button>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={handleConfirmReset}
                  >
                    Reset All Progress
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground">
          Progress lives only in this browser's storage — clearing site data, switching browsers, or
          a new device loses it for good. Export regularly to keep a backup.
        </p>
      </div>
    </div>
  );
}
