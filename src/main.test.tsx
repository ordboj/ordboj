import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StrictMode } from 'react';

// react-dom/client is the mount boundary: swapping createRoot for a spy lets
// this test inspect exactly what element tree main.tsx hands to render(),
// without actually reconciling the full app (routing, providers, etc.) into
// jsdom.
const renderMock = vi.fn();
const createRootMock = vi.fn(() => ({ render: renderMock }));

vi.mock('react-dom/client', () => ({
  createRoot: createRootMock,
}));

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>';
});

describe('main.tsx entry point (#105 - React StrictMode)', () => {
  it('mounts the app wrapped in React.StrictMode', async () => {
    await import('./main');

    expect(createRootMock).toHaveBeenCalledTimes(1);
    expect(renderMock).toHaveBeenCalledTimes(1);

    const rendered = renderMock.mock.calls[0]?.[0];
    expect(rendered.type).toBe(StrictMode);
    // The single child of <StrictMode> must be a rendered element (App),
    // not the app mounted directly at the root.
    expect(rendered.props.children).toBeDefined();
    expect(rendered.props.children.type).not.toBe(StrictMode);
  });
});
