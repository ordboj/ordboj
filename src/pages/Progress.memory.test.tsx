import { describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/renderWithProviders';
import { releaseJsdomSelectorCache } from '@/test/releaseJsdomSelectorCache';
import Progress from '@/pages/Progress';

// Same boundaries as the other Progress suites: real VERB_DATA through
// getAllConjugatedVerbs(), SRS and settings mocked. This file must not call
// querySelector itself. The measurement is what Progress retains after the
// rendered rows are gone.
vi.mock('@/hooks/useSrsProgress', () => ({
  useSrsProgress: () => ({
    srsStates: {},
  }),
}));

vi.mock('@/hooks/useSettings', () => ({
  useSettings: () => ({
    isLoading: false,
    settings: {
      practiceMode: 'typing',
      showExamples: false,
      autoplayAudio: false,
      muteAudio: true,
      dailyGoal: 20,
      cefrLevels: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
    },
    updateSettings: vi.fn(),
  }),
}));

const gc = (globalThis as { gc?: (options?: { type?: string; execution?: string }) => void }).gc;

function majorGc(): void {
  if (!gc) throw new Error('global.gc is missing');
  gc({ type: 'major', execution: 'sync' });
  gc({ type: 'major', execution: 'sync' });
}

function heapUsed(): number {
  majorGc();
  return process.memoryUsage().heapUsed;
}

function findShowMore(root: Node): HTMLButtonElement | null {
  if (root instanceof HTMLButtonElement && root.textContent === 'Show more verbs') return root;
  for (const child of root.childNodes) {
    const found = findShowMore(child);
    if (found) return found;
  }
  return null;
}

function countBodyRows(root: Node): number {
  let count = 0;
  const visit = (node: Node) => {
    if (node instanceof HTMLTableRowElement && node.parentElement?.tagName === 'TBODY') count += 1;
    for (const child of node.childNodes) visit(child);
  };
  visit(root);
  return count;
}

async function mountFullVerbList(): Promise<number> {
  const view = renderWithProviders(<Progress />, {
    route: '/progress',
  });
  const container = view.container;
  await waitFor(() => {
    if (!container.textContent?.includes('Showing')) {
      throw new Error('Progress did not finish loading verbs');
    }
  });

  let guard = 0;
  let button = findShowMore(container);
  while (button && guard < 40) {
    await act(async () => {
      fireEvent.click(button!);
    });
    guard += 1;
    button = findShowMore(container);
  }
  const rows = countBodyRows(container);
  view.unmount();
  cleanup();
  // afterEach releases the cache too late: this assertion measures inside
  // the test, before that hook runs.
  releaseJsdomSelectorCache();
  return rows;
}

describe('Progress page - retained heap after unmount (ORD-71)', () => {
  it('drops the mounted verb DOM after unmount instead of retaining it', async () => {
    // npm test / vitest.config.ts execArgv starts workers with --expose-gc.
    // Without that, a heap assertion cannot tell a leak from garbage that
    // has not been collected yet.
    if (!gc) {
      throw new Error('global.gc is missing; run the suite with node --expose-gc');
    }

    const baseline = heapUsed();
    const rows: number[] = [];
    const samples: number[] = [];

    for (let cycle = 0; cycle < 2; cycle++) {
      rows.push(await mountFullVerbList());
      samples.push(heapUsed());
    }

    const retained = samples[samples.length - 1]! - baseline;
    const growth = samples[samples.length - 1]! - samples[0]!;
    const mb = (bytes: number) => Math.round((bytes / 1024 / 1024) * 10) / 10;
    const detail = `baseline ${mb(baseline)}MB, samples ${samples.map(mb).join(' -> ')}MB, rows ${rows.join(',')}`;

    // A full mount is ~1000 verbs in two layouts. Keeping that tree after
    // unmount is on the order of 150MB. Headroom above the one-time warmup
    // (compiled render path, about 20MB) and below one retained copy.
    expect(rows[0], detail).toBeGreaterThan(500);
    expect(growth, detail).toBeLessThan(25 * 1024 * 1024);
    expect(retained, detail).toBeLessThan(40 * 1024 * 1024);
  }, 180_000);
});
