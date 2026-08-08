import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '@/App';

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

  // Regression test for the route-reachability bug fixed in f4bd9c8: every
  // <Route> in src/App.tsx now wraps its page in a RouteErrorBoundary keyed
  // on the route path (e.g. `<RouteErrorBoundary key="/progress">`), so
  // react-router switching the matched route unmounts/remounts a fresh
  // boundary instance instead of reconciling onto the crashed one. Without
  // that key, AppErrorBoundary's `hasError` state would survive the route
  // change and render() would keep returning the stale fallback for the new
  // route too, violating the ticket's "other routes remain
  // reachable/navigable" acceptance criterion.
  it('other routes remain reachable by direct navigation after a route has crashed', async () => {
    window.history.pushState({}, '', '/practice');
    render(<App />);
    expect(screen.getByText(/this page hit a snag/i)).toBeInTheDocument();

    // Simulate the user navigating away via the browser (back button / new
    // URL) rather than clicking a link inside the crashed component.
    window.history.pushState({}, '', '/progress');
    window.dispatchEvent(new PopStateEvent('popstate'));

    expect(await screen.findByText('Progress Page')).toBeInTheDocument();
    expect(screen.queryByText(/this page hit a snag/i)).not.toBeInTheDocument();
  });

  // Same fix as above, reached via the fallback's own "Home" link instead of
  // raw history navigation - confirms it is not a jsdom/popstate artifact.
  it('the crashed route\'s own fallback navigation links reach the other routes ("Home")', async () => {
    const user = userEvent.setup();
    window.history.pushState({}, '', '/practice');
    render(<App />);

    const homeLink = screen.getByRole('link', { name: 'Home' });
    await user.click(homeLink);

    expect(await screen.findByText('Home Page')).toBeInTheDocument();
    expect(screen.queryByText(/this page hit a snag/i)).not.toBeInTheDocument();
  });

  it('a route that never throws is unaffected: Settings renders normally without any fallback', () => {
    window.history.pushState({}, '', '/settings');
    render(<App />);

    expect(screen.getByText('Settings Page')).toBeInTheDocument();
    expect(screen.queryByText(/this page hit a snag/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
  });
});
