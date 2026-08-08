import type { ReactElement, ReactNode } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';

interface RenderWithProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  /** Initial route(s) for the in-memory router. Defaults to "/". */
  route?: string;
}

/**
 * Wraps a component with the same providers App.tsx supplies (tooltip,
 * router) so page/component tests see the app they'd actually run in,
 * without pulling in the real BrowserRouter (which touches the real
 * address bar) or the toast portals (which no test under this harness reads
 * from).
 *
 * react-query was dropped from the provider tree in App.tsx as part of
 * issue #115 (dead-dependency removal: no page/component ever called a
 * react-query hook) - this wrapper must mirror App.tsx's actual tree, so it
 * no longer wraps in QueryClientProvider either.
 */
export function renderWithProviders(ui: ReactElement, options: RenderWithProvidersOptions = {}) {
  const { route = '/', ...renderOptions } = options;

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <TooltipProvider>
        <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
      </TooltipProvider>
    );
  }

  return render(ui, { wrapper: Wrapper, ...renderOptions });
}
