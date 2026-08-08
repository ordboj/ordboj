import { useState, useEffect } from 'react';
import { toast } from '@/hooks/use-toast';

export interface Settings {
  practiceMode: 'typing' | 'multiple-choice';
  showExamples: boolean;
  autoplayAudio: boolean;
  muteAudio: boolean;
  dailyGoal: number;
  cefrLevels: string[];
}

const DEFAULT_SETTINGS: Settings = {
  practiceMode: 'typing',
  showExamples: false,
  autoplayAudio: true,
  muteAudio: false,
  dailyGoal: 20,
  cefrLevels: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
};

const STORAGE_KEY = 'swedish-verbs-settings';

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(stored) });
      } catch (e) {
        console.error('Failed to load settings', e);
      }
    }
    setIsLoading(false);
  }, []);

  // Persist to localStorage whenever settings change. Kept out of
  // updateSettings's setState updater (below) rather than inline: a setState
  // updater must stay pure, since React may invoke it more than once per
  // commit (e.g. StrictMode's double-invoke), which would double-fire the
  // toast on failure. Living in its own effect, the write - and the toast
  // below - run exactly once per committed settings change.
  useEffect(() => {
    if (!isLoading) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      } catch (e) {
        // Quota or storage failure: keep the in-memory session alive; the
        // next successful write persists the full current settings anyway.
        // Surface it, though - the in-memory state has now diverged from
        // storage and a silent failure here is how progress quietly
        // disappears (see issue #138).
        console.error('Failed to save settings', e);
        toast({
          title: 'Settings not saved',
          description:
            "Your latest setting could not be saved to this device's storage. It's still in effect for this session, but free up storage soon or it may be lost.",
          variant: 'destructive',
        });
      }
    }
  }, [settings, isLoading]);

  const updateSettings = (newSettings: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...newSettings }));
  };

  return { settings, updateSettings, isLoading };
}
