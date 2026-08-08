import { lazy, type ComponentType } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import {
  AppErrorBoundary,
  AppCrashFallback,
  RouteCrashFallback,
  RouteErrorBoundary,
  RouteChunk,
  downloadProgressBackup,
} from '@/components/AppErrorBoundary';
import { lazyRoute } from '@/lib/utils';

// A component that throws unconditionally, used to exercise the boundary's
// catch path deterministically instead of relying on a real page crashing.
function Boom(): never {
  throw new Error('boom: simulated render crash');
}

// React logs a scary "The above error occurred" console.error for every
// caught render error, and componentDidCatch itself calls console.error.
// That is expected boundary behavior, not a test failure, so it is silenced
// per-test rather than left to spam (and possibly fail on) the real console.
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AppErrorBoundary', () => {
  it('renders children normally when nothing throws', () => {
    render(
      <AppErrorBoundary fallback={(reset) => <AppCrashFallback reset={reset} />}>
        <p>all good</p>
      </AppErrorBoundary>,
    );

    expect(screen.getByText('all good')).toBeInTheDocument();
  });

  it('catches a render error from a descendant and renders the supplied fallback instead of crashing the tree', () => {
    render(
      <AppErrorBoundary fallback={(reset) => <AppCrashFallback reset={reset} />}>
        <Boom />
      </AppErrorBoundary>,
    );

    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    expect(screen.queryByText('all good')).not.toBeInTheDocument();
  });

  it('reset() clears the error state so children render again on retry', () => {
    let renderThrow = true;
    function MaybeBoom() {
      if (renderThrow) throw new Error('boom');
      return <p>recovered</p>;
    }

    render(
      <AppErrorBoundary
        fallback={(reset) => (
          <button
            onClick={() => {
              renderThrow = false;
              reset();
            }}
          >
            retry
          </button>
        )}
      >
        <MaybeBoom />
      </AppErrorBoundary>,
    );

    expect(screen.getByRole('button', { name: 'retry' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'retry' }));
    expect(screen.getByText('recovered')).toBeInTheDocument();
  });
});

// Acceptance criterion (a): the recovery UI must never suggest clearing site
// storage/data, because that is the one action that guarantees permanent
// loss of the user's irreplaceable progress (CLAUDE.md).
describe('fallback UI never suggests clearing storage', () => {
  it('AppCrashFallback contains no clear-storage / clear-data / clear-cache language', () => {
    render(<AppCrashFallback reset={() => {}} />);
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/clear\s+(site\s+)?(storage|data|cache)/i);
    expect(text).not.toMatch(/reset\s+(site\s+)?(storage|data)/i);
  });

  it('RouteCrashFallback contains no clear-storage / clear-data / clear-cache language', () => {
    render(
      <MemoryRouter>
        <RouteCrashFallback reset={() => {}} />
      </MemoryRouter>,
    );
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/clear\s+(site\s+)?(storage|data|cache)/i);
    expect(text).not.toMatch(/reset\s+(site\s+)?(storage|data)/i);
  });
});

