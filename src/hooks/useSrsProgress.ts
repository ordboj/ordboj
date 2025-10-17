import { useState, useEffect, useCallback } from 'react';
import { SrsState, initializeSrsState, calculateNextReview, isDue, Grade } from '@/lib/srs';
import { getVerbs, Form, Verb, conjugateVerb } from '@/lib/verbs';

const STORAGE_KEY = 'swedish-verbs-srs-progress';

interface PracticeItem {
  verbId: string;
  infinitive: string;
  form: Form;
  itemId: string;
}

export function useSrsProgress(cefrLevels?: string[]) {
  const [srsStates, setSrsStates] = useState<Record<string, SrsState>>({});
  const [isLoading, setIsLoading] = useState(true);

  // Load from localStorage and initialize
  useEffect(() => {
    const initializeStates = async () => {
      const stored = localStorage.getItem(STORAGE_KEY);
      let loadedStates: Record<string, SrsState> = {};
      
      if (stored) {
        try {
          loadedStates = JSON.parse(stored);
        } catch (e) {
          console.error('Failed to parse SRS data', e);
        }
      }
      
      // Initialize all verb+form combinations if they don't exist
      const forms: Form[] = ["presens", "preteritum", "supinum", "imperativ"];
      const newStates: Record<string, SrsState> = { ...loadedStates };
      
      const verbs = await getVerbs();
      verbs.forEach(verb => {
        forms.forEach(form => {
          const itemId = `${verb.id}-${form}`;
          if (!newStates[itemId]) {
            newStates[itemId] = initializeSrsState(itemId);
          }
        });
      });

      setSrsStates(newStates);
      setIsLoading(false);
    };

    initializeStates();
  }, []);

  // Save to localStorage
  useEffect(() => {
    if (!isLoading) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(srsStates));
    }
  }, [srsStates, isLoading]);

  // Force refresh all items (useful for debugging)
  const initializeAllItems = () => {
    // This is now handled in the initial useEffect
    // But we keep this function for backward compatibility
    return;
  };

  // Get due items (randomized and filtered by CEFR level)
  const getDueItems = useCallback(async (): Promise<PracticeItem[]> => {
    const forms: Form[] = ["presens", "preteritum", "supinum", "imperativ"];
    const dueItems: PracticeItem[] = [];

    const allVerbs = await getVerbs();
    // Filter verbs by CEFR level if specified
    const verbs = cefrLevels && cefrLevels.length > 0
      ? allVerbs.filter(verb => verb.cefr && cefrLevels.includes(verb.cefr))
      : allVerbs;

    // Check each verb's forms for availability
    for (const verb of verbs) {
      const conjugated = await conjugateVerb(verb.infinitive);
      
      for (const form of forms) {
        // Skip forms that are not available
        if (conjugated[form] === "(not available)" || !conjugated[form]) {
          continue;
        }
        
        const itemId = `${verb.id}-${form}`;
        const state = srsStates[itemId];
        if (state && isDue(state)) {
          dueItems.push({
            verbId: verb.id,
            infinitive: verb.infinitive,
            form,
            itemId,
          });
        }
      }
    }

    // Shuffle the items using Fisher-Yates algorithm
    for (let i = dueItems.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [dueItems[i], dueItems[j]] = [dueItems[j], dueItems[i]];
    }

    return dueItems;
  }, [srsStates, cefrLevels]);

  // Record answer
  const recordAnswer = (itemId: string, grade: Grade) => {
    const currentState = srsStates[itemId] || initializeSrsState(itemId);
    const newState = calculateNextReview(currentState, grade);
    setSrsStates(prev => ({
      ...prev,
      [itemId]: newState,
    }));
  };

  // Export/Import for backup
  const exportData = () => {
    return JSON.stringify(srsStates, null, 2);
  };

  const importData = (jsonString: string) => {
    try {
      const imported = JSON.parse(jsonString);
      setSrsStates(imported);
      return true;
    } catch (e) {
      console.error('Failed to import data', e);
      return false;
    }
  };

  // Reset all progress
  const resetProgress = () => {
    setSrsStates({});
  };

  return {
    srsStates,
    isLoading,
    initializeAllItems,
    getDueItems,
    recordAnswer,
    exportData,
    importData,
    resetProgress,
  };
}
