import { useState, useEffect, useRef } from 'react';
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
  // Skips the persist effect's first run after load completes, which fires
  // from the load effect's own setSettings/setIsLoading — not a user edit.
  // Without this, every mount writes (and can toast-fail on) the loaded or
  // default settings for a user who never touched Settings; see #167,
  // closed for exactly this (false toast + baked-in defaults on mount).
  const skipNextPersistRef = useRef(true);

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

  // Persist on real changes only. Pure updater: setState updaters can run
  // more than once per commit (React re-invokes them during render, e.g.
  // StrictMode's double-invoke), so a write or a toast inside the updater
  // itself risks running twice for one user action.
  useEffect(() => {
    if (isLoading) return;
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
      // Quota or storage failure: keep the in-memory session alive so the
      // app doesn't degrade further; surface it so the user knows the
      // change may not survive closing the tab.
      console.error('Failed to save settings', e);
      toast({
        title: 'Settings not saved',
        description:
          'Your browser storage is full or unavailable. Recent settings changes may be lost if you close this tab.',
        variant: 'destructive',
      });
    }
  }, [settings, isLoading]);

  const updateSettings = (newSettings: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...newSettings }));
  };

  return { settings, updateSettings, isLoading };
}
