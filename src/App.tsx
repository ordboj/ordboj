import type { ComponentType, LazyExoticComponent } from 'react';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import {
  AppErrorBoundary,
  AppCrashFallback,
  RouteCrashFallback,
  RouteChunk,
} from '@/components/AppErrorBoundary';
import { RequireAuth } from '@/components/RequireAuth';
import { lazyRoute } from '@/lib/utils';

// Route-level code splitting: each page (and its dependencies, e.g.
// canvas-confetti pulled in by Practice) loads as a separate chunk on
// first navigation instead of bloating the initial bundle. lazyRoute()
// retries a failed chunk load with backoff before React.lazy() ever caches
// a rejection - see src/lib/utils.ts (lazyRoute) and RouteChunk in
// AppErrorBoundary.tsx for why a bare `lazy(() => import(...))` cannot
// recover from that on its own.
const Home = lazyRoute(() => import('./pages/Home'));
const Practice = lazyRoute(() => import('./pages/Practice'));
const PracticeParticles = lazyRoute(() => import('./pages/PracticeParticles'));
const Progress = lazyRoute(() => import('./pages/Progress'));
const Settings = lazyRoute(() => import('./pages/Settings'));
const NotFound = lazyRoute(() => import('./pages/NotFound'));
const SignIn = lazyRoute(() => import('./pages/SignIn'));
const SignUp = lazyRoute(() => import('./pages/SignUp'));
const VerifyEmail = lazyRoute(() => import('./pages/VerifyEmail'));
const ResetPassword = lazyRoute(() => import('./pages/ResetPassword'));
const MagicLink = lazyRoute(() => import('./pages/MagicLink'));
const Privacy = lazyRoute(() => import('./pages/Privacy'));

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

function routed(path: string, component: LazyExoticComponent<ComponentType>) {
  return (
    <Route
      path={path}
      element={
        <RouteChunk
          key={path}
          component={component}
          loading={<RouteLoadingFallback />}
          fallback={(retry) => <RouteCrashFallback reset={retry} />}
        />
      }
    />
  );
}

const App = () => (
  <AppErrorBoundary fallback={(reset) => <AppCrashFallback reset={reset} />}>
    <TooltipProvider>
      <Sonner />
      <BrowserRouter>
        <Routes>
          {routed('/sign-in', SignIn)}
          {routed('/sign-up', SignUp)}
          {routed('/verify-email', VerifyEmail)}
          {routed('/reset-password', ResetPassword)}
          {routed('/magic-link', MagicLink)}
          {routed('/privacy', Privacy)}
          <Route element={<RequireAuth />}>
            {routed('/', Home)}
            {routed('/practice', Practice)}
            {routed('/practice-particles', PracticeParticles)}
            {routed('/progress', Progress)}
            {routed('/settings', Settings)}
            <Route path="/review" element={<Navigate to="/progress" replace />} />
          </Route>
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          {routed('*', NotFound)}
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </AppErrorBoundary>
);

export default App;
