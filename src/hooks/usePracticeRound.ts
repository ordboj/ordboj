import { useEffect, useState } from 'react';
import { getAuthSnapshot } from '@/lib/auth/session';
import {
  createRoundTracker,
  flushPracticeEvents,
  installPracticeEventListeners,
  loadPracticeEventPreference,
  type PracticeSurface,
  type RoundTracker,
} from '@/lib/practiceEvents';

/**
 * One practice surface, one open round. Events stay in memory until the
 * round ends, the page hides, or this screen unmounts.
 */
export function usePracticeRound(surface: PracticeSurface): RoundTracker {
  const [tracker] = useState<RoundTracker>(() => createRoundTracker(surface));

  useEffect(() => {
    installPracticeEventListeners();
    const snap = getAuthSnapshot();
    if (snap.status === 'authenticated' && !snap.offline) {
      void loadPracticeEventPreference();
    }
    return () => {
      flushPracticeEvents();
    };
  }, []);

  return tracker;
}
