import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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

const queryClient = new QueryClient();

const App = () => (
  <AppErrorBoundary fallback={(reset) => <AppCrashFallback reset={reset} />}>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route
              path="/"
              element={
                <RouteErrorBoundary>
                  <Home />
                </RouteErrorBoundary>
              }
            />
            <Route
              path="/practice"
              element={
                <RouteErrorBoundary>
                  <Practice />
                </RouteErrorBoundary>
              }
            />
            <Route
              path="/progress"
              element={
                <RouteErrorBoundary>
                  <Progress />
                </RouteErrorBoundary>
              }
            />
            <Route
              path="/settings"
              element={
                <RouteErrorBoundary>
                  <Settings />
                </RouteErrorBoundary>
              }
            />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route
              path="*"
              element={
                <RouteErrorBoundary>
                  <NotFound />
                </RouteErrorBoundary>
              }
            />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </AppErrorBoundary>
);

export default App;
