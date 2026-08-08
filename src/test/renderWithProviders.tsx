import type { ReactElement, ReactNode } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';

interface RenderWithProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  /** Initial route(s) for the in-memory router. Defaults to "/". */
  route?: string;
}

/**
 * Wraps a component with the same providers App.tsx supplies (react-query,
 * tooltip, router) so page/component tests see the app they'd actually run
 * in, without pulling in the real BrowserRouter (which touches the real
 * address bar) or the toast portals (which no test under this harness reads
 * from).
 */
export function renderWithProviders(ui: ReactElement, options: RenderWithProvidersOptions = {}) {
  const { route = '/', ...renderOptions } = options;

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <MemoryRouter
            initialEntries={[route]}
            future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          >
            {children}
          </MemoryRouter>
        </TooltipProvider>
      </QueryClientProvider>
    );
  }

  return render(ui, { wrapper: Wrapper, ...renderOptions });
}
