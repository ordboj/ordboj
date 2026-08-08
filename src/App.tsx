import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Practice from './pages/Practice';
import Progress from './pages/Progress';
import Settings from './pages/Settings';
import NotFound from './pages/NotFound';
import {
  AppErrorBoundary,
  AppCrashFallback,
  RouteErrorBoundary,
} from '@/components/AppErrorBoundary';

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
                <Home />
              </RouteErrorBoundary>
            }
          />
          <Route
            path="/practice"
            element={
              <RouteErrorBoundary key="/practice">
                <Practice />
              </RouteErrorBoundary>
            }
          />
          <Route
            path="/progress"
            element={
              <RouteErrorBoundary key="/progress">
                <Progress />
              </RouteErrorBoundary>
            }
          />
          <Route
            path="/settings"
            element={
              <RouteErrorBoundary key="/settings">
                <Settings />
              </RouteErrorBoundary>
            }
          />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route
            path="*"
            element={
              <RouteErrorBoundary key="*">
                <NotFound />
              </RouteErrorBoundary>
            }
          />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </AppErrorBoundary>
);

export default App;
