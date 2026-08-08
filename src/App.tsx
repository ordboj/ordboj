import { lazy, Suspense } from 'react';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import {
  AppErrorBoundary,
  AppCrashFallback,
  RouteErrorBoundary,
} from '@/components/AppErrorBoundary';

// Route-level code splitting: each page (and its dependencies, e.g.
// canvas-confetti pulled in by Practice) loads as a separate chunk on
// first navigation instead of bloating the initial bundle.
const Home = lazy(() => import('./pages/Home'));
const Practice = lazy(() => import('./pages/Practice'));
const Progress = lazy(() => import('./pages/Progress'));
const Settings = lazy(() => import('./pages/Settings'));
const NotFound = lazy(() => import('./pages/NotFound'));

/** Minimal, dependency-free fallback shown while a route chunk loads. */
function RouteLoadingFallback() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground"
    >
      <p className="text-muted-foreground">Loading…</p>
    </div>
  );
}

const App = () => (
  <AppErrorBoundary fallback={(reset) => <AppCrashFallback reset={reset} />}>
    <TooltipProvider>
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route
            path="/"
            element={
              <RouteErrorBoundary key="/">
                <Suspense fallback={<RouteLoadingFallback />}>
                  <Home />
                </Suspense>
              </RouteErrorBoundary>
            }
          />
          <Route
            path="/practice"
            element={
              <RouteErrorBoundary key="/practice">
                <Suspense fallback={<RouteLoadingFallback />}>
                  <Practice />
                </Suspense>
              </RouteErrorBoundary>
            }
          />
          <Route
            path="/progress"
            element={
              <RouteErrorBoundary key="/progress">
                <Suspense fallback={<RouteLoadingFallback />}>
                  <Progress />
                </Suspense>
              </RouteErrorBoundary>
            }
          />
          <Route
            path="/settings"
            element={
              <RouteErrorBoundary key="/settings">
                <Suspense fallback={<RouteLoadingFallback />}>
                  <Settings />
                </Suspense>
              </RouteErrorBoundary>
            }
          />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route
            path="*"
            element={
              <RouteErrorBoundary key="*">
                <Suspense fallback={<RouteLoadingFallback />}>
                  <NotFound />
                </Suspense>
              </RouteErrorBoundary>
            }
          />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </AppErrorBoundary>
);

export default App;