// Acceptance criterion (b): the fallback offers an "export progress" action
// directly, and that action must actually produce a downloadable backup of
// whatever is in localStorage right now - not a no-op button.
describe('export progress action', () => {
  const SETTINGS_KEY = 'swedish-verbs-settings';
  const SRS_KEY = 'swedish-verbs-srs-progress';

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ practiceMode: 'typing' }));
    localStorage.setItem(SRS_KEY, JSON.stringify({ '1-presens': { repetitions: 3 } }));

    // jsdom does not implement Blob URLs at all (no URL.createObjectURL /
    // revokeObjectURL), unlike every real browser this app ships to. Stub
    // them onto the global so they exist as spy-able properties; each test
    // below then overrides the implementation it needs via vi.spyOn.
    if (!('createObjectURL' in URL)) {
      Object.defineProperty(URL, 'createObjectURL', {
        value: vi.fn(),
        writable: true,
        configurable: true,
      });
    }
    if (!('revokeObjectURL' in URL)) {
      Object.defineProperty(URL, 'revokeObjectURL', {
        value: vi.fn(),
        writable: true,
        configurable: true,
      });
    }
  });

  it('downloadProgressBackup() bundles every known localStorage store into a downloaded JSON blob, and revokes the blob URL only after deferring past the click (not cancelling the in-flight download)', () => {
    vi.useFakeTimers();
    try {
      const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
      const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

      const ok = downloadProgressBackup();

      expect(ok).toBe(true);
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      const blob = createObjectURL.mock.calls[0]![0] as Blob;
      expect(blob.type).toBe('application/json');
      expect(clickSpy).toHaveBeenCalledTimes(1);

      // The revoke must be deferred past the synchronous click - revoking
      // the object URL before the browser has started the download can
      // cancel it. Confirm it has not fired yet at this point...
      expect(revokeObjectURL).not.toHaveBeenCalled();

      // ...and that it does still fire once the deferral elapses, so the
      // blob URL is not leaked forever either.
      vi.runAllTimers();
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    } finally {
      vi.useRealTimers();
    }
  });

  it('downloadProgressBackup() returns false instead of throwing when the DOM download path fails', () => {
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      throw new Error('blob creation unsupported');
    });

    expect(() => downloadProgressBackup()).not.toThrow();
    expect(downloadProgressBackup()).toBe(false);
  });

  it('AppCrashFallback exposes an "Export progress" action that triggers a download', async () => {
    const user = userEvent.setup();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<AppCrashFallback reset={() => {}} />);

    const exportButton = screen.getByRole('button', { name: /export progress/i });
    await user.click(exportButton);

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('RouteCrashFallback exposes an "Export progress" action that triggers a download', async () => {
    const user = userEvent.setup();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(
      <MemoryRouter>
        <RouteCrashFallback reset={() => {}} />
      </MemoryRouter>,
    );

    const exportButton = screen.getByRole('button', { name: /export progress/i });
    await user.click(exportButton);

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });
});

