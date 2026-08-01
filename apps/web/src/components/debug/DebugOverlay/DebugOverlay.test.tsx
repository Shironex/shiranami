import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MetricsSnapshot } from '@shiranami/contracts/bindings';
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

// The v2 payload: `{ ts, procs: [{ kind, pid, cpu, mem }] }`. v1's `cpu` and
// `heap` blocks described the Electron main process's V8 runtime and have no
// counterpart — see `lib/bridge/namespaces/debug.ts`.
function makeMain(overrides: Partial<MetricsSnapshot> = {}): MetricsSnapshot {
  return {
    ts: Date.now(),
    procs: [
      { kind: 'main', pid: 1001, cpu: 4.2, mem: 122880 },
      { kind: 'child', pid: 1002, cpu: 31.7, mem: 65536 },
    ],
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

  it('renders per-process rows from the backend snapshot', () => {
    useDebugStore.setState({ main: makeMain() });
    render(<DebugOverlay />);

    // The process label is v2's `kind`, not Electron's `type`.
    expect(screen.getByText('main')).toBeInTheDocument();
    expect(screen.getByText('child')).toBeInTheDocument();
    expect(screen.getByText('1002')).toBeInTheDocument();
    // cpu is rendered to one decimal place.
    expect(screen.getByText('31.7')).toBeInTheDocument();
  });

  it('shows no main-process heap section, which v2 does not measure', () => {
    useDebugStore.setState({ main: makeMain() });
    render(<DebugOverlay />);

    // There is no V8 in the backend, so a "heap used" row here could only be a
    // fabricated zero. The renderer's own heap is still reported below.
    expect(screen.queryByText('heap used')).not.toBeInTheDocument();
    expect(screen.queryByText('idle wakeups/s')).not.toBeInTheDocument();
    expect(screen.getByText('js heap')).toBeInTheDocument();
  });

  it('calls close when the esc button is clicked', () => {
    render(<DebugOverlay />);

    fireEvent.click(screen.getByRole('button', { name: 'Close debug panel' }));

    expect(useDebugStore.getState().open).toBe(false);
  });
});
