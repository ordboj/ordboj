import { RefreshCw } from 'lucide-react';

/**
 * Shown on a practice surface when useSrsProgress reports isReadOnly: the
 * stored SRS schedule was written by a build newer than this one
 * understands, so the read-only guard in useSrsProgress.ts is refusing to
 * persist anything this session records rather than risk clobbering it.
 * The learner can still practise, but every answer here is disposable
 * until they're back on a build that recognises the store — hence the
 * refresh/update suggestion, which is the only action that actually fixes
 * this (closing the tab does not).
 */
export function ReadOnlyBanner() {
  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-foreground"
    >
      <RefreshCw className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
      <p>
        Your progress from this session won&rsquo;t be saved. Refresh the page or update the app to
        fix this.
      </p>
    </div>
  );
}
