import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import {
  AppErrorBoundary,
  AppCrashFallback,
  RouteCrashFallback,
  RouteErrorBoundary,
  downloadProgressBackup,
} from '@/components/AppErrorBoundary';

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
        <RouteErrorBoundary>
          <Boom />
        </RouteErrorBoundary>
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
