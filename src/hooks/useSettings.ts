import { useState, useEffect } from 'react';
import { readVersioned, writeVersioned } from '@/lib/storage';

export interface Settings {
  practiceMode: 'typing' | 'multiple-choice';
  showExamples: boolean;
  autoplayAudio: boolean;
  muteAudio: boolean;
  interfaceLanguage: 'en' | 'sv';
  dailyGoal: number;
  cefrLevels: string[];
}

const DEFAULT_SETTINGS: Settings = {
  practiceMode: 'typing',
  showExamples: false,
  autoplayAudio: true,
  muteAudio: false,
  interfaceLanguage: 'en',
  dailyGoal: 20,
  cefrLevels: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
};

const STORAGE_KEY = 'swedish-verbs-settings';
const STORAGE_VERSION = 1;

const VALID_CEFR_LEVELS = new Set(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
const VALID_PRACTICE_MODES = new Set(['typing', 'multiple-choice']);
const VALID_INTERFACE_LANGUAGES = new Set(['en', 'sv']);

/**
 * Validate each stored field independently, falling back to
 * DEFAULT_SETTINGS for that field alone when the value is missing, the
 * wrong type, or otherwise invalid. Garbage in one field never propagates
 * into state or takes the rest of the settings down with it.
 */
function sanitizeSettings(raw: unknown): Settings {
  const obj = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};

  const practiceMode =
    typeof obj.practiceMode === 'string' && VALID_PRACTICE_MODES.has(obj.practiceMode)
      ? (obj.practiceMode as Settings['practiceMode'])
      : DEFAULT_SETTINGS.practiceMode;

  const showExamples =
    typeof obj.showExamples === 'boolean' ? obj.showExamples : DEFAULT_SETTINGS.showExamples;

  const autoplayAudio =
    typeof obj.autoplayAudio === 'boolean' ? obj.autoplayAudio : DEFAULT_SETTINGS.autoplayAudio;

  const muteAudio = typeof obj.muteAudio === 'boolean' ? obj.muteAudio : DEFAULT_SETTINGS.muteAudio;

  const interfaceLanguage =
    typeof obj.interfaceLanguage === 'string' &&
    VALID_INTERFACE_LANGUAGES.has(obj.interfaceLanguage)
      ? (obj.interfaceLanguage as Settings['interfaceLanguage'])
      : DEFAULT_SETTINGS.interfaceLanguage;

  const dailyGoal =
    typeof obj.dailyGoal === 'number' && Number.isFinite(obj.dailyGoal) && obj.dailyGoal > 0
      ? obj.dailyGoal
      : DEFAULT_SETTINGS.dailyGoal;

  const cefrLevels =
    Array.isArray(obj.cefrLevels) &&
    obj.cefrLevels.length > 0 &&
    obj.cefrLevels.every(
      (level): level is string => typeof level === 'string' && VALID_CEFR_LEVELS.has(level),
    )
      ? (obj.cefrLevels as string[])
      : DEFAULT_SETTINGS.cefrLevels;

  return {
    practiceMode,
    showExamples,
    autoplayAudio,
    muteAudio,
    interfaceLanguage,
    dailyGoal,
    cefrLevels,
  };
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setSettings(readVersioned(STORAGE_KEY, STORAGE_VERSION, sanitizeSettings));
    setIsLoading(false);
  }, []);

  const updateSettings = (newSettings: Partial<Settings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...newSettings };
      const persisted = writeVersioned(STORAGE_KEY, STORAGE_VERSION, updated);
      if (!persisted) {
        console.warn('Settings could not be saved; continuing with in-memory session only.');
      }
      return updated;
    });
  };

  return { settings, updateSettings, isLoading };
}
