import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import {
  AppErrorBoundary,
  AppCrashFallback,
  RouteCrashFallback,
  RouteChunk,
  lazyRoute,
} from '@/components/AppErrorBoundary';

// Route-level code splitting: each page (and its dependencies, e.g.
// canvas-confetti pulled in by Practice) loads as a separate chunk on
// first navigation instead of bloating the initial bundle. lazyRoute()
// retries a failed chunk load with backoff before React.lazy() ever caches
// a rejection - see AppErrorBoundary.tsx (RouteChunk/lazyRoute) for why a
// bare `lazy(() => import(...))` cannot recover from that on its own.
const Home = lazyRoute(() => import('./pages/Home'));
const Practice = lazyRoute(() => import('./pages/Practice'));
const PracticeParticles = lazyRoute(() => import('./pages/PracticeParticles'));
const Progress = lazyRoute(() => import('./pages/Progress'));
const Settings = lazyRoute(() => import('./pages/Settings'));
const NotFound = lazyRoute(() => import('./pages/NotFound'));

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
              <RouteChunk
                key="/"
                component={Home}
                loading={<RouteLoadingFallback />}
                fallback={(retry) => <RouteCrashFallback reset={retry} />}
              />
            }
          />
          <Route
            path="/practice"
            element={
              <RouteChunk
                key="/practice"
                component={Practice}
                loading={<RouteLoadingFallback />}
                fallback={(retry) => <RouteCrashFallback reset={retry} />}
              />
            }
          />
          <Route
            path="/practice-particles"
            element={
              <RouteChunk
                key="/practice-particles"
                component={PracticeParticles}
                loading={<RouteLoadingFallback />}
                fallback={(retry) => <RouteCrashFallback reset={retry} />}
              />
            }
          />
          <Route
            path="/progress"
            element={
              <RouteChunk
                key="/progress"
                component={Progress}
                loading={<RouteLoadingFallback />}
                fallback={(retry) => <RouteCrashFallback reset={retry} />}
              />
            }
          />
          <Route
            path="/settings"
            element={
              <RouteChunk
                key="/settings"
                component={Settings}
                loading={<RouteLoadingFallback />}
                fallback={(retry) => <RouteCrashFallback reset={retry} />}
              />
            }
          />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route
            path="*"
            element={
              <RouteChunk
                key="*"
                component={NotFound}
                loading={<RouteLoadingFallback />}
                fallback={(retry) => <RouteCrashFallback reset={retry} />}
              />
            }
          />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </AppErrorBoundary>
);

export default App;
