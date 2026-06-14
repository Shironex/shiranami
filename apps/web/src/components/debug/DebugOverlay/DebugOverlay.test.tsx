import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MainMetricsSnapshot } from '@shiranami/contracts';
import { useDebugStore, type RendererMetrics } from '@/stores/useDebugStore';

import DebugOverlay from './DebugOverlay';

const EMPTY_RENDERER: RendererMetrics = {
  fps: 0,
  frameP95: 0,
  jsHeap: null,
  timers: null,
  renderStats: [],
  storeHz: {},
};

function makeMain(overrides: Partial<MainMetricsSnapshot> = {}): MainMetricsSnapshot {
  return {
    ts: Date.now(),
    cpu: { percentCPUUsage: 8.4, idleWakeupsPerSecond: 120 },
    heap: { totalHeapSize: 81920, usedHeapSize: 53248, heapSizeLimit: 2097152 },
    procs: [{ type: 'GPU', pid: 1002, cpu: 31.7, mem: 65536 }],
    ...overrides,
  };
}

function resetStore(): void {
  useDebugStore.setState({ open: false, main: null, renderer: EMPTY_RENDERER, longTasks: [] });
}

beforeEach(resetStore);
afterEach(resetStore);

describe('DebugOverlay', () => {
  it('shows the waiting placeholder before the first main-process sample', () => {
    render(<DebugOverlay />);

    expect(screen.getByText('waiting for samples…')).toBeInTheDocument();
  });

  it('renders per-process rows from the main snapshot', () => {
    useDebugStore.setState({ main: makeMain() });
    render(<DebugOverlay />);

    expect(screen.getByText('GPU')).toBeInTheDocument();
    expect(screen.getByText('1002')).toBeInTheDocument();
    // cpu is rendered to one decimal place.
    expect(screen.getByText('31.7')).toBeInTheDocument();
  });

  it('calls close when the esc button is clicked', () => {
    render(<DebugOverlay />);

    fireEvent.click(screen.getByRole('button', { name: 'Close debug panel' }));

    expect(useDebugStore.getState().open).toBe(false);
  });
});
