import { lazy, type ComponentType } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import {
  AppErrorBoundary,
  AppCrashFallback,
  RouteCrashFallback,
  RouteChunk,
  downloadProgressBackup,
} from '@/components/AppErrorBoundary';
import { lazyRoute } from '@/lib/utils';

// A component that throws unconditionally, used to exercise the boundary's
// catch path deterministically instead of relying on a real page crashing.
function Boom(): never {
  throw new Error('boom: simulated render crash');
}

// Exposes the router's in-memory location as text so a test can assert
// whether a click did or did not change it - the only reliable way to tell
// a plain <a> (jsdom no-op, MemoryRouter never sees it) apart from a
// react-router <Link> (calls history.push, MemoryRouter location changes)
// when both render an identical href="/" in the DOM.
function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location-display">{location.pathname}</div>;
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
        <AppErrorBoundary fallback={(reset) => <RouteCrashFallback reset={reset} />}>
          <Boom />
        </AppErrorBoundary>
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
        <AppErrorBoundary fallback={(reset) => <RouteCrashFallback reset={reset} />}>
          <Boom />
        </AppErrorBoundary>
      </MemoryRouter>,
    );

    const reloadLink = screen.getByRole('link', { name: /reload from the start/i });
    expect(reloadLink).toHaveAttribute('href', '/');
  });

  // href="/" alone does not prove this is an escape hatch: a react-router
  // <Link to="/"> renders the exact same anchor markup and attribute, so an
  // href assertion cannot catch someone swapping the plain <a> for a
  // <Link> (see #89). Clicking is the only thing that tells them apart: a
  // <Link> calls history.push and moves the MemoryRouter's in-memory
  // location, while a plain <a> does not navigate under jsdom (jsdom raises
  // "Not implemented: navigation" instead), so MemoryRouter never observes
  // it and the location must stay put.
  it('clicking "Reload from the start" does not change the in-memory router location (a Link would navigate; a plain anchor is a jsdom no-op)', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/practice']}>
        <LocationDisplay />
        <AppErrorBoundary fallback={(reset) => <RouteCrashFallback reset={reset} />}>
          <Boom />
        </AppErrorBoundary>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('location-display')).toHaveTextContent('/practice');

    const reloadLink = screen.getByRole('link', { name: /reload from the start/i });
    await user.click(reloadLink);

    expect(screen.getByTestId('location-display')).toHaveTextContent('/practice');

    // Positive control: the same harness MUST be able to observe a real
    // navigation, otherwise the assertion above could pass simply because
    // the click never reached the DOM. The sibling <Link>Home</Link> in the
    // same fallback proves the click path and the location display work.
    // Uses an exact match (not toHaveTextContent) because "/" is a
    // substring of "/practice", so a substring check here would pass
    // vacuously even if the location never actually changed.
    await user.click(screen.getByRole('link', { name: 'Home' }));
    expect(screen.getByTestId('location-display').textContent).toBe('/');
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

      // Root cause of the #335 CI flake: retryImport()'s *promise chain*
      // settling (guaranteed by the timer advances above) is not the same
      // event as React committing the resulting DOM update. Error-boundary
      // and Suspense/lazy re-renders are ordinarily synchronous here, which
      // is why a plain assertion right after the advances above passes
      // every time locally - but react-dom's Scheduler can still defer a
      // render slice through a real (not fake-timer-controlled) callback
      // under load, which is exactly the kind of variance a CI runner has
      // and a idle local machine does not. `vi.waitFor` (unlike
      // `screen.findByText`, which vitest's fake timers make hang - it only
      // recognizes Jest's fake timers) polls with vitest's own
      // pre-captured *real* timers, so it tolerates that deferred case
      // without weakening the assertion: it still fails loudly if the text
      // never appears within the timeout.
      await vi.waitFor(() => {
        expect(screen.getByText('page loaded')).toBeInTheDocument();
      });
      expect(screen.queryByText('loading...')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'retry' })).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  // Regression test for #335 (CI flake in the "recovers automatically" test
  // above). This isolates the exact mechanism a plain synchronous assertion
  // was unsafe against, with NO dependency on CI load or real elapsed time,
  // so it reproduces every run rather than intermittently: unlike the flaky
  // case, this import never rejects, so there is no retryImport() backoff
  // (no setTimeout) standing between "resolve the chunk" and "commit the
  // DOM" - only React's own Suspense/lazy re-render is between them. That
  // re-render is scheduled by react-dom's Scheduler via a real MessageChannel
  // task (jsdom implements MessageChannel), which vi.useFakeTimers() does
  // not intercept - only setTimeout/setInterval/Date are faked, not
  // postMessage delivery. So `await vi.advanceTimersByTimeAsync(0)` can
  // return before that MessageChannel task has actually run, and a bare
  // `screen.getByText(...)` right after it is checking the DOM before React
  // has committed. `vi.waitFor` closes that gap by polling with vitest's
  // real timers until the commit lands (or failing loudly if it never
  // does), which is the same fix the flaky test above needed - this test
  // pins that it is required (not incidental) by first proving a bare
  // synchronous assertion fails deterministically without it. If this ever
  // starts passing without the `vi.waitFor` wrapper below, the fix for #335
  // has been silently invalidated by an upstream change in fake-timers or
  // react-dom's scheduling and needs re-review, not deletion.
  it('regression #335: a resolved chunk import (no backoff, so no timer stands between resolution and commit) still requires waiting for the Suspense/lazy commit, because that commit is scheduled via a real MessageChannel task that fake timers do not advance', async () => {
    vi.useFakeTimers();
    try {
      function Page() {
        return <p>page loaded</p>;
      }
      // Resolves on the very first call - failCount 0 means retryImport()
      // never hits its setTimeout-based backoff at all, so the only thing
      // standing between "import resolved" and "DOM shows the page" is
      // React's own re-render scheduling, isolating that mechanism.
      const flakyImport = makeFlakyImport(Page, 0);
      const LazyPage = lazyRoute(flakyImport);

      render(
        <RouteChunk
          component={LazyPage}
          loading={<p>loading...</p>}
          fallback={(retry) => <button onClick={retry}>retry</button>}
        />,
      );

      expect(screen.getByText('loading...')).toBeInTheDocument();

      // Nothing left to advance a backoff timer past - the import already
      // resolved synchronously on render. This flush exists only to settle
      // any pending microtasks fake timers do control.
      await vi.advanceTimersByTimeAsync(0);

      // The commit has not necessarily landed yet (see comment above) - only
      // vi.waitFor's real-timer polling can observe it reliably.
      await vi.waitFor(() => {
        expect(screen.getByText('page loaded')).toBeInTheDocument();
      });
      expect(screen.queryByText('loading...')).not.toBeInTheDocument();
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

      // See the matching comment in the "recovers automatically" test above
      // for the root cause of the #335 CI flake this test was reported
      // against (CI runs 31280020229, 31280581936): the "retry" button's
      // commit can occasionally land a beat after the timer advances above,
      // under CI's timing only. `vi.waitFor` tolerates that without
      // weakening what is asserted.
      const retryButton = await vi.waitFor(() => screen.getByRole('button', { name: 'retry' }));
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

  // Regression guard, the mirror image of the "plain render error" case
  // above: a module that fetched fine but threw *while its body evaluated*
  // (e.g. a ReferenceError from a genuine code bug) must not be retried or
  // wrapped as a ChunkLoadError either. isChunkFetchFailure() (lib/utils.ts)
  // only recognizes fetch/network-shaped failures; anything else propagates
  // on the first attempt so RouteChunk gives it the ordinary soft reset, not
  // a reload loop that would just reproduce the same code bug forever.
  it('does not retry or reload for a module-evaluation error (the import rejected because the module body threw, not a network/chunk problem): it propagates unretried to the ordinary soft-reset fallback', async () => {
    const reloadSpy = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, reload: reloadSpy },
    });

    try {
      let importAttempts = 0;
      const moduleEvaluationImport = () => {
        importAttempts += 1;
        // No "fetch"/"chunk"/"network" wording in this message - this is
        // what a real bundler surfaces for a module whose top-level code
        // threw while running, as opposed to a failed network request for
        // the chunk itself.
        return Promise.reject<{ default: ComponentType }>(new ReferenceError('x is not defined'));
      };
      const LazyPage = lazyRoute(moduleEvaluationImport);

      render(
        <RouteChunk
          component={LazyPage}
          loading={<p>loading...</p>}
          fallback={(retry) => <button onClick={retry}>retry</button>}
        />,
      );

      // No backoff to wait out: retryImport() only delays and retries a
      // failure it classifies as a fetch/chunk problem. A module-evaluation
      // error is rejected on the very first attempt, so the fallback must
      // appear immediately, with the import having been attempted exactly
      // once - if this ever retried, the assertion below would need a
      // vi.advanceTimersByTimeAsync() to pass, and it does not have one.
      const retryButton = await screen.findByRole('button', { name: 'retry' });
      expect(importAttempts).toBe(1);

      fireEvent.click(retryButton);
      expect(reloadSpy).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: originalLocation,
      });
    }
  });
});
