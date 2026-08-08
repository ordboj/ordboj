import { useState, useEffect } from 'react';

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
  // docs/learning/session-shape-and-daily-goal.md: default 10 minutes at 5
  // items/minute. The doc's number wins over issue #26's sketch of 12.
  dailyGoal: 50,
  cefrLevels: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
};

// docs/learning/session-shape-and-daily-goal.md: dailyGoal range 5-120. A
// stored value that is missing, non-numeric, NaN, or out of range coerces
// to the default rather than clamping to a bound: 0 or NaN would otherwise
// soft-brick practice (goal met before the first card).
export const DAILY_GOAL_MIN = 5;
export const DAILY_GOAL_MAX = 120;

function sanitizeDailyGoal(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_SETTINGS.dailyGoal;
  }
  const rounded = Math.round(value);
  if (rounded < DAILY_GOAL_MIN || rounded > DAILY_GOAL_MAX) {
    return DEFAULT_SETTINGS.dailyGoal;
  }
  return rounded;
}

const STORAGE_KEY = 'swedish-verbs-settings';

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const merged = { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
        merged.dailyGoal = sanitizeDailyGoal(merged.dailyGoal);
        setSettings(merged);
      } catch (e) {
        console.error('Failed to load settings', e);
      }
    }
    setIsLoading(false);
  }, []);

  const updateSettings = (newSettings: Partial<Settings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...newSettings };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  return { settings, updateSettings, isLoading };
}
