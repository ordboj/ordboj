import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

/**
 * Storage keys duplicated here (read-only) rather than imported, so this
 * boundary never depends on the hooks/modules that might be the cause of
 * the crash it is trying to recover from.
 */
const STORAGE_KEYS = ['swedish-verbs-settings', 'swedish-verbs-srs-progress'] as const;

function safeParse(raw: string | null): unknown {
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    // Store whatever we could read, even if it doesn't parse as JSON -
    // a malformed backup is still strictly better than no backup.
    return raw;
  }
}

/**
 * Reads every known localStorage store and triggers a JSON download.
 * This is the only backup path in the app, so it must never throw: any
 * failure (quota, private mode, DOM unavailable) is swallowed and
 * reported back as a boolean so the caller can show a message instead of
 * crashing a second time inside the crash handler.
 */
export function downloadProgressBackup(): boolean {
  try {
    const payload: Record<string, unknown> = {
      exportedAt: new Date().toISOString(),
      app: 'ordboj',
      backupVersion: 1,
    };

    for (const key of STORAGE_KEYS) {
      payload[key] = safeParse(window.localStorage?.getItem(key) ?? null);
    }

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ordboj-progress-backup-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Deferred: revoking synchronously can cancel the download in flight
    // on some browsers, and this is the only backup path for progress.
    setTimeout(() => URL.revokeObjectURL(url), 0);
    return true;
  } catch (e) {
    console.error('Ordböj: failed to export progress backup', e);
    return false;
  }
}

interface BoundaryProps {
  children: ReactNode;
  fallback: (reset: () => void) => ReactNode;
}

interface BoundaryState {
  hasError: boolean;
}

/**
 * Generic crash-containment boundary. Never suggests clearing storage -
 * a crash is not evidence that the user's saved progress is bad data, and
 * "clear site data" is the one action that guarantees permanent loss.
 */
export class AppErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { hasError: false };

  static getDerivedStateFromError(): BoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Ordböj: caught render error', error, info.componentStack);
  }

  reset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return this.props.fallback(this.reset);
    }
    return this.props.children;
  }
}

function ExportProgressButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      className={
        className ??
        'inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-xs hover:bg-accent hover:text-accent-foreground'
      }
      onClick={() => downloadProgressBackup()}
    >
      Export progress backup
    </button>
  );
}

/**
 * App-level fallback. This boundary sits outside BrowserRouter, so it
 * cannot assume react-router context exists - plain anchors only.
 */
export function AppCrashFallback({ reset }: { reset: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground">
      <div className="w-full max-w-md space-y-4 text-center">
        <h1 className="text-2xl font-bold">Something went wrong</h1>
        <p className="text-muted-foreground">
          Ordböj hit an unexpected error. Your saved progress is still on this device and has not
          been touched. You can try again, or download a backup of your progress first for peace of
          mind.
        </p>
        <div className="flex flex-col gap-2 items-center">
          <ExportProgressButton className="w-full inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-xs hover:bg-accent hover:text-accent-foreground" />
          <button
            type="button"
            className="w-full inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-xs hover:bg-primary/90"
            onClick={reset}
          >
            Try again
          </button>
          <a
            href="/"
            className="w-full inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium underline"
          >
            Reload from the start
          </a>
        </div>
      </div>
    </div>
  );
}

/**
 * Route-level fallback. Rendered inside BrowserRouter, so <Link> keeps
 * navigation to the other routes working without a full page reload -
 * this is what lets a broken Practice screen leave Home/Progress/Settings
 * reachable.
 */
export function RouteCrashFallback({ reset }: { reset: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground">
      <div className="w-full max-w-md space-y-4 text-center">
        <h1 className="text-2xl font-bold">This page hit a snag</h1>
        <p className="text-muted-foreground">
          Something broke on this screen. Your saved progress is untouched - the rest of Ordböj
          still works.
        </p>
        <div className="flex flex-col gap-2 items-center">
          <ExportProgressButton className="w-full inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-xs hover:bg-accent hover:text-accent-foreground" />
          <button
            type="button"
            className="w-full inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-xs hover:bg-primary/90"
            onClick={reset}
          >
            Try again
          </button>
          <nav className="flex gap-4 justify-center pt-2 text-sm">
            <Link to="/" className="underline">
              Home
            </Link>
            <Link to="/progress" className="underline">
              Progress
            </Link>
            <Link to="/settings" className="underline">
              Settings
            </Link>
          </nav>
          <a
            href="/"
            className="w-full inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium underline"
          >
            Reload from the start
          </a>
        </div>
      </div>
    </div>
  );
}

/** Convenience wrapper for per-route usage in App.tsx. */
export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <AppErrorBoundary fallback={(reset) => <RouteCrashFallback reset={reset} />}>
      {children}
    </AppErrorBoundary>
  );
}