// Route-level containment: a crash inside one route must leave the other
// routes reachable through the boundary's own navigation, not just after a
// hard reload.
describe('RouteCrashFallback keeps the rest of the app navigable', () => {
  it('offers links to Home, Progress and Settings from the crashed route', () => {
    render(
      <MemoryRouter initialEntries={['/practice']}>
        <RouteErrorBoundary>
          <Boom />
        </RouteErrorBoundary>
      </MemoryRouter>,
    );

    expect(screen.getByText(/this page hit a snag/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Progress' })).toHaveAttribute('href', '/progress');
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings');
  });

  // Escape hatch for when the SPA router state itself is wedged (not just
  // the crashed route's component tree): a plain <a href="/"> forces a full
  // document navigation/reload, unlike a react-router <Link>, which stays
  // within the same (possibly broken) app instance. This was a review
  // blocker for #18, so pin it against silent regression (e.g. someone
  // "helpfully" swapping it for a <Link>).
  it('offers a plain-anchor "Reload from the start" hard-navigation escape hatch to "/"', () => {
    render(
      <MemoryRouter initialEntries={['/practice']}>
        <RouteErrorBoundary>
          <Boom />
        </RouteErrorBoundary>
      </MemoryRouter>,
    );

    const reloadLink = screen.getByRole('link', { name: /reload from the start/i });
    expect(reloadLink).toHaveAttribute('href', '/');
  });
});

// Issue #220 acceptance criterion: React.lazy() caches whatever its factory
// promise resolves *or rejects* to, permanently. RouteChunk pairs with
// retryImport()/lazyRoute() (src/lib/utils.ts) to (a) recover automatically
// from a transient chunk-load failure via backoff before React ever sees a
// rejection, and (b) once retries are truly exhausted, force a full document
// reload instead of a useless soft reset against an already-poisoned lazy
// import. A plain render crash elsewhere on the page must be unaffected.
describe('RouteChunk chunk-load retry and recovery (#220)', () => {
  // Rejects `failCount` times, then resolves - simulates a flaky network
  // that succeeds on a later attempt, within retryImport()'s retry budget.
  function makeFlakyImport<T>(component: T, failCount: number) {
    let calls = 0;
    return () => {
      calls += 1;
      if (calls <= failCount) {
        return Promise.reject(new Error(`simulated network hiccup #${calls}`));
      }
      return Promise.resolve({ default: component } as { default: T });
    };
  }

  it('recovers automatically from a route chunk import that fails transiently, with no user interaction required', async () => {
    vi.useFakeTimers();
    try {
      function Page() {
        return <p>page loaded</p>;
      }
      // retryImport() allows 2 retries (300ms, then 600ms backoff) before
      // giving up - failing exactly twice keeps this inside that budget.
      const flakyImport = makeFlakyImport(Page, 2);
      const LazyPage = lazyRoute(flakyImport);

      render(
        <RouteChunk
          component={LazyPage}
          loading={<p>loading...</p>}
          fallback={(retry) => <button onClick={retry}>retry</button>}
        />,
      );

      expect(screen.getByText('loading...')).toBeInTheDocument();

      // Advance past both backoff delays; retryImport() resolves internally
      // (it never hands React a rejected promise here), so no click/retry
      // is needed - this must self-heal.
      await vi.advanceTimersByTimeAsync(300);
      await vi.advanceTimersByTimeAsync(600);
      await vi.advanceTimersByTimeAsync(0);

      expect(screen.getByText('page loaded')).toBeInTheDocument();
      expect(screen.queryByText('loading...')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'retry' })).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('falls back to a full document reload (not a soft reset) once retryImport has exhausted its retries on a chunk that keeps failing', async () => {
    vi.useFakeTimers();
    // jsdom's window.location.reload is read-only/non-configurable on the
    // Location object itself, so vi.spyOn(window.location, 'reload') cannot
    // redefine it directly - swap the whole `window.location` for a plain
    // object that carries a spyable reload, then restore the original.
    const reloadSpy = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, reload: reloadSpy },
    });

    try {
      const alwaysFailingImport = () =>
        Promise.reject<{ default: ComponentType }>(new Error('chunk 404: stale build hash'));
      const LazyPage = lazyRoute(alwaysFailingImport);

      render(
        <RouteChunk
          component={LazyPage}
          loading={<p>loading...</p>}
          fallback={(retry) => <button onClick={retry}>retry</button>}
        />,
      );

      // Exhaust retryImport()'s own retries (300ms + 600ms backoff); it then
      // wraps the final rejection in ChunkLoadError, which the Suspense
      // boundary surfaces to AppErrorBoundary.
      await vi.advanceTimersByTimeAsync(300);
      await vi.advanceTimersByTimeAsync(600);
      await vi.advanceTimersByTimeAsync(0);

      const retryButton = screen.getByRole('button', { name: 'retry' });
      fireEvent.click(retryButton);

      expect(reloadSpy).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: originalLocation,
      });
    }
  });

  // Regression guard: RouteChunk's reload path must only fire for a genuine
  // ChunkLoadError. A component whose chunk loaded fine but whose render
  // throws a plain Error must still get the existing soft "Try again"
  // (reset()) behavior, with no reload at all.
  it('a plain render error (not a chunk-load failure) still gets the existing soft reset, never a reload', async () => {
    const reloadSpy = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, reload: reloadSpy },
    });

    try {
      let shouldThrow = true;
      function MaybeBoom() {
        if (shouldThrow) throw new Error('plain render crash, not a chunk import failure');
        return <p>recovered</p>;
      }
      // The chunk import itself succeeds immediately - only the rendered
      // component throws, so this must never be treated as a ChunkLoadError.
      const LazyMaybeBoom = lazy(() => Promise.resolve({ default: MaybeBoom }));

      render(
        <RouteChunk
          component={LazyMaybeBoom}
          loading={<p>loading...</p>}
          fallback={(retry) => (
            <button
              onClick={() => {
                shouldThrow = false;
                retry();
              }}
            >
              retry
            </button>
          )}
        />,
      );

      const retryButton = await screen.findByRole('button', { name: 'retry' });
      fireEvent.click(retryButton);

      expect(await screen.findByText('recovered')).toBeInTheDocument();
      expect(reloadSpy).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: originalLocation,
      });
    }
  });
});
