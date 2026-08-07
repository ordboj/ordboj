import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '@/App';

// The "sonner" toast library crashes when rendered in jsdom (it dereferences
// the result of window.matchMedia() without the guards a real browser gives
// it), independent of anything in App.tsx or the error-boundary work under
// test here. Without this it would appear to the outer AppErrorBoundary as
// an app-wide crash on every render, masking the actual behavior this suite
// is verifying. Mocked as a jsdom-incompatible boundary, same rationale as
// the canvas-confetti mock in src/test/setup.ts.
vi.mock('sonner', () => ({
  Toaster: () => null,
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  }),
}));

// This suite exercises the acceptance criteria for issue #18 end-to-end
// through the real App.tsx wiring (AppErrorBoundary + per-route
// RouteErrorBoundary): a crash confined to one route must not take down the
// rest of the app, and the other routes must stay reachable afterwards.
//
// The four page modules are mocks-owned-as-boundary here (frontend-expert
// owns their real implementation); the module under test is App.tsx / the
// error boundary wiring around react-router, not what Home/Progress/Settings
// actually render. Practice is mocked to throw unconditionally so the crash
// is deterministic instead of depending on real page internals.
vi.mock('@/pages/Home', () => ({
  default: function MockHome() {
    return (
      <div>
        <h1>Home Page</h1>
      </div>
    );
  },
}));

vi.mock('@/pages/Practice', () => ({
  default: function MockPractice(): never {
    throw new Error('boom: simulated Practice crash');
  },
}));

vi.mock('@/pages/Progress', () => ({
  default: function MockProgress() {
    return <h1>Progress Page</h1>;
  },
}));

vi.mock('@/pages/Settings', () => ({
  default: function MockSettings() {
    return <h1>Settings Page</h1>;
  },
}));

beforeEach(() => {
  // Boundary componentDidCatch always console.error's the caught error; that
  // is expected here, not something to let spam (or fail) the test run.
  vi.spyOn(console, 'error').mockImplementation(() => {});
  window.history.pushState({}, '', '/');
});

describe('route-level crash containment (issue #18)', () => {
  it('a route that throws renders the RouteErrorBoundary fallback, not a blank page or an unhandled exception', () => {
    window.history.pushState({}, '', '/practice');

    expect(() => render(<App />)).not.toThrow();

    expect(screen.getByText(/this page hit a snag/i)).toBeInTheDocument();
    // The rest of the chrome (Toaster/Sonner/TooltipProvider) survives too -
    // this is a route boundary catching, not the outer AppErrorBoundary.
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
  });

  // BUG: navigating away from a crashed route does not recover the app -
  // it keeps showing the stale RouteCrashFallback instead of the newly
  // matched route's real content, until the user manually clicks
  // "Try again". Root cause: every <Route> in src/App.tsx wraps its page in
  // the *same* RouteErrorBoundary component type
  // (src/components/AppErrorBoundary.tsx:188-194), at the same position in
  // the element tree under <Routes>. When react-router switches the matched
  // route, React reconciles this as a props update (new `children`) on the
  // *same* class component instance rather than an unmount/remount, so
  // AppErrorBoundary's `hasError` state (src/components/AppErrorBoundary.tsx:64-93)
  // is never cleared and render() keeps returning the old fallback for the
  // new route too. This violates the ticket's "other routes remain
  // reachable/navigable" acceptance criterion for ordinary navigation
  // (Link click, browser back/forward, programmatic navigate) - the route
  // only recovers if the user notices and clicks "Try again" first.
  // Likely fix: key each per-route RouteErrorBoundary usage in App.tsx on
  // the route path (e.g. `<RouteErrorBoundary key={path}>`), or reset
  // hasError in componentDidUpdate when `children` changes.
  // Owners: frontend-expert (src/components/AppErrorBoundary.tsx),
  // staff-engineer (src/App.tsx route wiring).
  it.fails(
    'other routes remain reachable by direct navigation after a route has crashed',
    async () => {
      window.history.pushState({}, '', '/practice');
      render(<App />);
      expect(screen.getByText(/this page hit a snag/i)).toBeInTheDocument();

      // Simulate the user navigating away via the browser (back button / new
      // URL) rather than clicking a link inside the crashed component.
      window.history.pushState({}, '', '/progress');
      window.dispatchEvent(new PopStateEvent('popstate'));

      expect(await screen.findByText('Progress Page')).toBeInTheDocument();
    },
  );

  // Same bug as above, reached via the fallback's own "Home" link instead of
  // raw history navigation - confirms it is not a jsdom/popstate artifact.
  it.fails(
    'the crashed route\'s own fallback navigation links reach the other routes ("Home")',
    async () => {
      const user = userEvent.setup();
      window.history.pushState({}, '', '/practice');
      render(<App />);

      const homeLink = screen.getByRole('link', { name: 'Home' });
      await user.click(homeLink);

      expect(await screen.findByText('Home Page')).toBeInTheDocument();
    },
  );

  it('a route that never throws is unaffected: Settings renders normally without any fallback', () => {
    window.history.pushState({}, '', '/settings');
    render(<App />);

    expect(screen.getByText('Settings Page')).toBeInTheDocument();
    expect(screen.queryByText(/this page hit a snag/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
  });
});
