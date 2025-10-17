import { useState, useEffect } from 'react';
import { SrsState, initializeSrsState, calculateNextReview, isDue, Grade } from '@/lib/srs';
import { verbs, Form } from '@/lib/verbs';

const STORAGE_KEY = 'swedish-verbs-srs-progress';

interface PracticeItem {
  verbId: string;
  infinitive: string;
  form: Form;
  itemId: string;
}

export function useSrsProgress() {
  const [srsStates, setSrsStates] = useState<Record<string, SrsState>>({});
  const [isLoading, setIsLoading] = useState(true);

  // Load from localStorage and initialize
  useEffect(() => {
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
    let hasChanges = false;

    verbs.forEach(verb => {
      forms.forEach(form => {
        const itemId = `${verb.id}-${form}`;
        if (!newStates[itemId]) {
          newStates[itemId] = initializeSrsState(itemId);
          hasChanges = true;
        }
      });
    });

    setSrsStates(newStates);
    setIsLoading(false);
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

  // Get due items
  const getDueItems = (): PracticeItem[] => {
    const forms: Form[] = ["presens", "preteritum", "supinum", "imperativ"];
    const dueItems: PracticeItem[] = [];

    verbs.forEach(verb => {
      forms.forEach(form => {
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
      });
    });

    return dueItems;
  };

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
