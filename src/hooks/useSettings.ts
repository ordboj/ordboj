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

  const updateSettings = (newSettings: Partial<Settings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...newSettings };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch (e) {
        // Quota or storage failure: keep the in-memory session alive so the
        // app doesn't degrade further; surface it so the user knows the
        // change may not survive closing the tab.
        console.error('Failed to save settings', e);
        toast({
          title: 'Progress not saved',
          description:
            'Your browser storage is full or unavailable. Recent settings changes may be lost if you close this tab.',
          variant: 'destructive',
        });
      }
      return updated;
    });
  };

  return { settings, updateSettings, isLoading };
}
