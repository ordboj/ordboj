import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
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
import { ArrowLeft, Download, Upload, Trash2, Sun, Moon, Monitor } from 'lucide-react';
import { useSettings } from '@/hooks/useSettings';
import { useSrsProgress } from '@/hooks/useSrsProgress';
import { toast } from 'sonner';

export default function Settings() {
  const navigate = useNavigate();
  const { settings, updateSettings } = useSettings();
  const { exportData, importData, resetProgress } = useSrsProgress();
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const { theme, setTheme } = useTheme();
  // next-themes only knows the resolved theme after mount (it reads
  // localStorage/matchMedia client-side); guard the trigger's value so we
  // never render a value the Select doesn't recognize during that gap.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

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

  const handleReset = () => {
    if (showResetConfirm) {
      resetProgress();
      toast.success('All progress has been reset');
      setShowResetConfirm(false);
    } else {
      setShowResetConfirm(true);
      setTimeout(() => setShowResetConfirm(false), 5000);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-accent/10 p-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate('/')} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
          <h1 className="text-3xl font-bold text-primary">Settings</h1>
        </div>

        {/* Appearance */}
        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>Choose how Ordböj looks</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="theme">Theme</Label>
              <Select
                value={mounted ? (theme ?? 'system') : 'system'}
                onValueChange={(value: 'light' | 'dark' | 'system') => setTheme(value)}
              >
                <SelectTrigger id="theme">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">
                    <span className="flex items-center gap-2">
                      <Sun className="w-4 h-4" />
                      Light
                    </span>
                  </SelectItem>
                  <SelectItem value="dark">
                    <span className="flex items-center gap-2">
                      <Moon className="w-4 h-4" />
                      Dark
                    </span>
                  </SelectItem>
                  <SelectItem value="system">
                    <span className="flex items-center gap-2">
                      <Monitor className="w-4 h-4" />
                      System
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

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
              <Switch
                id="show-examples"
                checked={settings.showExamples}
                onCheckedChange={(checked) => updateSettings({ showExamples: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="autoplay-audio">Autoplay pronunciation</Label>
              <Switch
                id="autoplay-audio"
                checked={settings.autoplayAudio}
                onCheckedChange={(checked) => updateSettings({ autoplayAudio: checked })}
              />
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

            <Button
              variant="destructive"
              className="w-full justify-start gap-2"
              onClick={handleReset}
            >
              <Trash2 className="w-4 h-4" />
              {showResetConfirm ? 'Click again to confirm reset' : 'Reset All Progress'}
            </Button>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground">
          All data is stored locally on your device
        </p>
      </div>
    </div>
  );
}
